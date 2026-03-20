import { readFile } from "node:fs/promises";
import path from "node:path";

import { Pool, PoolClient } from "pg";

import { seedStore } from "@/lib/seed";
import { cloneStore, normalizeStore } from "@/lib/store-utils";
import { AppStore, EvidenceRef } from "@/lib/types";

const LEGACY_STORE_ID = "default";
const ALL_TABLES = [
  "reminder_job_concepts",
  "reminder_jobs",
  "reminder_settings",
  "quiz_attempts",
  "quiz_item_evidence_refs",
  "quiz_item_concepts",
  "quiz_items",
  "concept_familiarities",
  "review_states",
  "edge_evidence_refs",
  "concept_edges",
  "concept_evidence_refs",
  "concept_sources",
  "concepts",
  "evidence_refs",
  "chunks",
  "sources",
  "modules",
  "users"
] as const;

declare global {
  var __learningOptimizerPgPool: Pool | undefined;
}

let schemaSqlPromise: Promise<string> | null = null;

interface OrderedReferenceRow {
  owner_id: string;
  value_id: string;
  sort_order: number;
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the Postgres store");
  }

  if (!globalThis.__learningOptimizerPgPool) {
    globalThis.__learningOptimizerPgPool = new Pool({
      connectionString
    });
  }

  return globalThis.__learningOptimizerPgPool;
}

async function loadSchemaSql(): Promise<string> {
  if (!schemaSqlPromise) {
    schemaSqlPromise = readFile(path.join(process.cwd(), "db", "postgres.sql"), "utf8");
  }

  return schemaSqlPromise;
}

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(await loadSchemaSql());
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIsoString(value: string | Date | null | undefined): string | undefined {
  return value ? toIsoString(value) : undefined;
}

function normalizeNumberArray(values: number[] | string[]): number[] {
  return values.map((value) => Number(value));
}

function orderedUniqueIds(values: string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

function collectEvidenceRefs(store: AppStore): EvidenceRef[] {
  const evidenceById = new Map<string, EvidenceRef>();

  const append = (ref: EvidenceRef) => {
    if (!evidenceById.has(ref.id)) {
      evidenceById.set(ref.id, ref);
    }
  };

  store.concepts.forEach((concept) => {
    concept.evidenceRefs.forEach(append);
  });
  store.edges.forEach((edge) => {
    edge.evidenceRefs.forEach(append);
  });
  store.quizItems.forEach((item) => {
    item.evidenceRefs.forEach(append);
  });

  return Array.from(evidenceById.values());
}

function groupOrderedValues(rows: OrderedReferenceRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  rows.forEach((row) => {
    const current = grouped.get(row.owner_id) ?? [];
    current.push(row.value_id);
    grouped.set(row.owner_id, current);
  });

  return grouped;
}

function groupEvidenceRefs(rows: OrderedReferenceRow[], evidenceById: Map<string, EvidenceRef>): Map<string, EvidenceRef[]> {
  const grouped = new Map<string, EvidenceRef[]>();

  rows.forEach((row) => {
    const evidence = evidenceById.get(row.value_id);
    if (!evidence) {
      return;
    }

    const current = grouped.get(row.owner_id) ?? [];
    current.push(evidence);
    grouped.set(row.owner_id, current);
  });

  return grouped;
}

async function hasNormalizedData(client: PoolClient): Promise<boolean> {
  const result = await client.query("SELECT 1 FROM users LIMIT 1");
  return Boolean(result.rowCount);
}

async function loadLegacySnapshot(client: PoolClient): Promise<Partial<AppStore> | null> {
  const tableResult = await client.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.app_state')::text AS table_name"
  );

  if (!tableResult.rows[0]?.table_name) {
    return null;
  }

  const snapshotResult = await client.query<{ payload: Partial<AppStore> }>(
    "SELECT payload FROM app_state WHERE id = $1",
    [LEGACY_STORE_ID]
  );

  return snapshotResult.rowCount ? snapshotResult.rows[0].payload : null;
}

async function clearNormalizedTables(client: PoolClient): Promise<void> {
  await client.query(`TRUNCATE TABLE ${ALL_TABLES.join(", ")}`);
}

