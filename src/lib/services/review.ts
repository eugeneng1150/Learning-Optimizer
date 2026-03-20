import { createId } from "@/lib/store";
import {
  ConceptRecord,
  DueConcept,
  QuizOutcome,
  ReminderJob,
  ReminderSettings,
  ReviewState
} from "@/lib/types";

function now(): Date {
  return new Date();
}

export function ensureReviewState(userId: string, conceptId: string): ReviewState {
  return {
    conceptId,
    userId,
    stability: 1.5,
    difficulty: 5.5,
    retrievability: 0.82,
    dueAt: now().toISOString()
  };
}

export function updateReviewState(state: ReviewState, outcome: QuizOutcome): ReviewState {
  const reviewedAt = now();
  const modifiers: Record<QuizOutcome, { stability: number; difficulty: number; hours: number; retrievability: number }> = {
    again: { stability: 0.75, difficulty: 1.15, hours: 8, retrievability: 0.35 },
    hard: { stability: 1.1, difficulty: 1.05, hours: 24, retrievability: 0.52 },
    good: { stability: 1.45, difficulty: 0.95, hours: 72, retrievability: 0.71 },
    easy: { stability: 1.8, difficulty: 0.9, hours: 144, retrievability: 0.86 }
  };

  const modifier = modifiers[outcome];
  const nextDifficulty = Number(
    Math.max(1, Math.min(10, state.difficulty * modifier.difficulty)).toFixed(2)
  );
  const nextStability = Number(Math.max(0.6, state.stability * modifier.stability).toFixed(2));
  const dueAt = new Date(reviewedAt.getTime() + modifier.hours * 60 * 60 * 1000).toISOString();

  return {
    ...state,
    stability: nextStability,
    difficulty: nextDifficulty,
    retrievability: modifier.retrievability,
    dueAt,
    lastReviewedAt: reviewedAt.toISOString()
  };
}

export function listDueConcepts(concepts: ConceptRecord[], reviewStates: ReviewState[]): DueConcept[] {
  const currentTime = now().toISOString();

  return concepts
    .map((concept) => {
      const reviewState = reviewStates.find((state) => state.conceptId === concept.id);
      return reviewState ? { concept, reviewState } : null;
    })
    .filter((item): item is DueConcept => Boolean(item))
    .filter((item) => item.reviewState.dueAt <= currentTime)
    .sort((left, right) => left.reviewState.dueAt.localeCompare(right.reviewState.dueAt));
}

export function buildReminderJobs(
  userId: string,
  dueConceptIds: string[],
  settings?: ReminderSettings
): ReminderJob[] {
  if (!dueConceptIds.length) {
    return [];
  }

  const sentAt = now().toISOString();
  const effectiveSettings: ReminderSettings = settings ?? {
    userId,
    emailEnabled: true,
    inAppEnabled: true,
    dailyHour: 19,
    updatedAt: sentAt
  };
  const jobs: ReminderJob[] = [];

  if (effectiveSettings.inAppEnabled) {
    jobs.push({
      id: createId("reminder"),
      userId,
      dueConceptIds,
      channel: "in_app",
      sentAt
    });
  }

  if (effectiveSettings.emailEnabled) {
    jobs.push({
      id: createId("reminder"),
      userId,
      dueConceptIds,
      channel: "email",
      sentAt
    });
  }

  return jobs;
}
