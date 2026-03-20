import { createId } from "@/lib/store";
import { cosineSimilarity, pickEdgeType } from "@/lib/services/ingestion";
import {
  ChunkRecord,
  ConceptEdgeRecord,
  ConceptNode,
  ConceptRecord,
  EdgeType,
  ModuleRecord
} from "@/lib/types";

const conceptVector = (concept: ConceptRecord, chunks: ChunkRecord[]): number[] => {
  const relatedChunks = chunks.filter((chunk) => concept.sourceIds.includes(chunk.sourceId));
  const totals = new Array<number>(8).fill(0);

  relatedChunks.forEach((chunk) => {
    chunk.embedding.forEach((value, index) => {
      totals[index] += value;
    });
  });

  return totals.map((value) => Number((value / Math.max(relatedChunks.length, 1)).toFixed(4)));
};

export function mergeConcepts(existing: ConceptRecord[], incoming: ConceptRecord[]): ConceptRecord[] {
  const merged = [...existing];

  incoming.forEach((candidate) => {
    const match = merged.find((concept) => areConceptsEquivalent(concept, candidate));

    if (match) {
      match.summary = match.summary.length >= candidate.summary.length ? match.summary : candidate.summary;
      match.moduleIds = Array.from(new Set([...match.moduleIds, ...candidate.moduleIds]));
      match.sourceIds = Array.from(new Set([...match.sourceIds, ...candidate.sourceIds]));
      match.evidenceRefs = [...match.evidenceRefs, ...candidate.evidenceRefs].slice(0, 6);
      match.confidence = Number(Math.min((match.confidence + candidate.confidence) / 2 + 0.05, 0.99).toFixed(2));
      match.updatedAt = new Date().toISOString();
    } else {
      merged.push(candidate);
    }
  });

  return merged;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function areConceptsEquivalent(left: ConceptRecord, right: ConceptRecord): boolean {
  const normalizedLeft = normalizeTitle(left.title);
  const normalizedRight = normalizeTitle(right.title);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const overlap = left.evidenceRefs.some((leftRef) =>
    right.evidenceRefs.some((rightRef) => leftRef.sourceId === rightRef.sourceId && leftRef.excerpt === rightRef.excerpt)
  );

  return overlap || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

export function buildEdges(
  concepts: ConceptRecord[],
  chunks: ChunkRecord[],
  existingEdges: ConceptEdgeRecord[]
): ConceptEdgeRecord[] {
  const nextEdges = [...existingEdges.filter((edge) => !edge.deleted)];

  for (let sourceIndex = 0; sourceIndex < concepts.length; sourceIndex += 1) {
    for (let targetIndex = sourceIndex + 1; targetIndex < concepts.length; targetIndex += 1) {
      const source = concepts[sourceIndex];
      const target = concepts[targetIndex];
      const score = cosineSimilarity(conceptVector(source, chunks), conceptVector(target, chunks));
      const sharedModules = source.moduleIds.filter((moduleId) => target.moduleIds.includes(moduleId)).length;
      const weight = Number(Math.min(score + sharedModules * 0.1, 0.98).toFixed(2));

      if (weight < 0.45) {
        continue;
      }

      const existing = nextEdges.find(
        (edge) =>
          edge.sourceConceptId === source.id &&
          edge.targetConceptId === target.id &&
          !edge.deleted
      );

      if (existing) {
        existing.weight = Math.max(existing.weight, weight);
        existing.updatedAt = new Date().toISOString();
        continue;
      }

      const combinedEvidence = [...source.evidenceRefs, ...target.evidenceRefs].slice(0, 4);

      nextEdges.push({
        id: createId("edge"),
        userId: source.userId,
        sourceConceptId: source.id,
        targetConceptId: target.id,
        type: pickEdgeType(source.title, target.title),
        weight,
        evidenceRefs: combinedEvidence,
        pinned: false,
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  return nextEdges;
}

export function toConceptNode(concept: ConceptRecord): ConceptNode {
  return {
    id: concept.id,
    title: concept.title,
    summary: concept.summary,
    module_ids: concept.moduleIds,
    mastery_score: concept.masteryScore,
    evidence_refs: concept.evidenceRefs
  };
}

export function computeModuleSimilarity(
  moduleRecord: ModuleRecord,
  allModules: ModuleRecord[],
  concepts: ConceptRecord[],
  edges: ConceptEdgeRecord[]
): Array<{ moduleId: string; title: string; score: number; reasons: string[] }> {
  const moduleConcepts = concepts.filter((concept) => concept.moduleIds.includes(moduleRecord.id));

  return allModules
    .filter((candidate) => candidate.id !== moduleRecord.id)
    .map((candidate) => {
      const candidateConcepts = concepts.filter((concept) => concept.moduleIds.includes(candidate.id));
      const sharedTitles = moduleConcepts
        .filter((concept) =>
          candidateConcepts.some(
            (candidateConcept) => normalizeTitle(candidateConcept.title) === normalizeTitle(concept.title)
          )
        )
        .map((concept) => concept.title);

      const crossEdges = edges.filter((edge) => {
        const source = concepts.find((concept) => concept.id === edge.sourceConceptId);
        const target = concepts.find((concept) => concept.id === edge.targetConceptId);

        if (!source || !target || edge.deleted) {
          return false;
        }

        const crossesCandidate =
          source.moduleIds.includes(moduleRecord.id) && target.moduleIds.includes(candidate.id);
        const crossesReverse =
          source.moduleIds.includes(candidate.id) && target.moduleIds.includes(moduleRecord.id);

        return crossesCandidate || crossesReverse;
      });

      const score = Number(
        Math.min(sharedTitles.length * 0.2 + crossEdges.length * 0.1, 0.99).toFixed(2)
      );

      return {
        moduleId: candidate.id,
        title: candidate.title,
        score,
        reasons: [...sharedTitles, ...crossEdges.slice(0, 3).map((edge) => edge.type)]
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

export function edgeTypes(edges: ConceptEdgeRecord[]): EdgeType[] {
  return Array.from(new Set(edges.map((edge) => edge.type)));
}
