export type EdgeType =
  | "similar_to"
  | "prerequisite_of"
  | "part_of"
  | "applies_to"
  | "contrasts_with";

export type QuizType = "flashcard" | "short_answer" | "relationship";

export type QuizOutcome = "again" | "hard" | "good" | "easy";

export type FamiliarityRating = 1 | 2 | 3 | 4 | 5;

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface ModuleRecord {
  id: string;
  userId: string;
  title: string;
  code?: string;
  description: string;
  createdAt: string;
}

export interface SourceDocument {
  id: string;
  moduleId: string;
  userId: string;
  title: string;
  kind: "pdf" | "text";
  content: string;
  createdAt: string;
}

export interface ChunkRecord {
  id: string;
  sourceId: string;
  moduleId: string;
  userId: string;
  text: string;
  embedding: number[];
  createdAt: string;
}

export interface EvidenceRef {
  id: string;
  sourceId: string;
  chunkId: string;
  excerpt: string;
}

export interface ConceptRecord {
  id: string;
  userId: string;
  title: string;
  summary: string;
  moduleIds: string[];
  sourceIds: string[];
  evidenceRefs: EvidenceRef[];
  masteryScore: number;
  confidence: number;
  status: "active" | "confusing" | "mastered";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptEdgeRecord {
  id: string;
  userId: string;
  sourceConceptId: string;
  targetConceptId: string;
  type: EdgeType;
  weight: number;
  evidenceRefs: EvidenceRef[];
  pinned: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewState {
  conceptId: string;
  userId: string;
  stability: number;
  difficulty: number;
  retrievability: number;
  dueAt: string;
  lastReviewedAt?: string;
}

export interface ConceptFamiliarityRecord {
  conceptId: string;
  userId: string;
  rating: FamiliarityRating;
  updatedAt: string;
}

export interface QuizItem {
  id: string;
  userId: string;
  conceptIds: string[];
  type: QuizType;
  prompt: string;
  expectedAnswer: string;
  rubric: string;
  evidenceRefs: EvidenceRef[];
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  quizItemId: string;
  answer: string;
  outcome: QuizOutcome;
  score: number;
  feedback: string;
  createdAt: string;
}

export interface ReminderJob {
  id: string;
  userId: string;
  dueConceptIds: string[];
  channel: "in_app" | "email";
  sentAt: string;
}

export interface ReminderSettings {
  userId: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  dailyHour: number;
  updatedAt: string;
}

export interface AppStore {
  users: User[];
  modules: ModuleRecord[];
  sources: SourceDocument[];
  chunks: ChunkRecord[];
  concepts: ConceptRecord[];
  edges: ConceptEdgeRecord[];
  reviewStates: ReviewState[];
  conceptFamiliarities: ConceptFamiliarityRecord[];
  quizItems: QuizItem[];
  quizAttempts: QuizAttempt[];
  reminders: ReminderJob[];
  reminderSettings: ReminderSettings[];
}

export interface ConceptNode {
  id: string;
  title: string;
  summary: string;
  module_ids: string[];
  mastery_score: number;
  evidence_refs: EvidenceRef[];
}

export interface ConceptEdge {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  type: EdgeType;
  weight: number;
  evidence_refs: EvidenceRef[];
}

export interface DueConcept {
  concept: ConceptRecord;
  reviewState: ReviewState;
  familiarity?: ConceptFamiliarityRecord;
}
