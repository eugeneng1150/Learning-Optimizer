import test from "node:test";
import assert from "node:assert/strict";

import { applyFamiliarityRating, buildReminderJobs, ensureReviewState, listDueConcepts, updateReviewState } from "@/lib/services/review";

test("FSRS-style review updates move due date farther for stronger recall", () => {
  const base = ensureReviewState("user_demo", "concept_a");
  const again = updateReviewState(base, "again");
  const good = updateReviewState(base, "good");
  const easy = updateReviewState(base, "easy");

  assert.ok(new Date(again.dueAt).getTime() < new Date(good.dueAt).getTime());
  assert.ok(new Date(good.dueAt).getTime() < new Date(easy.dueAt).getTime());
  assert.ok(again.difficulty >= good.difficulty);
  assert.ok(easy.stability > good.stability);
});

test("familiarity rating rewrites review pressure from low to high confidence", () => {
  const base = ensureReviewState("user_demo", "concept_a");
  const unfamiliar = applyFamiliarityRating(base, 1);
  const familiar = applyFamiliarityRating(base, 5);

  assert.ok(new Date(unfamiliar.dueAt).getTime() <= new Date(familiar.dueAt).getTime());
  assert.ok(unfamiliar.difficulty > familiar.difficulty);
  assert.ok(familiar.stability > unfamiliar.stability);
});

test("due queue sorts lower familiarity ahead of higher familiarity when concepts are both due", () => {
  const dueAt = new Date(Date.now() - 60_000).toISOString();
  const concepts = [
    {
      id: "concept_a",
      userId: "user_demo",
      title: "Alpha",
      summary: "Alpha summary",
      moduleIds: [],
      sourceIds: [],
      evidenceRefs: [],
      masteryScore: 0.2,
      confidence: 0.7,
      status: "active" as const,
      pinned: false,
      createdAt: dueAt,
      updatedAt: dueAt
    },
    {
      id: "concept_b",
      userId: "user_demo",
      title: "Beta",
      summary: "Beta summary",
      moduleIds: [],
      sourceIds: [],
      evidenceRefs: [],
      masteryScore: 0.2,
      confidence: 0.7,
      status: "active" as const,
      pinned: false,
      createdAt: dueAt,
      updatedAt: dueAt
    }
  ];
  const reviewStates = [
    { ...ensureReviewState("user_demo", "concept_a"), dueAt },
    { ...ensureReviewState("user_demo", "concept_b"), dueAt }
  ];
  const due = listDueConcepts(concepts, reviewStates, [
    { conceptId: "concept_a", userId: "user_demo", rating: 4 as const, updatedAt: dueAt },
    { conceptId: "concept_b", userId: "user_demo", rating: 2 as const, updatedAt: dueAt }
  ]);

  assert.equal(due[0]?.concept.id, "concept_b");
  assert.equal(due[1]?.concept.id, "concept_a");
});

test("reminder jobs create both in-app and email notifications", () => {
  const jobs = buildReminderJobs("user_demo", ["concept_a", "concept_b"]);

  assert.equal(jobs.length, 2);
  assert.deepEqual(
    jobs.map((job) => job.channel).sort(),
    ["email", "in_app"]
  );
});
