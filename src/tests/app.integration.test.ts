import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { createModule, createSource, generateQuizzes, getDashboardSnapshot, submitQuizAttempt } from "@/lib/app";
import { resetStoreCache } from "@/lib/store";

test("dashboard flow ingests a source, builds graph data, and updates review after a quiz", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  resetStoreCache();

  try {
    const initial = await getDashboardSnapshot();
    assert.ok(initial.graph.nodes.length > 0);

    const moduleRecord = await createModule({
      title: "Databases",
      description: "Indexes, joins, query planning, and retrieval structures."
    });

    await createSource({
      moduleId: moduleRecord.id,
      title: "Database retrieval notes",
      content:
        "Index structures support retrieval. Query planning depends on joins, costs, and graph-like dependencies between operators."
    });

    const next = await getDashboardSnapshot();
    assert.ok(next.modules.some((item) => item.id === moduleRecord.id));
    assert.ok(next.graph.nodes.some((item) => item.module_ids.includes(moduleRecord.id)));

    const quiz = next.quizzes[0];
    assert.ok(quiz);

    const attempt = await submitQuizAttempt({
      quizItemId: quiz.id,
      answer: quiz.expectedAnswer
    });

    assert.equal(attempt.outcome, "easy");

    const afterAttempt = await getDashboardSnapshot();
    const reviewedConcept = afterAttempt.conceptRecords.find((concept) => concept.id === quiz.conceptIds[0]);
    assert.ok(reviewedConcept);
    assert.ok((reviewedConcept?.masteryScore ?? 0) >= 0.46);
  } finally {
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("regenerating quizzes drops stale attempts tied to replaced quiz item ids", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  resetStoreCache();

  try {
    const initial = await getDashboardSnapshot();
    const firstQuiz = initial.quizzes[0];
    assert.ok(firstQuiz);

    await submitQuizAttempt({
      quizItemId: firstQuiz.id,
      answer: firstQuiz.expectedAnswer
    });

    const regenerated = await generateQuizzes();
    assert.ok(regenerated.length > 0);
    assert.equal(regenerated.some((item) => item.id === firstQuiz.id), false);

    const afterRegeneration = await getDashboardSnapshot();
    assert.equal(afterRegeneration.quizzes.length, regenerated.length);
    assert.equal(afterRegeneration.quizzes.some((item) => item.id === firstQuiz.id), false);
  } finally {
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});
