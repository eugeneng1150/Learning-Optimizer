-- Normalized PostgreSQL bootstrap schema for Learning Optimizer.
-- The runtime Postgres adapter can import legacy app_state snapshot data into
-- these tables on first load when that older table is still present.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  code TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS modules_user_created_idx
  ON modules (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'text')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sources_module_created_idx
  ON sources (module_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  embedding DOUBLE PRECISION[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (COALESCE(array_length(embedding, 1), 0) > 0)
);

CREATE INDEX IF NOT EXISTS chunks_source_created_idx
  ON chunks (source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  mastery_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'confusing', 'mastered')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (mastery_score >= 0 AND mastery_score <= 1),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS concepts_user_updated_idx
  ON concepts (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS concepts_title_idx
  ON concepts (lower(title));

CREATE TABLE IF NOT EXISTS concept_sources (
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, source_id)
);

CREATE INDEX IF NOT EXISTS concept_sources_source_idx
  ON concept_sources (source_id, concept_id);

CREATE TABLE IF NOT EXISTS evidence_refs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  excerpt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_refs_chunk_idx
  ON evidence_refs (chunk_id);

CREATE TABLE IF NOT EXISTS concept_evidence_refs (
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  evidence_ref_id TEXT NOT NULL REFERENCES evidence_refs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (concept_id, evidence_ref_id),
  UNIQUE (concept_id, sort_order)
);

CREATE INDEX IF NOT EXISTS concept_evidence_refs_evidence_idx
  ON concept_evidence_refs (evidence_ref_id, concept_id);

CREATE TABLE IF NOT EXISTS concept_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('similar_to', 'prerequisite_of', 'part_of', 'applies_to', 'contrasts_with')
  ),
  weight DOUBLE PRECISION NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_concept_id <> target_concept_id),
  CHECK (weight >= 0 AND weight <= 1)
);

CREATE INDEX IF NOT EXISTS concept_edges_source_idx
  ON concept_edges (source_concept_id, deleted);

CREATE INDEX IF NOT EXISTS concept_edges_target_idx
  ON concept_edges (target_concept_id, deleted);

CREATE INDEX IF NOT EXISTS concept_edges_user_updated_idx
  ON concept_edges (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS edge_evidence_refs (
  edge_id TEXT NOT NULL REFERENCES concept_edges(id) ON DELETE CASCADE,
  evidence_ref_id TEXT NOT NULL REFERENCES evidence_refs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (edge_id, evidence_ref_id),
  UNIQUE (edge_id, sort_order)
);

CREATE INDEX IF NOT EXISTS edge_evidence_refs_evidence_idx
  ON edge_evidence_refs (evidence_ref_id, edge_id);

CREATE TABLE IF NOT EXISTS review_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  stability DOUBLE PRECISION NOT NULL,
  difficulty DOUBLE PRECISION NOT NULL,
  retrievability DOUBLE PRECISION NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  last_reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, concept_id),
  CHECK (stability > 0),
  CHECK (difficulty >= 1 AND difficulty <= 10),
  CHECK (retrievability >= 0 AND retrievability <= 1)
);

CREATE INDEX IF NOT EXISTS review_states_due_idx
  ON review_states (user_id, due_at);

CREATE TABLE IF NOT EXISTS concept_familiarities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, concept_id),
  CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS concept_familiarities_updated_idx
  ON concept_familiarities (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS quiz_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flashcard', 'short_answer', 'relationship')),
  prompt TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  rubric TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_items_user_created_idx
  ON quiz_items (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_item_concepts (
  quiz_item_id TEXT NOT NULL REFERENCES quiz_items(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (quiz_item_id, concept_id),
  UNIQUE (quiz_item_id, sort_order)
);

CREATE INDEX IF NOT EXISTS quiz_item_concepts_concept_idx
  ON quiz_item_concepts (concept_id, quiz_item_id);

CREATE TABLE IF NOT EXISTS quiz_item_evidence_refs (
  quiz_item_id TEXT NOT NULL REFERENCES quiz_items(id) ON DELETE CASCADE,
  evidence_ref_id TEXT NOT NULL REFERENCES evidence_refs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (quiz_item_id, evidence_ref_id),
  UNIQUE (quiz_item_id, sort_order)
);

CREATE INDEX IF NOT EXISTS quiz_item_evidence_refs_evidence_idx
  ON quiz_item_evidence_refs (evidence_ref_id, quiz_item_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_item_id TEXT NOT NULL REFERENCES quiz_items(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('again', 'hard', 'good', 'easy')),
  score DOUBLE PRECISION NOT NULL,
  feedback TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (score >= 0 AND score <= 1)
);

CREATE INDEX IF NOT EXISTS quiz_attempts_quiz_item_created_idx
  ON quiz_attempts (quiz_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quiz_attempts_user_created_idx
  ON quiz_attempts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reminder_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  daily_hour INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (daily_hour >= 0 AND daily_hour <= 23)
);

CREATE TABLE IF NOT EXISTS reminder_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminder_jobs_user_sent_idx
  ON reminder_jobs (user_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS reminder_job_concepts (
  reminder_job_id TEXT NOT NULL REFERENCES reminder_jobs(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (reminder_job_id, concept_id),
  UNIQUE (reminder_job_id, sort_order)
);

CREATE INDEX IF NOT EXISTS reminder_job_concepts_concept_idx
  ON reminder_job_concepts (concept_id, reminder_job_id);
