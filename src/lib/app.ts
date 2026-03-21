import { createId, getStore, saveStore } from "@/lib/store";
import { computeModuleSimilarity, toConceptNode } from "@/lib/services/graph";
import { generateQuizItems, scoreAnswer } from "@/lib/services/quiz";
import {
  applyFamiliarityRating,
  buildReminderJobs,
  ensureReviewState,
  listDueConcepts,
  updateReviewState
} from "@/lib/services/review";
import {
  ingestSourceDocument,
  SourceIngestionResult,
  SourceProcessorPreference
} from "@/lib/services/source-ingestion";
import { queryConceptEvidence } from "@/lib/services/retrieval";
import {
  AppStore,
  ConceptEdge,
  ConceptEdgeRecord,
  ConceptFamiliarityRecord,
  ConceptNode,
  ConceptRecord,
  DueConcept,
  EvidenceRef,
  FamiliarityRating,
  ModuleRecord,
  QuizAttempt,
  QuizItem,
  RetrievalAnswer,
  ReviewState,
  SourceCreationResult,
  SourceDocument
} from "@/lib/types";

export interface DashboardSnapshot {
  modules: ModuleRecord[];
  sources: SourceDocument[];
  graph: {
    nodes: ConceptNode[];
    edges: ConceptEdge[];
  };
  conceptRecords: ConceptRecord[];
  edgeRecords: ConceptEdgeRecord[];
  conceptFamiliarities: ConceptFamiliarityRecord[];
  due: DueConcept[];
  quizzes: QuizItem[];
  reminders: AppStore["reminders"];
  reminderSettings: AppStore["reminderSettings"][number];
}

async function hydrateStore(): Promise<AppStore> {
  const store = await getStore();
  if (store.concepts.length || !store.sources.length) {
    return store;
  }

  let nextStore: AppStore = {
    ...store,
    chunks: [],
    concepts: [],
    edges: [],
    reviewStates: []
  };

  for (const source of store.sources) {
    const moduleRecord = nextStore.modules.find((item) => item.id === source.moduleId);
    if (!moduleRecord) {
      continue;
    }

    const hydrated = await ingestIntoStore(nextStore, moduleRecord, source, "heuristic");
    nextStore = hydrated.store;
  }

  await saveStore(nextStore);
  return nextStore;
}

async function ingestIntoStore(
  store: AppStore,
  moduleRecord: ModuleRecord,
  source: SourceDocument,
  preferredProcessor: SourceProcessorPreference = "auto"
): Promise<{ store: AppStore; ingestion: SourceIngestionResult }> {
  const ingestion = await ingestSourceDocument({
    storeChunks: store.chunks,
    storeConcepts: store.concepts,
    storeEdges: store.edges,
    source,
    moduleRecord,
    preferredProcessor
  });
  const reviewStates = ensureReviewStates(store.reviewStates, ingestion.concepts, moduleRecord.userId);

  return {
    ingestion,
    store: {
      ...store,
      chunks: [...store.chunks, ...ingestion.chunks],
      concepts: ingestion.concepts,
      edges: ingestion.edges,
      reviewStates
    }
  };
}

function ensureReviewStates(
  reviewStates: ReviewState[],
  concepts: ConceptRecord[],
  userId: string
): ReviewState[] {
  const nextStates = [...reviewStates];

  concepts.forEach((concept) => {
    if (!nextStates.some((state) => state.conceptId === concept.id)) {
      nextStates.push(ensureReviewState(userId, concept.id));
    }
  });

  return nextStates;
}

function reconcileQuizAttempts(quizItems: QuizItem[], quizAttempts: QuizAttempt[]): QuizAttempt[] {
  const validQuizItemIds = new Set(quizItems.map((item) => item.id));
  return quizAttempts.filter((attempt) => validQuizItemIds.has(attempt.quizItemId));
}

function listDueConceptsForStore(store: AppStore): DueConcept[] {
  return listDueConcepts(store.concepts, store.reviewStates, store.conceptFamiliarities);
}

