# Learning Optimizer Project Overview

For the fastest repo re-entry point, read `docs/HANDOFF.md` first.

## Purpose

Learning Optimizer is a study system that tries to connect three things that are usually separate:

- knowledge capture
- knowledge structure
- memory retention

Instead of storing notes as flat documents, the system turns source material into a graph of concepts and relationships. That graph becomes the basis for review scheduling, quiz generation, and future recommendation logic.

## Product Vision

The long-term direction is an AI-powered knowledge graph for learning, similar in spirit to visual note-linking systems, but grounded in source evidence and tied to active recall.

The desired outcome is:

- users understand how ideas connect across modules
- users know what to revise next
- users can test whether they truly understand a concept

Near-term product direction:

- the experience should become a guided flow, not a collection of separate workspaces
- users should stay in upload after ingest and see clear subject-level progress
- the map should support both a library graph and a concept graph
- users should rate familiarity per concept before the quiz step
- Gemini should become the primary semantic ingestion and retrieval layer for uploaded notes

## What Exists Today

The current repo contains a functional prototype with these implemented capabilities.

Important distinction:

- the repo now ships a guided post-login journey from upload to map to familiarity to quiz to review
- the remaining work is to deepen retrieval, PDF support, persistence, and auth rather than to invent the basic workflow

### Ingestion

The system can:

- create modules
- create learning sources
- accept pasted text plus `.txt`, `.md`, and text-based `.pdf` uploads
- stay in upload after ingest and show per-subject note counts plus latest-note metadata
- chunk source text
- generate heuristic chunk vectors by default
- extract candidate concepts from chunks

This is now hybrid rather than fully heuristic:

- Gemini semantic extraction is available for active ingest
- Gemini chunk embeddings are available for active ingest
- the fallback path still uses heuristic chunk vectors and concept extraction

Current limit:

- PDF ingest is server-side and stable for text-based PDFs, but scanned or image-only PDFs still need OCR

### Retrieval

The repo now has a first retrieval-backed capability.

The current retrieval layer can:

- embed live concept questions
- rank stored chunks semantically
- answer concept-specific questions against retrieved evidence
- regenerate concept quiz prompts with retrieved chunk grounding
- fall back to heuristic retrieval when Gemini is unavailable

Current limit:

- retrieval is exposed in concept detail and explicit quiz regeneration, but not yet in a broader search UI

### Graph Generation

The graph layer can:

- merge overlapping concepts
- create weighted concept edges
- tag relationship types such as similarity, prerequisite, part-of, applies-to, and contrast
- compute module similarity based on concept overlap and cross-module edges
- expose a `Library` mode for subjects and notes
- show note-count badges on subject nodes
- expand subject nodes into note nodes
- route note selection into note-scoped quiz generation
- keep the library graph radial, springy, and draggable
- cap large branches with a `+N more` overflow node while the drawer keeps the full note list

### Review Scheduling

The review engine maintains a per-concept state for spaced repetition.

Current review state fields:

- `stability`
- `difficulty`
- `retrievability`
- `dueAt`
- `lastReviewedAt`

This is an FSRS-style approximation suitable for a prototype.

Planned next direction:

- add a user-specific familiarity rating per concept before or alongside review scheduling so the system can blend self-assessment with later quiz outcomes

### Quiz Generation

The quiz engine can generate:

- flashcard prompts
- short-answer prompts
- concept relationship prompts

Quiz attempts are scored using expected-answer overlap and then fed back into the review schedule and mastery score.

### Reminder Settings

The repo now includes reminder settings with persisted delivery preferences.

Current reminder settings:

- `emailEnabled`
- `inAppEnabled`
- `dailyHour`
- `updatedAt`

Reminder jobs are still stored locally as prototype data.

## Key Files

### Application Orchestration

- `src/lib/app.ts`

This file coordinates the main product flows:

- ingesting sources
- hydrating the store
- generating dashboard snapshots
- updating concepts and edges
- generating quizzes
- submitting quiz attempts
- updating reminder settings

### Domain Types

- `src/lib/types.ts`

