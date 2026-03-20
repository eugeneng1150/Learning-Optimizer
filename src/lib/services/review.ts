import { createId } from "@/lib/store";
import {
  ConceptRecord,
  ConceptFamiliarityRecord,
  DueConcept,
  FamiliarityRating,
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

const familiarityProfiles: Record<
  FamiliarityRating,
  { stability: number; difficulty: number; retrievability: number; hoursUntilDue: number }
> = {
  1: { stability: 0.8, difficulty: 8.8, retrievability: 0.22, hoursUntilDue: 0 },
  2: { stability: 1.1, difficulty: 7.2, retrievability: 0.34, hoursUntilDue: 12 },
  3: { stability: 1.8, difficulty: 5.6, retrievability: 0.5, hoursUntilDue: 48 },
  4: { stability: 2.8, difficulty: 4.2, retrievability: 0.68, hoursUntilDue: 120 },
  5: { stability: 4.2, difficulty: 3.1, retrievability: 0.84, hoursUntilDue: 240 }
};

export function applyFamiliarityRating(state: ReviewState, rating: FamiliarityRating): ReviewState {
  const profile = familiarityProfiles[rating];
  const ratedAt = now();

  return {
    ...state,
    stability: profile.stability,
    difficulty: profile.difficulty,
    retrievability: profile.retrievability,
    dueAt: new Date(ratedAt.getTime() + profile.hoursUntilDue * 60 * 60 * 1000).toISOString()
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

export function listDueConcepts(
  concepts: ConceptRecord[],
  reviewStates: ReviewState[],
  conceptFamiliarities: ConceptFamiliarityRecord[] = []
): DueConcept[] {
  const currentTime = now().toISOString();
  const familiarityByConceptId = new Map(conceptFamiliarities.map((record) => [record.conceptId, record]));
  const dueConcepts: DueConcept[] = [];

  concepts.forEach((concept) => {
    const reviewState = reviewStates.find((state) => state.conceptId === concept.id);
    if (!reviewState || reviewState.dueAt > currentTime) {
      return;
    }

    dueConcepts.push({
      concept,
      reviewState,
      familiarity: familiarityByConceptId.get(concept.id)
    });
  });

  return dueConcepts.sort((left, right) => {
      const dueSort = left.reviewState.dueAt.localeCompare(right.reviewState.dueAt);
      if (dueSort !== 0) {
        return dueSort;
      }

      const leftRating = left.familiarity?.rating ?? 0;
      const rightRating = right.familiarity?.rating ?? 0;
      if (leftRating !== rightRating) {
        return leftRating - rightRating;
      }

      return left.concept.title.localeCompare(right.concept.title);
    });
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