function getDefaultQuizConcepts(store: AppStore): ConceptRecord[] {
  const dueConcepts = listDueConceptsForStore(store)
    .slice(0, 4)
    .map((item) => item.concept);

  return dueConcepts.length ? dueConcepts : store.concepts.slice(0, 4);
}

function refreshQuizSet(store: AppStore): AppStore {
  const quizItems = generateQuizItems(store.users[0].id, getDefaultQuizConcepts(store), store.edges);

  return {
    ...store,
    quizItems,
    quizAttempts: reconcileQuizAttempts(quizItems, store.quizAttempts)
  };
}

function toEvidenceRefsFromRetrievedChunks(chunks: RetrievalAnswer["matches"]): EvidenceRef[] {
  return chunks.map((chunk) => ({
    id: createId("evidence"),
    sourceId: chunk.sourceId,
    chunkId: chunk.chunkId,
    excerpt: chunk.text.slice(0, 220)
  }));
}

async function buildGroundedQuizItems(
  store: AppStore,
  concepts: ConceptRecord[],
  edges: ConceptEdgeRecord[]
): Promise<QuizItem[]> {
  const baseItems = generateQuizItems(store.users[0].id, concepts, edges);

  return Promise.all(
    baseItems.map(async (item) => {
      const concept = concepts.find((candidate) => candidate.id === item.conceptIds[0]);
      if (!concept || item.type === "relationship") {
        return item;
      }

      const retrieval = await queryConceptEvidence({
        concept,
        chunks: store.chunks,
        query: item.prompt
      });

      return {
        ...item,
        expectedAnswer: retrieval.answer,
        rubric:
          "Answer should stay grounded in the retrieved study-note evidence, explain the concept clearly, and avoid unsupported claims.",
        evidenceRefs: retrieval.matches.length ? toEvidenceRefsFromRetrievedChunks(retrieval.matches) : item.evidenceRefs
      };
    })
  );
}

function upsertReviewState(reviewStates: ReviewState[], nextState: ReviewState): ReviewState[] {
  return reviewStates.some((state) => state.conceptId === nextState.conceptId)
    ? reviewStates.map((state) => (state.conceptId === nextState.conceptId ? nextState : state))
    : [...reviewStates, nextState];
}

function upsertConceptFamiliarity(
  conceptFamiliarities: ConceptFamiliarityRecord[],
  nextRecord: ConceptFamiliarityRecord
): ConceptFamiliarityRecord[] {
  return conceptFamiliarities.some((record) => record.conceptId === nextRecord.conceptId)
    ? conceptFamiliarities.map((record) => (record.conceptId === nextRecord.conceptId ? nextRecord : record))
    : [...conceptFamiliarities, nextRecord];
}

function dedupeConceptFamiliarities(conceptFamiliarities: ConceptFamiliarityRecord[]): ConceptFamiliarityRecord[] {
  const latestByConceptId = new Map<string, ConceptFamiliarityRecord>();

  for (const record of conceptFamiliarities) {
    const existing = latestByConceptId.get(record.conceptId);
    if (!existing || existing.updatedAt.localeCompare(record.updatedAt) < 0) {
      latestByConceptId.set(record.conceptId, record);
    }
  }

  return Array.from(latestByConceptId.values());
}

