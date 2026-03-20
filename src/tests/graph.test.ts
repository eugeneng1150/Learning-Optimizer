import test from "node:test";
import assert from "node:assert/strict";

import { buildEdges, mergeConcepts } from "@/lib/services/graph";
import { chunkText, extractCandidateConcepts } from "@/lib/services/ingestion";
import { ModuleRecord, SourceDocument } from "@/lib/types";

const moduleRecord: ModuleRecord = {
  id: "mod_test",
  userId: "user_demo",
  title: "Algorithms",
  description: "Graph methods",
  createdAt: new Date().toISOString()
};

function makeSource(id: string, content: string): SourceDocument {
  return {
    id,
    moduleId: moduleRecord.id,
    userId: moduleRecord.userId,
    title: id,
    kind: "text",
    content,
    createdAt: new Date().toISOString()
  };
}

test("concept extraction merges obvious duplicates across sources", () => {
  const sourceA = makeSource(
    "src_a",
    "Graph traversal helps explain shortest path search. Graph traversal also appears in prerequisite reasoning."
  );
  const sourceB = makeSource(
    "src_b",
    "Graph traversal is essential when learning breadth first search and graph representations."
  );

  const conceptsA = extractCandidateConcepts(chunkText(sourceA), moduleRecord);
  const conceptsB = extractCandidateConcepts(chunkText(sourceB), moduleRecord);
  const merged = mergeConcepts(conceptsA, conceptsB);

  const graphTraversalConcepts = merged.filter((concept) => concept.title.toLowerCase().includes("graph traversal"));
  assert.equal(graphTraversalConcepts.length, 1);
  assert.ok(graphTraversalConcepts[0].evidenceRefs.length >= 2);
});

test("edge building emits supported types with evidence refs", () => {
  const source = makeSource(
    "src_edges",
    "Dynamic programming contrasts with greedy methods. Graph traversal applies to vector search when graphs model neighborhoods."
  );

  const chunks = chunkText(source);
  const concepts = extractCandidateConcepts(chunks, moduleRecord);
  const edges = buildEdges(concepts, chunks, []);

  assert.ok(edges.length > 0);
  edges.forEach((edge) => {
    assert.ok(
      ["similar_to", "prerequisite_of", "part_of", "applies_to", "contrasts_with"].includes(edge.type)
    );
    assert.ok(edge.evidenceRefs.length > 0);
  });
});
