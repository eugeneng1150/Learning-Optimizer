import { createId } from "@/lib/store";
import { ConceptEdgeRecord, ConceptRecord, QuizItem, QuizOutcome, QuizType } from "@/lib/types";

export function generateQuizItems(
  userId: string,
  concepts: ConceptRecord[],
  edges: ConceptEdgeRecord[]
): QuizItem[] {
  return concepts.slice(0, 6).flatMap((concept) => {
    const conceptEdges = edges.filter(
      (edge) =>
        !edge.deleted &&
        (edge.sourceConceptId === concept.id || edge.targetConceptId === concept.id)
    );

    const relationshipEdge = conceptEdges[0];
    const items: QuizItem[] = [
      buildQuizItem(userId, [concept], "flashcard", concept),
      buildQuizItem(userId, [concept], "short_answer", concept)
    ];

    if (relationshipEdge) {
      const relatedConceptId =
        relationshipEdge.sourceConceptId === concept.id
          ? relationshipEdge.targetConceptId
          : relationshipEdge.sourceConceptId;
      const relatedConcept = concepts.find((candidate) => candidate.id === relatedConceptId);

      if (relatedConcept) {
        items.push(buildRelationshipItem(userId, concept, relatedConcept, relationshipEdge.type));
      }
    }

    return items;
  });
}

function buildQuizItem(
  userId: string,
  concepts: ConceptRecord[],
  type: Exclude<QuizType, "relationship">,
  concept: ConceptRecord
): QuizItem {
  const prompt =
    type === "flashcard"
      ? `Define ${concept.title} and explain why it matters in this learning graph.`
      : `Explain ${concept.title} in your own words and connect it to one module outcome.`;

  return {
    id: createId("quiz"),
    userId,
    conceptIds: concepts.map((item) => item.id),
    type,
    prompt,
    expectedAnswer: concept.summary,
    rubric:
      "Answer should mention the concept definition, at least one grounded detail from the source, and a relevant application or context.",
    evidenceRefs: concept.evidenceRefs.slice(0, 2),
    createdAt: new Date().toISOString()
  };
}

function buildRelationshipItem(
  userId: string,
  source: ConceptRecord,
  target: ConceptRecord,
  edgeType: string
): QuizItem {
  return {
    id: createId("quiz"),
    userId,
    conceptIds: [source.id, target.id],
    type: "relationship",
    prompt: `How does ${source.title} relate to ${target.title} in this graph?`,
    expectedAnswer: `${source.title} ${edgeType.replaceAll("_", " ")} ${target.title}.`,
    rubric:
      "Answer should describe the relationship type, mention both concepts clearly, and use source-grounded reasoning rather than a vague analogy.",
    evidenceRefs: [...source.evidenceRefs, ...target.evidenceRefs].slice(0, 3),
    createdAt: new Date().toISOString()
  };
}

export function scoreAnswer(answer: string, expectedAnswer: string): { outcome: QuizOutcome; score: number; feedback: string } {
  const normalizedAnswer = normalize(answer);
  const normalizedExpected = normalize(expectedAnswer);

  const answerTokens = new Set(normalizedAnswer.split(" ").filter(Boolean));
  const expectedTokens = new Set(normalizedExpected.split(" ").filter(Boolean));
  const overlap = Array.from(answerTokens).filter((token) => expectedTokens.has(token)).length;
  const coverage = expectedTokens.size ? overlap / expectedTokens.size : 0;

  if (coverage < 0.2) {
    return {
      outcome: "again",
      score: 0.2,
      feedback: "The answer missed most of the grounded keywords. Revisit the evidence excerpts before retrying."
    };
  }

  if (coverage < 0.45) {
    return {
      outcome: "hard",
      score: 0.45,
      feedback: "The answer captures part of the concept, but it needs more precise source-backed detail."
    };
  }

  if (coverage < 0.75) {
    return {
      outcome: "good",
      score: 0.72,
      feedback: "The answer is mostly correct. One more supporting detail would make it robust."
    };
  }

  return {
    outcome: "easy",
    score: 0.92,
    feedback: "The answer covers the expected concept well and aligns with the grounded evidence."
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}