function normalizeFamiliarityRating(value: number): FamiliarityRating {
  return Math.max(1, Math.min(5, Math.round(value))) as FamiliarityRating;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const store = await hydrateStore();
  const due = listDueConceptsForStore(store);
  const quizzes = store.quizItems.length
    ? store.quizItems
    : generateQuizItems(store.users[0].id, getDefaultQuizConcepts(store), store.edges);

  if (!store.quizItems.length && quizzes.length) {
    await saveStore({
      ...store,
      quizItems: quizzes,
      quizAttempts: reconcileQuizAttempts(quizzes, store.quizAttempts)
    });
  }

  return {
    modules: store.modules,
    sources: store.sources,
    graph: {
      nodes: store.concepts.map(toConceptNode),
      edges: store.edges.filter((edge) => !edge.deleted).map((edge) => ({
        id: edge.id,
        source_concept_id: edge.sourceConceptId,
        target_concept_id: edge.targetConceptId,
        type: edge.type,
        weight: edge.weight,
        evidence_refs: edge.evidenceRefs
      }))
    },
    conceptRecords: store.concepts,
    edgeRecords: store.edges,
    conceptFamiliarities: store.conceptFamiliarities,
    due,
    quizzes,
    reminders: store.reminders,
    reminderSettings: store.reminderSettings[0]
  };
}

export async function createModule(input: {
  title: string;
  description: string;
  code?: string;
}): Promise<ModuleRecord> {
  const store = await hydrateStore();
  const moduleRecord: ModuleRecord = {
    id: createId("mod"),
    userId: store.users[0].id,
    title: input.title.trim(),
    code: input.code?.trim() || undefined,
    description: input.description.trim(),
    createdAt: new Date().toISOString()
  };

  await saveStore({
    ...store,
    modules: [...store.modules, moduleRecord]
  });

  return moduleRecord;
}

export async function createSource(input: {
  moduleId: string;
  title: string;
  content: string;
  kind?: "pdf" | "text";
  processor?: SourceProcessorPreference;
}): Promise<SourceDocument> {
  const result = await createSourceWithStatus(input);
  return result.source;
}

export async function createSourceWithStatus(input: {
  moduleId: string;
  title: string;
  content: string;
  kind?: "pdf" | "text";
  processor?: SourceProcessorPreference;
}): Promise<SourceCreationResult> {
  const store = await hydrateStore();
  const moduleRecord = store.modules.find((item) => item.id === input.moduleId);

  if (!moduleRecord) {
    throw new Error("Module not found");
  }

  const source: SourceDocument = {
    id: createId("src"),
    moduleId: input.moduleId,
    userId: store.users[0].id,
    title: input.title.trim(),
    kind: input.kind ?? "text",
    content: input.content.trim(),
    createdAt: new Date().toISOString()
  };

  const ingestionResult = await ingestIntoStore(
    {
      ...store,
      sources: [...store.sources, source]
    },
    moduleRecord,
    source,
    input.processor ?? "auto"
  );

  const refreshedStore = refreshQuizSet(ingestionResult.store);
  refreshedStore.reminders = [
    ...refreshedStore.reminders,
    ...buildReminderJobs(
      store.users[0].id,
      listDueConceptsForStore(refreshedStore)
        .slice(0, 5)
        .map((item) => item.concept.id),
      refreshedStore.reminderSettings[0]
    )
  ];

  await saveStore(refreshedStore);
  return {
    source,
    processor: ingestionResult.ingestion.processor,
    fallbackReason: ingestionResult.ingestion.fallbackReason,
    conceptCount: ingestionResult.ingestion.concepts.length,
    edgeCount: ingestionResult.ingestion.edges.length
  };
}

