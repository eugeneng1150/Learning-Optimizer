import { buildHeuristicEmbedding, cosineSimilarity } from "@/lib/services/ingestion";
import {
  GeminiUnavailableError,
  isGeminiConfigured,
  requestGeminiGroundedAnswer,
  requestGeminiQueryEmbedding
} from "@/lib/services/gemini";
import { ChunkRecord, ConceptRecord, RetrievalAnswer, RetrievedChunk } from "@/lib/types";

interface QueryConceptEvidenceInput {
  concept: ConceptRecord;
  chunks: ChunkRecord[];
  query: string;
  restrictSourceId?: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function lexicalOverlap(left: string, right: string): number {
  const leftTokens = new Set(normalize(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalize(right).split(" ").filter(Boolean));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function rankChunks(
  chunks: ChunkRecord[],
  query: string,
  queryEmbedding: number[],
  concept: ConceptRecord
): RetrievedChunk[] {
  const evidenceChunkIds = new Set(concept.evidenceRefs.map((ref) => ref.chunkId));
  const sameDimensionChunks = chunks.filter((chunk) => chunk.embedding.length === queryEmbedding.length);
  const rankedPool = sameDimensionChunks.length ? sameDimensionChunks : chunks;

  return rankedPool
    .map((chunk) => {
      const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
      const lexicalScore = lexicalOverlap(query, chunk.text);
      const conceptBonus = evidenceChunkIds.has(chunk.id) ? 0.08 : 0;

      return {
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        moduleId: chunk.moduleId,
        text: chunk.text,
        score: Number((vectorScore * 0.78 + lexicalScore * 0.22 + conceptBonus).toFixed(4))
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function buildHeuristicAnswer(concept: ConceptRecord, query: string, matches: RetrievedChunk[]): string {
  if (!matches.length) {
    return `I could not find grounded evidence for "${query}" in the stored notes for ${concept.title}.`;
  }

  const excerpts = matches.map((match, index) => `[${index + 1}] ${match.text}`).join(" ");
  return `Using the stored notes for ${concept.title}: ${excerpts}`.slice(0, 420);
}

export async function queryConceptEvidence(input: QueryConceptEvidenceInput): Promise<RetrievalAnswer> {
  const conceptChunks = input.chunks.filter(
    (chunk) => input.concept.sourceIds.includes(chunk.sourceId) || input.concept.moduleIds.includes(chunk.moduleId)
  );
  const scopedChunks = input.restrictSourceId
    ? conceptChunks.filter((chunk) => chunk.sourceId === input.restrictSourceId)
    : conceptChunks;
  const candidateChunks = scopedChunks.length ? scopedChunks : conceptChunks.length ? conceptChunks : input.chunks;

  let queryEmbedding = buildHeuristicEmbedding(input.query);
  let processor: RetrievalAnswer["processor"] = "heuristic";
  let fallbackReason: string | undefined;

  if (isGeminiConfigured()) {
    try {
      queryEmbedding = await requestGeminiQueryEmbedding(input.query);
      processor = "gemini";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini query embedding failed";
      fallbackReason = `Gemini retrieval fallback activated: ${message}`;
    }
  }

  const matches = rankChunks(candidateChunks, input.query, queryEmbedding, input.concept);

  if (!matches.length) {
    return {
      query: input.query,
      answer: `I could not find grounded evidence for "${input.query}" in the stored notes for ${input.concept.title}.`,
      matches: [],
      processor,
      fallbackReason
    };
  }

  if (processor === "gemini") {
    try {
      const answer = await requestGeminiGroundedAnswer({
        conceptTitle: input.concept.title,
        conceptSummary: input.concept.summary,
        query: input.query,
        evidence: matches.map((match) => match.text)
      });

      return {
        query: input.query,
        answer,
        matches,
        processor,
        fallbackReason
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini grounded answer failed";
      fallbackReason = [fallbackReason, `Gemini answer fallback activated: ${message}`].filter(Boolean).join(" ");
    }
  }

  return {
    query: input.query,
    answer: buildHeuristicAnswer(input.concept, input.query, matches),
    matches,
    processor: processor === "gemini" && !fallbackReason ? "gemini" : "heuristic",
    fallbackReason
  };
}

export function isGeminiRetrievalError(error: unknown): error is GeminiUnavailableError {
  return error instanceof GeminiUnavailableError;
}
