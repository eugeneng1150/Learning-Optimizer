# Handoff

This file is the shortest reliable starting point for a new AI agent or a new conversation thread.

If you are picking up work on this repo, read this file first, then read:

- `README.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/AGENTS.md`
- `docs/PARALLEL_POSTGRES_PLAN.md` if the active task is Postgres normalization

## Project

Learning Optimizer is a Next.js web app for turning study material into:

- a concept graph
- a spaced-repetition study queue
- a quiz/testing loop
- reminder settings and reminder job state

## Current Repo State

The repo is functional and builds successfully.

Verified recently:

- `npm test`
- `npm run build`

## What Is Implemented

### Frontend

- dashboard shell with separate workspaces
- graph workspace
- study queue
- quiz workspace
- ingest workspace
- reminder settings panel

### Backend / App Layer

- module creation
- source creation
- concept extraction
- graph edge generation
- module similarity
- review scheduling
- quiz generation
- quiz scoring and mastery updates
- reminder settings read/write

### API Routes

- `/api/modules`
- `/api/sources`
- `/api/graph`
- `/api/concepts/[id]`
- `/api/edges/[id]`
- `/api/reviews/due`
- `/api/quizzes/generate`
- `/api/quiz-attempts`
- `/api/modules/[id]/similar`
- `/api/reminders`
- `/api/dashboard`

## Persistence Status

The app now supports two store modes behind the same interface in `src/lib/store.ts`.

### Mode 1: Local Prototype Mode

- used when `DATABASE_URL` is not set
- persists to `.data/store.json`

### Mode 2: Postgres Mode

- used when `DATABASE_URL` is set
- persists app state through `src/lib/postgres-store.ts`
- current implementation stores the app state as a durable snapshot record in Postgres

This is a real persistence upgrade, but it is not yet a normalized relational schema.

## Important Files

### High-Conflict Integration Files

- `src/lib/app.ts`
- `src/lib/types.ts`
- `src/lib/store.ts`

### Persistence Files

- `src/lib/store.ts`
- `src/lib/store-utils.ts`
- `src/lib/postgres-store.ts`
- `db/postgres.sql`

### Product Logic

- `src/lib/services/ingestion.ts`
- `src/lib/services/graph.ts`
- `src/lib/services/review.ts`
- `src/lib/services/quiz.ts`

### Main UI Files

- `src/components/dashboard-shell.tsx`
- `src/components/graph-canvas.tsx`
- `src/components/intake-panel.tsx`
- `src/components/quiz-panel.tsx`
- `src/components/reminder-panel.tsx`

## Known Constraints

- concept extraction is still heuristic
- text ingestion is still basic
- persistence is only partially productionized
- there is no normalized Postgres schema yet
- there is no real queue/worker system yet
- auth is still effectively demo-level

## Recommended Next Task

The next serious engineering step is:

1. normalize the Postgres storage model
2. split persistence into repository-style access instead of one app-state snapshot
3. move modules, sources, concepts, edges, review states, quiz items, and reminder settings into first-class tables

This is the cleanest next move because nearly every later feature depends on reliable structured persistence.

## Active Parallelization Setup

The repo now has local task branches prepared for the Postgres normalization phase:

- `codex-db-schema`
- `codex-repositories`
- `codex-migration-bootstrap`
- `codex-integration`

The exact split for those branches is documented in `docs/PARALLEL_POSTGRES_PLAN.md`.

## How To Resume In A New Thread

Use a prompt like this:

```text
Read docs/HANDOFF.md, README.md, docs/PROJECT_OVERVIEW.md, and docs/AGENTS.md first.
This repo is a Learning Optimizer app.
Current state: build passes, reminder settings work, Postgres snapshot adapter exists.
Next task: normalize the Postgres schema and split the store into repositories.
```

## Maintenance Rule

This file should be updated after meaningful repo changes, especially when any of these change:

- architecture
- storage mode
- API surface
- major product workflows
- recommended next task

Do not update this file for trivial cosmetic edits only.