export async function updateConcept(
  conceptId: string,
  input: Partial<Pick<ConceptRecord, "title" | "summary" | "status" | "pinned">> & {
    familiarityRating?: FamiliarityRating;
    mergeWithId?: string;
  }
): Promise<ConceptRecord> {
  const store = await hydrateStore();
  const concept = store.concepts.find((item) => item.id === conceptId);

  if (!concept) {
    throw new Error("Concept not found");
  }

  if (input.mergeWithId) {
    const mergeTarget = store.concepts.find((item) => item.id === input.mergeWithId);
    if (!mergeTarget) {
      throw new Error("Merge target not found");
    }

    mergeTarget.moduleIds = Array.from(new Set([...mergeTarget.moduleIds, ...concept.moduleIds]));
    mergeTarget.sourceIds = Array.from(new Set([...mergeTarget.sourceIds, ...concept.sourceIds]));
    mergeTarget.evidenceRefs = [...mergeTarget.evidenceRefs, ...concept.evidenceRefs].slice(0, 8);
    mergeTarget.summary = mergeTarget.summary.length >= concept.summary.length ? mergeTarget.summary : concept.summary;
    mergeTarget.updatedAt = new Date().toISOString();

    const nextEdges = store.edges
      .map((edge) => ({
        ...edge,
        sourceConceptId: edge.sourceConceptId === concept.id ? mergeTarget.id : edge.sourceConceptId,
        targetConceptId: edge.targetConceptId === concept.id ? mergeTarget.id : edge.targetConceptId
      }))
      .filter((edge) => edge.sourceConceptId !== edge.targetConceptId);

    const nextStore = {
      ...store,
      concepts: store.concepts.filter((item) => item.id !== concept.id),
      edges: nextEdges,
      reviewStates: store.reviewStates
        .map((state) => (state.conceptId === concept.id ? { ...state, conceptId: mergeTarget.id } : state))
        .filter((state, index, states) => states.findIndex((candidate) => candidate.conceptId === state.conceptId) === index),
      conceptFamiliarities: dedupeConceptFamiliarities(
        store.conceptFamiliarities.map((record) =>
          record.conceptId === concept.id ? { ...record, conceptId: mergeTarget.id } : record
        )
      )
    };

    await saveStore(refreshQuizSet(nextStore));
    return mergeTarget;
  }

  concept.title = input.title?.trim() || concept.title;
  concept.summary = input.summary?.trim() || concept.summary;
  concept.status = input.status ?? concept.status;
  concept.pinned = input.pinned ?? concept.pinned;
  concept.updatedAt = new Date().toISOString();

  let nextStore: AppStore = store;

  if (typeof input.familiarityRating === "number") {
    const rating = normalizeFamiliarityRating(input.familiarityRating);
    const reviewState =
      store.reviewStates.find((item) => item.conceptId === concept.id) ?? ensureReviewState(store.users[0].id, concept.id);

    nextStore = {
      ...store,
      reviewStates: upsertReviewState(store.reviewStates, applyFamiliarityRating(reviewState, rating)),
      conceptFamiliarities: upsertConceptFamiliarity(store.conceptFamiliarities, {
        conceptId: concept.id,
        userId: store.users[0].id,
        rating,
        updatedAt: new Date().toISOString()
      })
    };
    nextStore = refreshQuizSet(nextStore);
  }

  await saveStore(nextStore);
  return concept;
}

export async function updateEdge(
  edgeId: string,
  input: Partial<Pick<ConceptEdgeRecord, "type" | "weight" | "pinned" | "deleted">>
): Promise<ConceptEdgeRecord> {
  const store = await hydrateStore();
  const edge = store.edges.find((item) => item.id === edgeId);

  if (!edge) {
    throw new Error("Edge not found");
  }

  if (input.type) {
    edge.type = input.type;
  }

  if (typeof input.weight === "number") {
    edge.weight = Number(Math.max(0.1, Math.min(0.99, input.weight)).toFixed(2));
  }

  if (typeof input.pinned === "boolean") {
    edge.pinned = input.pinned;
  }

  if (typeof input.deleted === "boolean") {
    edge.deleted = input.deleted;
  }

  edge.updatedAt = new Date().toISOString();
  await saveStore(store);
  return edge;
}

export async function getDueReviews(): Promise<DueConcept[]> {
  const store = await hydrateStore();
  return listDueConceptsForStore(store);
}

export async function getReminderSettings() {
  const store = await hydrateStore();
  return store.reminderSettings[0];
}

