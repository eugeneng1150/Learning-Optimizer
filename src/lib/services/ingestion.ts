import { createId } from "@/lib/store";
import {
  ChunkRecord,
  ConceptRecord,
  EdgeType,
  EvidenceRef,
  ModuleRecord,
  SourceDocument
} from "@/lib/types";

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "algorithm",
  "also",
  "always",
  "because",
  "before",
  "being",
  "between",
  "build",
  "chunking",
  "concept",
  "concepts",
  "depends",
  "does",
  "each",
  "from",
  "give",
  "global",
  "have",
  "ideas",
  "into",
  "learning",
  "local",
  "module",
  "notes",
  "over",
  "their",
  "there",
  "these",
  "this",
  "through",
  "turn",
  "using",
  "vectors",
  "week",
  "when",
  "with"
]);

const EDGE_TYPES: EdgeType[] = [
  "similar_to",
  "prerequisite_of",
  "part_of",
  "applies_to",
  "contrasts_with"
];

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function chunkText(source: SourceDocument): ChunkRecord[] {
  const paragraphs = source.content
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const rawChunks = paragraphs.flatMap((paragraph) =>
    paragraph
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 20)
  );

  return rawChunks.map((text) => ({
    id: createId("chunk"),
    sourceId: source.id,
    moduleId: source.moduleId,
    userId: source.userId,
    text,
    embedding: buildHeuristicEmbedding(text),
    createdAt: new Date().toISOString()
  }));
}

export function buildHeuristicEmbedding(text: string): number[] {
  const values = new Array<number>(8).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);

  tokens.forEach((token, tokenIndex) => {
    const bucket = tokenIndex % values.length;
    values[bucket] += token.charCodeAt(0) / 255;
  });

  return values.map((value) => Number(value.toFixed(4)));
}

export function extractCandidateConcepts(
  chunks: ChunkRecord[],
  moduleRecord: ModuleRecord
): ConceptRecord[] {
  const conceptsBySlug = new Map<string, ConceptRecord>();

  chunks.forEach((chunk) => {
    const phrases = collectConceptPhrases(chunk.text);

    phrases.forEach((phrase) => {
      const slug = phrase.toLowerCase();
      const evidence: EvidenceRef = {
        id: createId("evidence"),
        sourceId: chunk.sourceId,
        chunkId: chunk.id,
        excerpt: chunk.text.slice(0, 220)
      };

      const existing = conceptsBySlug.get(slug);
      if (existing) {
        existing.moduleIds = Array.from(new Set([...existing.moduleIds, moduleRecord.id]));
        existing.sourceIds = Array.from(new Set([...existing.sourceIds, chunk.sourceId]));
        existing.evidenceRefs.push(evidence);
        existing.summary = mergeSummary(existing.summary, chunk.text);
        existing.confidence = Number(Math.min(existing.confidence + 0.08, 0.98).toFixed(2));
        existing.updatedAt = new Date().toISOString();
      } else {
        conceptsBySlug.set(slug, {
          id: createId("concept"),
          userId: moduleRecord.userId,
          title: toTitleCase(phrase),
          summary: summarizeChunk(phrase, chunk.text, moduleRecord.title),
          moduleIds: [moduleRecord.id],
          sourceIds: [chunk.sourceId],
          evidenceRefs: [evidence],
          masteryScore: 0.35,
          confidence: 0.62,
          status: "active",
          pinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    });
  });

  return Array.from(conceptsBySlug.values());
}

function mergeSummary(existing: string, incoming: string): string {
  if (existing.includes(incoming.slice(0, 24))) {
    return existing;
  }

  const merged = `${existing} ${incoming}`;
  return merged.length > 240 ? `${merged.slice(0, 237)}...` : merged;
}

function summarizeChunk(phrase: string, text: string, moduleTitle: string): string {
  return `${toTitleCase(phrase)} is discussed in ${moduleTitle}. ${text}`.slice(0, 240);
}

function collectConceptPhrases(text: string): string[] {
  const tokenCounts = new Map<string, number>();
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (word.length < 4 || STOPWORDS.has(word)) {
      continue;
    }

    tokenCounts.set(word, (tokenCounts.get(word) ?? 0) + 1);

    const next = words[index + 1];
    if (next && next.length > 3 && !STOPWORDS.has(next)) {
      const phrase = `${word} ${next}`;
      tokenCounts.set(phrase, (tokenCounts.get(phrase) ?? 0) + 2);
    }
  }

  return Array.from(tokenCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function pickEdgeType(sourceTitle: string, targetTitle: string): EdgeType {
  const source = sourceTitle.toLowerCase();
  const target = targetTitle.toLowerCase();

  if (source.includes("graph") && target.includes("vector")) {
    return "applies_to";
  }

  if (source.includes("dynamic") && target.includes("greedy")) {
    return "contrasts_with";
  }

  if (source.split(" ").some((token) => target.includes(token))) {
    return "similar_to";
  }

  if (source.length < target.length) {
    return "part_of";
  }

  return EDGE_TYPES[(source.length + target.length) % EDGE_TYPES.length];
}
