import { createId } from "@/lib/store";
import { buildEdges, mergeConcepts } from "@/lib/services/graph";
import {
  GeminiSemanticConcept,
  GeminiSemanticExtraction,
  GeminiSemanticRelationship,
  GeminiUnavailableError,
  isGeminiConfigured,
  requestGeminiDocumentEmbeddings,
  requestGeminiSemanticExtraction
} from "@/lib/services/gemini";
import { chunkText, extractCandidateConcepts } from "@/lib/services/ingestion";
import {
  ChunkRecord,
  ConceptEdgeRecord,
  ConceptRecord,
  EdgeType,
  ModuleRecord,
  SourceProcessorKind,
  SourceDocument
} from "@/lib/types";

export type SourceProcessorPreference = "auto" | "gemini" | "heuristic";
export type SourceProcessor = SourceProcessorKind;

export interface SourceIngestionResult {
  processor: SourceProcessor;
  fallbackReason?: string;
  chunks: ChunkRecord[];
  concepts: ConceptRecord[];
  edges: ConceptEdgeRecord[];
}

interface SemanticArtifacts {
  processor: SourceProcessor;
  fallbackReason?: string;
  chunks: ChunkRecord[];
  concepts: GeminiSemanticConcept[];
  relationships: GeminiSemanticRelationship[];
}

async function buildChunksForSource(
  source: SourceDocument,
  allowGeminiEmbeddings = true
): Promise<{
  chunks: ChunkRecord[];
  embeddingFallbackReason?: string;
}> {
  const chunks = chunkText(source);

  if (!chunks.length || !allowGeminiEmbeddings || !isGeminiConfigured()) {
    return { chunks };
  }

  try {
    const embeddings = await requestGeminiDocumentEmbeddings({
      texts: chunks.map((chunk) => ({
        text: chunk.text,
        title: source.title
      }))
    });

    const embeddedChunks = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index] ?? chunk.embedding
    }));

    return { chunks: embeddedChunks };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini embeddings failed";
    return {
      chunks,
      embeddingFallbackReason: `Gemini embeddings fallback activated: ${message}`
    };
  }
}