This file defines the shared data structures used by the UI, APIs, and service layer.

### Persistence

- `src/lib/store.ts`
- `src/lib/postgres-store.ts`
- `src/lib/bootstrap-store.ts`
- `scripts/bootstrap-postgres.ts`
- `scripts/import-local-store.ts`

The repo now supports two persistence modes behind the same store interface:

- local JSON persistence under `.data/`
- PostgreSQL persistence when `DATABASE_URL` is set

The current Postgres adapter writes the app state into normalized relational tables defined in `db/postgres.sql`.

The app layer still uses the existing `AppStore` contract, so the adapter currently translates between the in-memory store shape and the normalized tables.

Bootstrap/import tooling now exists to move a local `.data/store.json` snapshot into that normalized schema.

### Service Layer

- `src/lib/services/ingestion.ts`
- `src/lib/services/graph.ts`
- `src/lib/services/pdf.ts`
- `src/lib/services/retrieval.ts`
- `src/lib/services/review.ts`
- `src/lib/services/quiz.ts`

These files isolate the core product logic from the UI.

### Frontend

- `src/components/dashboard-shell.tsx`
- `src/components/graph-canvas.tsx`
- `src/components/library-graph.tsx`
- `src/components/intake-panel.tsx`
- `src/components/study-queue.tsx`
- `src/components/quiz-panel.tsx`
- `src/components/reminder-panel.tsx`

These components power the current guided shell.

## API Surface

The repo currently exposes these main routes:

- `GET/POST /api/modules`
- `GET/POST /api/sources`
- `GET /api/graph`
- `PATCH /api/concepts/[id]`
- `POST /api/concepts/[id]/evidence`
- `PATCH /api/edges/[id]`
- `GET /api/reviews/due`
- `POST /api/quizzes/generate`
- `POST /api/quiz-attempts`
- `GET /api/modules/[id]/similar`
- `GET/POST /api/reminders`
- `GET /api/dashboard`

## Current Limitations

This is still a functional prototype, not a production system.

Important current limits:

- the Postgres path still rewrites a whole normalized store rather than using narrower repositories
- retrieval is only partially integrated and not yet exposed as general note search
- PDF ingestion still needs OCR and stronger extraction quality for more complex documents
- the library graph handles large branches with overflow, but very dense subjects still need more advanced clustering/search
- no auth or user isolation beyond the demo data model
- no real background queue for scheduled jobs
- graph layout is persisted in browser workspace state, but graph curation changes are not yet durable app state

## Recommended Next Build Steps

### 1. Improve Retrieval Surface

Extend the current RAG slice beyond concept detail and quiz regeneration:

- add broader note search
- expose evidence lookups in more study surfaces
- keep note-scoped quiz flows grounded in retrieved chunks

### 2. Improve Ingestion Depth

Continue hardening and improving the backend ingest path:

- accept richer note inputs
- add OCR or scanned-PDF support
- keep sending uploaded note content through Gemini processing
- persist structured concept, relationship, summary, and evidence output
- keep the app grounded in persisted evidence after ingestion
- harden the server-side PDF path with better extraction handling and validation

### 3. Expand Retrieval

- reuse retrieval for quiz generation and grounded note search
- keep answers tied to retrieved chunk evidence
- make retrieval quality less dependent on one concept-detail surface

### 3. Persist Graph Workspace

- keep manual layout persistence
- persist graph curation actions in durable app state
- make the graph a real workspace instead of only a browser-session visualization

### 4. Upgrade Persistence

Split the normalized Postgres adapter into repository-style reads and writes so persistence stops depending on full-store rewrites.

### 5. Add Production Reminder Delivery

Move from stored reminder jobs to actual scheduled sending through email and in-app notification infrastructure.

### 6. Harden Evaluation

Improve quiz grading and mastery updates so concept understanding is measured more reliably.

## Development Notes

The codebase is intentionally organized so the learning logic is not tightly coupled to the interface.

That separation should make it easier to:

- redesign the UI later
- replace the persistence layer
- move from heuristic to AI-backed processing
- add more input channels without rewriting the core graph/review loop
