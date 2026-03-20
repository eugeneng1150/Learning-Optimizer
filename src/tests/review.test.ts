import test from "node:test";
import assert from "node:assert/strict";

import { buildReminderJobs, ensureReviewState, updateReviewState } from "@/lib/services/review";

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

test("reminder jobs create both in-app and email notifications", () => {
  const jobs = buildReminderJobs("user_demo", ["concept_a", "concept_b"]);

  assert.equal(jobs.length, 2);
  assert.deepEqual(
    jobs.map((job) => job.channel).sort(),
    ["email", "in_app"]
  );
});