function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dedupeStrings(values: string[], limit: number): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function fallbackEvidenceFromChunks(chunks: ChunkRecord[]): string[] {
  return chunks.length ? [chunks[0].text.slice(0, 220)] : [];
}

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(normalizeValue(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeValue(right).split(" ").filter(Boolean));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  });

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function resolveEvidenceRefs(
  excerpts: string[],
  chunks: ChunkRecord[],
  sourceId: string
): ConceptRecord["evidenceRefs"] {
  const safeExcerpts = dedupeStrings(excerpts, 4);
  const candidates = safeExcerpts.length ? safeExcerpts : fallbackEvidenceFromChunks(chunks);
  const evidenceRefs: ConceptRecord["evidenceRefs"] = [];

  for (const excerpt of candidates) {
    const normalizedExcerpt = normalizeValue(excerpt);
    let bestChunk: ChunkRecord | undefined;
    let bestScore = 0;

    for (const chunk of chunks) {
      const normalizedChunk = normalizeValue(chunk.text);
      if (!normalizedChunk) {
        continue;
      }

      const containsMatch =
        normalizedChunk.includes(normalizedExcerpt) || normalizedExcerpt.includes(normalizedChunk);
      const score = containsMatch ? 1 : overlapScore(excerpt, chunk.text);

      if (score > bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    if (!bestChunk) {
      continue;
    }

    evidenceRefs.push({
      id: createId("evidence"),
      sourceId,
      chunkId: bestChunk.id,
      excerpt: excerpt.slice(0, 220)
    });
  }

  return dedupeEvidenceRefs(evidenceRefs);
}

function dedupeEvidenceRefs(evidenceRefs: ConceptRecord["evidenceRefs"]): ConceptRecord["evidenceRefs"] {
  const unique = new Map<string, ConceptRecord["evidenceRefs"][number]>();

  evidenceRefs.forEach((evidence) => {
    unique.set(`${evidence.chunkId}:${normalizeValue(evidence.excerpt)}`, evidence);
  });

  return Array.from(unique.values()).slice(0, 6);
}

async function mapHeuristicArtifacts(
  source: SourceDocument,
  moduleRecord: ModuleRecord,
  allowGeminiEmbeddings: boolean
): Promise<SemanticArtifacts> {
  const { chunks, embeddingFallbackReason } = await buildChunksForSource(source, allowGeminiEmbeddings);
  const concepts = extractCandidateConcepts(chunks, moduleRecord);
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const relationships = buildEdges(concepts, chunks, [])
    .map((edge) => {
      const sourceConcept = conceptById.get(edge.sourceConceptId);
      const targetConcept = conceptById.get(edge.targetConceptId);

      if (!sourceConcept || !targetConcept) {
        return null;
      }

      return {
        sourceTitle: sourceConcept.title,
        targetTitle: targetConcept.title,
        type: edge.type,
        weight: edge.weight,
        evidence: edge.evidenceRefs.map((evidence) => evidence.excerpt)
      };
    })
    .filter((relationship): relationship is GeminiSemanticRelationship => Boolean(relationship));

  return {
    processor: "heuristic",
    fallbackReason: embeddingFallbackReason,
    chunks,
    concepts: concepts.map((concept) => ({
      title: concept.title,
      summary: concept.summary,
      confidence: concept.confidence,
      evidence: concept.evidenceRefs.map((evidence) => evidence.excerpt)
    })),
    relationships
  };
}

async function normalizeGeminiArtifacts(
  source: SourceDocument,
  extraction: GeminiSemanticExtraction
): Promise<SemanticArtifacts> {
  const { chunks, embeddingFallbackReason } = await buildChunksForSource(source, true);

  return {
    processor: "gemini",
    fallbackReason: embeddingFallbackReason,
    chunks,
    concepts: extraction.concepts.map((concept) => ({
      title: toTitleCase(concept.title.trim()),
      summary: concept.summary.trim().slice(0, 240),
      confidence: Number(Math.max(0, Math.min(0.99, concept.confidence)).toFixed(2)),
      evidence: dedupeStrings(concept.evidence, 4)
    })),
    relationships: extraction.relationships.map((relationship) => ({
      sourceTitle: toTitleCase(relationship.sourceTitle.trim()),
      targetTitle: toTitleCase(relationship.targetTitle.trim()),
      type: relationship.type,
      weight: Number(Math.max(0.1, Math.min(0.99, relationship.weight)).toFixed(2)),
      evidence: dedupeStrings(relationship.evidence, 4)
    }))
  };
}

async function buildSemanticArtifacts(
  source: SourceDocument,
  moduleRecord: ModuleRecord,
  preferredProcessor: SourceProcessorPreference
): Promise<SemanticArtifacts> {
  if (preferredProcessor === "heuristic") {
    return mapHeuristicArtifacts(source, moduleRecord, false);
  }

  if (!isGeminiConfigured()) {
    const fallback = await mapHeuristicArtifacts(source, moduleRecord, false);
    return {
      ...fallback,
      fallbackReason: joinFallbackReasons("Gemini skipped because GEMINI_API_KEY is not configured", fallback.fallbackReason)
    };
  }

  try {
    const extraction = await requestGeminiSemanticExtraction({
      moduleTitle: moduleRecord.title,
      sourceTitle: source.title,
      sourceContent: source.content
    });
    const normalized = await normalizeGeminiArtifacts(source, extraction);

    if (!normalized.concepts.length) {
      throw new GeminiUnavailableError("Gemini returned no concepts");
    }

    return normalized;
  } catch (error) {
    const fallback = await mapHeuristicArtifacts(source, moduleRecord, false);
    const message = error instanceof Error ? error.message : "Gemini request failed";

    return {
      ...fallback,
      fallbackReason: joinFallbackReasons(`Gemini fallback activated: ${message}`, fallback.fallbackReason)
    };
  }
}

function joinFallbackReasons(...values: Array<string | undefined>): string | undefined {
  const parts = values.map((value) => value?.trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function materializeConcepts(
  concepts: GeminiSemanticConcept[],
  chunks: ChunkRecord[],
  source: SourceDocument,
  moduleRecord: ModuleRecord
): ConceptRecord[] {
  return concepts.map((concept) => ({
    id: createId("concept"),
    userId: moduleRecord.userId,
    title: concept.title,
    summary: concept.summary,
    moduleIds: [moduleRecord.id],
    sourceIds: [source.id],
    evidenceRefs: resolveEvidenceRefs(concept.evidence, chunks, source.id),
    masteryScore: 0.35,
    confidence: Number(Math.max(0.15, Math.min(0.99, concept.confidence)).toFixed(2)),
    status: "active",
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function resolveConceptByTitle(concepts: ConceptRecord[], title: string): ConceptRecord | undefined {
  const normalizedTitle = normalizeValue(title);

  return (
    concepts.find((concept) => normalizeValue(concept.title) === normalizedTitle) ??
    concepts.find((concept) => normalizeValue(concept.title).includes(normalizedTitle)) ??
    concepts.find((concept) => normalizedTitle.includes(normalizeValue(concept.title))) ??
    concepts
      .map((concept) => ({
        concept,
        score: overlapScore(concept.title, title)
      }))
      .filter((match) => match.score >= 0.5)
      .sort((left, right) => right.score - left.score)[0]?.concept
  );
}

function mergeEdgeRecords(
  existingEdges: ConceptEdgeRecord[],
  incomingEdges: ConceptEdgeRecord[]
): ConceptEdgeRecord[] {
  const merged = [...existingEdges.filter((edge) => !edge.deleted)];

  incomingEdges.forEach((incoming) => {
    const existing = merged.find(
      (edge) =>
        edge.sourceConceptId === incoming.sourceConceptId && edge.targetConceptId === incoming.targetConceptId
    );

    if (existing) {
      existing.type = incoming.type;
      existing.weight = Number(Math.max(existing.weight, incoming.weight).toFixed(2));
      existing.evidenceRefs = dedupeEvidenceRefs([...existing.evidenceRefs, ...incoming.evidenceRefs]).slice(0, 6);
      existing.updatedAt = new Date().toISOString();
      return;
    }

    merged.push(incoming);
  });

  return merged;
}

function materializeSemanticEdges(input: {
  relationships: GeminiSemanticRelationship[];
  concepts: ConceptRecord[];
  existingEdges: ConceptEdgeRecord[];
  chunks: ChunkRecord[];
  source: SourceDocument;
  userId: string;
}): ConceptEdgeRecord[] {
  const nextEdges: ConceptEdgeRecord[] = [];

  input.relationships.forEach((relationship) => {
    const sourceConcept = resolveConceptByTitle(input.concepts, relationship.sourceTitle);
    const targetConcept = resolveConceptByTitle(input.concepts, relationship.targetTitle);

    if (!sourceConcept || !targetConcept || sourceConcept.id === targetConcept.id) {
      return;
    }

    nextEdges.push({
      id: createId("edge"),
      userId: input.userId,
      sourceConceptId: sourceConcept.id,
      targetConceptId: targetConcept.id,
      type: relationship.type as EdgeType,
      weight: Number(Math.max(0.1, Math.min(0.99, relationship.weight)).toFixed(2)),
      evidenceRefs: resolveEvidenceRefs(relationship.evidence, input.chunks, input.source.id),
      pinned: false,
      deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  return mergeEdgeRecords(input.existingEdges, nextEdges);
}

export async function ingestSourceDocument(input: {
  storeChunks: ChunkRecord[];
  storeConcepts: ConceptRecord[];
  storeEdges: ConceptEdgeRecord[];
  source: SourceDocument;
  moduleRecord: ModuleRecord;
  preferredProcessor?: SourceProcessorPreference;
}): Promise<SourceIngestionResult> {
  const artifacts = await buildSemanticArtifacts(
    input.source,
    input.moduleRecord,
    input.preferredProcessor ?? "auto"
  );
  const materializedConcepts = materializeConcepts(
    artifacts.concepts,
    artifacts.chunks,
    input.source,
    input.moduleRecord
  );
  const concepts = mergeConcepts(input.storeConcepts, materializedConcepts);
  const allChunks = [...input.storeChunks, ...artifacts.chunks];

  const edges = artifacts.relationships.length
    ? materializeSemanticEdges({
        relationships: artifacts.relationships,
        concepts,
        existingEdges: input.storeEdges,
        chunks: artifacts.chunks,
        source: input.source,
        userId: input.moduleRecord.userId
      })
    : buildEdges(concepts, allChunks, input.storeEdges);

  return {
    processor: artifacts.processor,
    fallbackReason: artifacts.fallbackReason,
    chunks: artifacts.chunks,
    concepts,
    edges
  };
}