async function writeNormalizedStore(client: PoolClient, store: AppStore): Promise<void> {
  const normalized = normalizeStore(store);
  const evidenceRefs = collectEvidenceRefs(normalized);

  await clearNormalizedTables(client);

  for (const user of normalized.users) {
    await client.query(
      `
        INSERT INTO users (id, name, email)
        VALUES ($1, $2, $3)
      `,
      [user.id, user.name, user.email]
    );
  }

  for (const moduleRecord of normalized.modules) {
    await client.query(
      `
        INSERT INTO modules (id, user_id, title, code, description, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        moduleRecord.id,
        moduleRecord.userId,
        moduleRecord.title,
        moduleRecord.code ?? null,
        moduleRecord.description,
        moduleRecord.createdAt
      ]
    );
  }

  for (const source of normalized.sources) {
    await client.query(
      `
        INSERT INTO sources (id, module_id, title, kind, content, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [source.id, source.moduleId, source.title, source.kind, source.content, source.createdAt]
    );
  }

  for (const chunk of normalized.chunks) {
    await client.query(
      `
        INSERT INTO chunks (id, source_id, text, embedding, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [chunk.id, chunk.sourceId, chunk.text, chunk.embedding, chunk.createdAt]
    );
  }

  for (const evidence of evidenceRefs) {
    await client.query(
      `
        INSERT INTO evidence_refs (id, source_id, chunk_id, excerpt)
        VALUES ($1, $2, $3, $4)
      `,
      [evidence.id, evidence.sourceId, evidence.chunkId, evidence.excerpt]
    );
  }

  for (const concept of normalized.concepts) {
    await client.query(
      `
        INSERT INTO concepts (
          id,
          user_id,
          title,
          summary,
          mastery_score,
          confidence,
          status,
          pinned,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        concept.id,
        concept.userId,
        concept.title,
        concept.summary,
        concept.masteryScore,
        concept.confidence,
        concept.status,
        concept.pinned,
        concept.createdAt,
        concept.updatedAt
      ]
    );

    for (const sourceId of orderedUniqueIds(concept.sourceIds)) {
      await client.query(
        `
          INSERT INTO concept_sources (concept_id, source_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [concept.id, sourceId]
      );
    }

    for (const [index, evidence] of orderedUniqueIds(concept.evidenceRefs.map((ref) => ref.id)).entries()) {
      await client.query(
        `
          INSERT INTO concept_evidence_refs (concept_id, evidence_ref_id, sort_order)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
        [concept.id, evidence, index]
      );
    }
  }

  for (const edge of normalized.edges) {
    await client.query(
      `
        INSERT INTO concept_edges (
          id,
          user_id,
          source_concept_id,
          target_concept_id,
          type,
          weight,
          pinned,
          deleted,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        edge.id,
        edge.userId,
        edge.sourceConceptId,
        edge.targetConceptId,
        edge.type,
        edge.weight,
        edge.pinned,
        edge.deleted,
        edge.createdAt,
        edge.updatedAt
      ]
    );

    for (const [index, evidence] of orderedUniqueIds(edge.evidenceRefs.map((ref) => ref.id)).entries()) {
      await client.query(
        `
          INSERT INTO edge_evidence_refs (edge_id, evidence_ref_id, sort_order)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
        [edge.id, evidence, index]
      );
    }
  }

  for (const state of normalized.reviewStates) {
    await client.query(
      `
        INSERT INTO review_states (
          user_id,
          concept_id,
          stability,
          difficulty,
          retrievability,
          due_at,
          last_reviewed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        state.userId,
        state.conceptId,
        state.stability,
        state.difficulty,
        state.retrievability,
        state.dueAt,
        state.lastReviewedAt ?? null
      ]
    );
  }

  for (const familiarity of normalized.conceptFamiliarities) {
    await client.query(
      `
        INSERT INTO concept_familiarities (user_id, concept_id, rating, updated_at)
        VALUES ($1, $2, $3, $4)
      `,
      [familiarity.userId, familiarity.conceptId, familiarity.rating, familiarity.updatedAt]
    );
  }

  for (const item of normalized.quizItems) {
    await client.query(
      `
        INSERT INTO quiz_items (id, user_id, type, prompt, expected_answer, rubric, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [item.id, item.userId, item.type, item.prompt, item.expectedAnswer, item.rubric, item.createdAt]
    );

    for (const [index, conceptId] of orderedUniqueIds(item.conceptIds).entries()) {
      await client.query(
        `
          INSERT INTO quiz_item_concepts (quiz_item_id, concept_id, sort_order)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
        [item.id, conceptId, index]
      );
    }

    for (const [index, evidence] of orderedUniqueIds(item.evidenceRefs.map((ref) => ref.id)).entries()) {
      await client.query(
        `
          INSERT INTO quiz_item_evidence_refs (quiz_item_id, evidence_ref_id, sort_order)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
        [item.id, evidence, index]
      );
    }
  }

  for (const attempt of normalized.quizAttempts) {
    await client.query(
      `
        INSERT INTO quiz_attempts (
          id,
          user_id,
          quiz_item_id,
          answer,
          outcome,
          score,
          feedback,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        attempt.id,
        attempt.userId,
        attempt.quizItemId,
        attempt.answer,
        attempt.outcome,
        attempt.score,
        attempt.feedback,
        attempt.createdAt
      ]
    );
  }

  for (const settings of normalized.reminderSettings) {
    await client.query(
      `
        INSERT INTO reminder_settings (
          user_id,
          email_enabled,
          in_app_enabled,
          daily_hour,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        settings.userId,
        settings.emailEnabled,
        settings.inAppEnabled,
        settings.dailyHour,
        settings.updatedAt
      ]
    );
  }

  for (const job of normalized.reminders) {
    await client.query(
      `
        INSERT INTO reminder_jobs (id, user_id, channel, sent_at)
        VALUES ($1, $2, $3, $4)
      `,
      [job.id, job.userId, job.channel, job.sentAt]
    );

    for (const [index, conceptId] of orderedUniqueIds(job.dueConceptIds).entries()) {
      await client.query(
        `
          INSERT INTO reminder_job_concepts (reminder_job_id, concept_id, sort_order)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
        [job.id, conceptId, index]
      );
    }
  }
}

async function migrateLegacySnapshotIfNeeded(client: PoolClient): Promise<void> {
  if (await hasNormalizedData(client)) {
    return;
  }

  const legacySnapshot = await loadLegacySnapshot(client);
  if (!legacySnapshot) {
    return;
  }

  await writeNormalizedStore(client, normalizeStore(legacySnapshot));
}

export async function bootstrapPostgresStore(): Promise<void> {
  const pool = getPool();
  await ensureSchema(pool);
}

export async function loadStoreFromPostgres(): Promise<AppStore> {
  const pool = getPool();
  await ensureSchema(pool);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await migrateLegacySnapshotIfNeeded(client);

    const usersResult = await client.query<{
      id: string;
      name: string;
      email: string;
    }>("SELECT id, name, email FROM users ORDER BY id");

    if (!usersResult.rowCount) {
      const seeded = seedStore();
      await writeNormalizedStore(client, seeded);
      await client.query("COMMIT");
      return cloneStore(seeded);
    }

    const [
      modulesResult,
      sourcesResult,
      chunksResult,
      evidenceResult,
      conceptSourceResult,
      conceptEvidenceResult,
      conceptsResult,
      edgesResult,
      edgeEvidenceResult,
      reviewStatesResult,
      conceptFamiliaritiesResult,
      quizItemsResult,
      quizItemConceptsResult,
      quizItemEvidenceResult,
      quizAttemptsResult,
      reminderSettingsResult,
      reminderJobsResult,
      reminderJobConceptsResult
    ] = await Promise.all([
      client.query<{
        id: string;
        user_id: string;
        title: string;
        code: string | null;
        description: string;
        created_at: string | Date;
      }>("SELECT id, user_id, title, code, description, created_at FROM modules ORDER BY created_at, id"),
      client.query<{
        id: string;
        module_id: string;
        user_id: string;
        title: string;
        kind: "pdf" | "text";
        content: string;
        created_at: string | Date;
      }>(
        `
          SELECT sources.id, sources.module_id, modules.user_id, sources.title, sources.kind, sources.content, sources.created_at
          FROM sources
          JOIN modules ON modules.id = sources.module_id
          ORDER BY sources.created_at, sources.id
        `
      ),
      client.query<{
        id: string;
        source_id: string;
        module_id: string;
        user_id: string;
        text: string;
        embedding: number[] | string[];
        created_at: string | Date;
      }>(
        `
          SELECT chunks.id, chunks.source_id, sources.module_id, modules.user_id, chunks.text, chunks.embedding, chunks.created_at
          FROM chunks
          JOIN sources ON sources.id = chunks.source_id
          JOIN modules ON modules.id = sources.module_id
          ORDER BY chunks.created_at, chunks.id
        `
      ),
      client.query<{
        id: string;
        source_id: string;
        chunk_id: string;
        excerpt: string;
      }>("SELECT id, source_id, chunk_id, excerpt FROM evidence_refs ORDER BY created_at, id"),
      client.query<OrderedReferenceRow>(
        `
          SELECT concept_id AS owner_id, source_id AS value_id, 0 AS sort_order
          FROM concept_sources
          ORDER BY concept_id, source_id
        `
      ),
      client.query<OrderedReferenceRow>(
        `
          SELECT concept_id AS owner_id, evidence_ref_id AS value_id, sort_order
          FROM concept_evidence_refs
          ORDER BY concept_id, sort_order, evidence_ref_id
        `
      ),
      client.query<{
        id: string;
        user_id: string;
        title: string;
        summary: string;
        mastery_score: number;
        confidence: number;
        status: "active" | "confusing" | "mastered";
        pinned: boolean;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `
          SELECT id, user_id, title, summary, mastery_score, confidence, status, pinned, created_at, updated_at
          FROM concepts
          ORDER BY created_at, id
        `
      ),
      client.query<{
        id: string;
        user_id: string;
        source_concept_id: string;
        target_concept_id: string;
        type: AppStore["edges"][number]["type"];
        weight: number;
        pinned: boolean;
        deleted: boolean;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `
          SELECT id, user_id, source_concept_id, target_concept_id, type, weight, pinned, deleted, created_at, updated_at
          FROM concept_edges
          ORDER BY created_at, id
        `
      ),
      client.query<OrderedReferenceRow>(
        `
          SELECT edge_id AS owner_id, evidence_ref_id AS value_id, sort_order
          FROM edge_evidence_refs
          ORDER BY edge_id, sort_order, evidence_ref_id
        `
      ),
      client.query<{
        user_id: string;
        concept_id: string;
        stability: number;
        difficulty: number;
        retrievability: number;
        due_at: string | Date;
        last_reviewed_at: string | Date | null;
      }>(
        `
          SELECT user_id, concept_id, stability, difficulty, retrievability, due_at, last_reviewed_at
          FROM review_states
          ORDER BY due_at, concept_id
        `
      ),
      client.query<{
        user_id: string;
        concept_id: string;
        rating: 1 | 2 | 3 | 4 | 5;
        updated_at: string | Date;
      }>(
        `
          SELECT user_id, concept_id, rating, updated_at
          FROM concept_familiarities
          ORDER BY updated_at DESC, concept_id
        `
      ),
      client.query<{
        id: string;
        user_id: string;
        type: AppStore["quizItems"][number]["type"];
        prompt: string;
        expected_answer: string;
        rubric: string;
        created_at: string | Date;
      }>(
        `
          SELECT id, user_id, type, prompt, expected_answer, rubric, created_at
          FROM quiz_items
          ORDER BY created_at, id
        `
      ),
      client.query<OrderedReferenceRow>(
        `
          SELECT quiz_item_id AS owner_id, concept_id AS value_id, sort_order
          FROM quiz_item_concepts
          ORDER BY quiz_item_id, sort_order, concept_id
        `
      ),
      client.query<OrderedReferenceRow>(
        `
          SELECT quiz_item_id AS owner_id, evidence_ref_id AS value_id, sort_order
          FROM quiz_item_evidence_refs
          ORDER BY quiz_item_id, sort_order, evidence_ref_id
        `
      ),
      client.query<{
        id: string;
        user_id: string;
        quiz_item_id: string;
        answer: string;
        outcome: AppStore["quizAttempts"][number]["outcome"];
        score: number;
        feedback: string;
        created_at: string | Date;
      }>(
        `
          SELECT id, user_id, quiz_item_id, answer, outcome, score, feedback, created_at
          FROM quiz_attempts
          ORDER BY created_at, id
        `
      ),
      client.query<{
        user_id: string;
        email_enabled: boolean;
        in_app_enabled: boolean;
        daily_hour: number;
        updated_at: string | Date;
      }>(
        `
          SELECT user_id, email_enabled, in_app_enabled, daily_hour, updated_at
          FROM reminder_settings
          ORDER BY user_id
        `
      ),
      client.query<{
        id: string;
        user_id: string;
        channel: "in_app" | "email";
        sent_at: string | Date;
      }>(
        `
          SELECT id, user_id, channel, sent_at
          FROM reminder_jobs
          ORDER BY sent_at, id
        `
      ),
      client.query<OrderedReferenceRow>(
        `
          SELECT reminder_job_id AS owner_id, concept_id AS value_id, sort_order
          FROM reminder_job_concepts
          ORDER BY reminder_job_id, sort_order, concept_id
        `
      )
    ]);

    await client.query("COMMIT");

    const users = usersResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email
    }));

    const modules = modulesResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      code: row.code ?? undefined,
      description: row.description,
      createdAt: toIsoString(row.created_at)
    }));

    const sources = sourcesResult.rows.map((row) => ({
      id: row.id,
      moduleId: row.module_id,
      userId: row.user_id,
      title: row.title,
      kind: row.kind,
      content: row.content,
      createdAt: toIsoString(row.created_at)
    }));

    const chunks = chunksResult.rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      moduleId: row.module_id,
      userId: row.user_id,
      text: row.text,
      embedding: normalizeNumberArray(row.embedding),
      createdAt: toIsoString(row.created_at)
    }));

    const evidenceById = new Map(
      evidenceResult.rows.map((row) => [
        row.id,
        {
          id: row.id,
          sourceId: row.source_id,
          chunkId: row.chunk_id,
          excerpt: row.excerpt
        }
      ])
    );

    const conceptSourceIds = groupOrderedValues(conceptSourceResult.rows);
    const conceptEvidenceRefs = groupEvidenceRefs(conceptEvidenceResult.rows, evidenceById);
    const edgeEvidenceRefs = groupEvidenceRefs(edgeEvidenceResult.rows, evidenceById);
    const quizItemConceptIds = groupOrderedValues(quizItemConceptsResult.rows);
    const quizItemEvidenceRefs = groupEvidenceRefs(quizItemEvidenceResult.rows, evidenceById);
    const reminderJobConceptIds = groupOrderedValues(reminderJobConceptsResult.rows);
    const sourceModuleById = new Map(sources.map((source) => [source.id, source.moduleId]));

    const concepts = conceptsResult.rows.map((row) => {
      const sourceIds = conceptSourceIds.get(row.id) ?? [];
      const moduleIds = orderedUniqueIds(
        sourceIds
          .map((sourceId) => sourceModuleById.get(sourceId))
          .filter((moduleId): moduleId is string => Boolean(moduleId))
      );

      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        summary: row.summary,
        moduleIds,
        sourceIds,
        evidenceRefs: conceptEvidenceRefs.get(row.id) ?? [],
        masteryScore: Number(row.mastery_score),
        confidence: Number(row.confidence),
        status: row.status,
        pinned: row.pinned,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at)
      };
    });

    const edges = edgesResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      sourceConceptId: row.source_concept_id,
      targetConceptId: row.target_concept_id,
      type: row.type,
      weight: Number(row.weight),
      evidenceRefs: edgeEvidenceRefs.get(row.id) ?? [],
      pinned: row.pinned,
      deleted: row.deleted,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at)
    }));

    const reviewStates = reviewStatesResult.rows.map((row) => ({
      conceptId: row.concept_id,
      userId: row.user_id,
      stability: Number(row.stability),
      difficulty: Number(row.difficulty),
      retrievability: Number(row.retrievability),
      dueAt: toIsoString(row.due_at),
      lastReviewedAt: toOptionalIsoString(row.last_reviewed_at)
    }));

    const conceptFamiliarities = conceptFamiliaritiesResult.rows.map((row) => ({
      conceptId: row.concept_id,
      userId: row.user_id,
      rating: row.rating,
      updatedAt: toIsoString(row.updated_at)
    }));

    const quizItems = quizItemsResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      conceptIds: quizItemConceptIds.get(row.id) ?? [],
      type: row.type,
      prompt: row.prompt,
      expectedAnswer: row.expected_answer,
      rubric: row.rubric,
      evidenceRefs: quizItemEvidenceRefs.get(row.id) ?? [],
      createdAt: toIsoString(row.created_at)
    }));

    const quizAttempts = quizAttemptsResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      quizItemId: row.quiz_item_id,
      answer: row.answer,
      outcome: row.outcome,
      score: Number(row.score),
      feedback: row.feedback,
      createdAt: toIsoString(row.created_at)
    }));

    const reminders = reminderJobsResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      dueConceptIds: reminderJobConceptIds.get(row.id) ?? [],
      channel: row.channel,
      sentAt: toIsoString(row.sent_at)
    }));

    const reminderSettings = reminderSettingsResult.rows.map((row) => ({
      userId: row.user_id,
      emailEnabled: row.email_enabled,
      inAppEnabled: row.in_app_enabled,
      dailyHour: row.daily_hour,
      updatedAt: toIsoString(row.updated_at)
    }));

    return cloneStore(
      normalizeStore({
        users,
        modules,
        sources,
        chunks,
        concepts,
        edges,
        reviewStates,
        conceptFamiliarities,
        quizItems,
        quizAttempts,
        reminders,
        reminderSettings
      })
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveStoreToPostgres(store: AppStore): Promise<AppStore> {
  const pool = getPool();
  await ensureSchema(pool);

  const normalized = normalizeStore(store);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await writeNormalizedStore(client, normalized);
    await client.query("COMMIT");
    return cloneStore(normalized);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgresPool(): Promise<void> {
  if (!globalThis.__learningOptimizerPgPool) {
    return;
  }

  await globalThis.__learningOptimizerPgPool.end();
  globalThis.__learningOptimizerPgPool = undefined;
}
