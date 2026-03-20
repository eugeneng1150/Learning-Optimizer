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
- users should upload notes and land on a generated mindmap first
- users should rate familiarity per concept before the quiz step
- Gemini should become the primary semantic ingestion layer for uploaded notes

## What Exists Today

The current repo contains a functional prototype with these implemented capabilities.

Important distinction:

- the current implementation is still a workspace-first prototype
- the intended next UX is a guided post-login journey from upload to map to familiarity to quiz to review

### Ingestion

The system can:

- create modules
- create learning sources
- chunk source text
- generate lightweight embedding-like vectors
- extract candidate concepts from chunks

This is currently heuristic rather than model-backed.

Important current limit:

- the repo does not yet implement real PDF extraction; `kind: "pdf"` exists in the data model, but the active ingest path still assumes text content is already available

Planned next direction:

- uploaded notes should be sent through Gemini-backed semantic processing
- Gemini should return structured concepts, relationships, summaries, and grounded evidence
- the app should persist the resulting graph and review-ready data for later quiz and study flows

### Graph Generation

The graph layer can:

- merge overlapping concepts
- create weighted concept edges
- tag relationship types such as similarity, prerequisite, part-of, applies-to, and contrast
- compute module similarity based on concept overlap and cross-module edges

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
- `src/lib/services/review.ts`
- `src/lib/services/quiz.ts`

These files isolate the core product logic from the UI.

### Frontend

- `src/components/dashboard-shell.tsx`
- `src/components/graph-canvas.tsx`
- `src/components/intake-panel.tsx`
- `src/components/study-queue.tsx`
- `src/components/quiz-panel.tsx`
- `src/components/reminder-panel.tsx`

These components power the current multi-workspace interface.

## API Surface

The repo currently exposes these main routes:

- `GET/POST /api/modules`
- `GET/POST /api/sources`
- `GET /api/graph`
- `PATCH /api/concepts/[id]`
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
- heuristic extraction instead of LLM-backed extraction
- text-first ingestion instead of full document ingestion
- no auth or user isolation beyond the demo data model
- no real background queue for scheduled jobs
- the UI is still organized as separate workspaces with too many competing actions

## Recommended Next Build Steps

### 1. Redesign The Product Flow

Restructure the UI around a clearer guided journey:

- upload notes
- inspect generated mindmap
- rate familiarity
- generate quizzes
- continue review

### 2. Improve Ingestion

Add Gemini-backed semantic ingestion for uploaded notes:

- accept richer note inputs
- send uploaded note content through Gemini processing
- persist structured concept, relationship, summary, and evidence output
- keep the app grounded in persisted evidence after ingestion

### 3. Add Familiarity-Guided Study

Introduce a user-specific per-concept familiarity rating so study and quiz flows can reflect self-assessed confidence before later quiz outcomes refine the schedule.

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