export async function updateReminderSettings(input: {
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
  dailyHour?: number;
}) {
  const store = await hydrateStore();
  const current = store.reminderSettings[0] ?? {
    userId: store.users[0].id,
    emailEnabled: true,
    inAppEnabled: true,
    dailyHour: 19,
    updatedAt: new Date().toISOString()
  };

  const nextSettings = {
    ...current,
    ...(typeof input.emailEnabled === "boolean" ? { emailEnabled: input.emailEnabled } : {}),
    ...(typeof input.inAppEnabled === "boolean" ? { inAppEnabled: input.inAppEnabled } : {}),
    ...(typeof input.dailyHour === "number"
      ? { dailyHour: Math.max(0, Math.min(23, Math.round(input.dailyHour))) }
      : {}),
    updatedAt: new Date().toISOString()
  };

  await saveStore({
    ...store,
    reminderSettings: [nextSettings]
  });

  return nextSettings;
}

export async function generateQuizzes(conceptIds?: string[]): Promise<QuizItem[]> {
  const store = await hydrateStore();
  const concepts =
    conceptIds && conceptIds.length
      ? store.concepts.filter((concept) => conceptIds.includes(concept.id))
      : getDefaultQuizConcepts(store);

  const nextQuizItems = await buildGroundedQuizItems(store, concepts, store.edges);

  await saveStore({
    ...store,
    quizItems: nextQuizItems,
    quizAttempts: reconcileQuizAttempts(nextQuizItems, store.quizAttempts)
  });

  return nextQuizItems;
}

export async function submitQuizAttempt(input: {
  quizItemId: string;
  answer: string;
}): Promise<QuizAttempt> {
  const store = await hydrateStore();
  const quizItem = store.quizItems.find((item) => item.id === input.quizItemId);

  if (!quizItem) {
    throw new Error("Quiz item not found");
  }

  const result = scoreAnswer(input.answer, quizItem.expectedAnswer);
  const attempt: QuizAttempt = {
    id: createId("attempt"),
    userId: store.users[0].id,
    quizItemId: quizItem.id,
    answer: input.answer.trim(),
    outcome: result.outcome,
    score: result.score,
    feedback: result.feedback,
    createdAt: new Date().toISOString()
  };

  const conceptId = quizItem.conceptIds[0];
  const concept = store.concepts.find((item) => item.id === conceptId);
  const reviewState =
    store.reviewStates.find((item) => item.conceptId === conceptId) ??
    ensureReviewState(store.users[0].id, conceptId);
  const nextReviewState = updateReviewState(reviewState, result.outcome);

  const nextReviewStates = upsertReviewState(store.reviewStates, nextReviewState);

  if (concept) {
    const masteryShift = {
      again: -0.1,
      hard: 0.02,
      good: 0.08,
      easy: 0.16
    }[result.outcome];

    concept.masteryScore = Number(Math.max(0, Math.min(1, concept.masteryScore + masteryShift)).toFixed(2));
    concept.status = concept.masteryScore > 0.85 ? "mastered" : concept.status;
    concept.updatedAt = new Date().toISOString();
  }

  await saveStore({
    ...store,
    quizAttempts: [...store.quizAttempts, attempt],
    reviewStates: nextReviewStates
  });

  return attempt;
}

export async function getModuleSimilarity(moduleId: string): Promise<Array<{ moduleId: string; title: string; score: number; reasons: string[] }>> {
  const store = await hydrateStore();
  const moduleRecord = store.modules.find((item) => item.id === moduleId);

  if (!moduleRecord) {
    throw new Error("Module not found");
  }

  return computeModuleSimilarity(moduleRecord, store.modules, store.concepts, store.edges);
}

export async function answerConceptQuestion(input: {
  conceptId: string;
  query: string;
}): Promise<RetrievalAnswer> {
  const store = await hydrateStore();
  const concept = store.concepts.find((item) => item.id === input.conceptId);

  if (!concept) {
    throw new Error("Concept not found");
  }

  const query = input.query.trim();
  if (!query) {
    throw new Error("Query is required");
  }

  return queryConceptEvidence({
    concept,
    chunks: store.chunks,
    query
  });
}
