import test from "node:test";
import assert from "node:assert/strict";

import { generateQuizItems, scoreAnswer } from "@/lib/services/quiz";
import { ConceptEdgeRecord, ConceptRecord } from "@/lib/types";

const concepts: ConceptRecord[] = [
  {
    id: "concept_graph",
    userId: "user_demo",
    title: "Graph Traversal",
    summary: "Graph traversal explores nodes and edges to find reachable states and useful paths.",
    moduleIds: ["mod_a"],
    sourceIds: ["src_a"],
    evidenceRefs: [
      { id: "ev_a", sourceId: "src_a", chunkId: "chunk_a", excerpt: "Graph traversal explores nodes and edges." }
    ],
    masteryScore: 0.3,
    confidence: 0.8,
    status: "active",
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "concept_embeddings",
    userId: "user_demo",
    title: "Embeddings",
    summary: "Embeddings place similar ideas close together in vector space for retrieval and comparison.",
    moduleIds: ["mod_b"],
    sourceIds: ["src_b"],
    evidenceRefs: [
      { id: "ev_b", sourceId: "src_b", chunkId: "chunk_b", excerpt: "Embeddings place similar ideas close together." }
    ],
    masteryScore: 0.4,
    confidence: 0.79,
    status: "active",
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const edges: ConceptEdgeRecord[] = [
  {
    id: "edge_ab",
    userId: "user_demo",
    sourceConceptId: "concept_graph",
    targetConceptId: "concept_embeddings",
    type: "applies_to",
    weight: 0.8,
    evidenceRefs: [
      { id: "ev_edge", sourceId: "src_b", chunkId: "chunk_b", excerpt: "Graph structure can support retrieval." }
    ],
    pinned: false,
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

test("quiz generation creates flashcard, short answer, and relationship items", () => {
  const quizItems = generateQuizItems("user_demo", concepts, edges);
  const types = new Set(quizItems.map((item) => item.type));

  assert.ok(types.has("flashcard"));
  assert.ok(types.has("short_answer"));
  assert.ok(types.has("relationship"));
});

test("quiz scoring distinguishes weak and strong grounded answers", () => {
  const expected = "Graph traversal explores nodes and edges to find reachable states and useful paths.";
  const weak = scoreAnswer("It is some kind of topic.", expected);
  const strong = scoreAnswer("Graph traversal explores nodes and edges to find reachable states and useful paths.", expected);

  assert.equal(weak.outcome, "again");
  assert.equal(strong.outcome, "easy");
  assert.ok(strong.score > weak.score);
});
