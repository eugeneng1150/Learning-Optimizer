# Handoff

This file is the shortest reliable starting point for a new AI agent or a new conversation thread.

If you are picking up work on this repo, read this file first, then read:

- `README.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/AGENTS.md`
- `docs/PARALLEL_POSTGRES_PLAN.md` if the active task is persistence follow-up work

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
- current implementation stores app data in normalized Postgres tables
- bootstrap/import tooling exists for moving `.data/store.json` into Postgres
- the app layer still uses the existing whole-store contract over that normalized schema

This is a real persistence upgrade, but the app orchestration layer has not yet been split into repository-style persistence access.

## Important Files

### High-Conflict Integration Files

- `src/lib/app.ts`
- `src/lib/types.ts`
- `src/lib/store.ts`

### Persistence Files

- `src/lib/store.ts`
- `src/lib/store-utils.ts`
- `src/lib/postgres-store.ts`
- `src/lib/bootstrap-store.ts`
- `db/postgres.sql`
- `scripts/bootstrap-postgres.ts`
- `scripts/import-local-store.ts`

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
- real PDF parsing is not implemented yet; current ingest UI only supports pasted text and browser-loaded `.txt` / `.md` content
- persistence is only partially productionized
- the app layer still rewrites the full normalized store snapshot on save
- there is no real queue/worker system yet
- auth is still effectively demo-level

## PDF Ingestion Context

The domain model already allows `SourceDocument.kind` to be `"pdf"`, but the repo does not yet have a real PDF extraction pipeline.

Current reality:

- `src/components/intake-panel.tsx` supports pasted text and browser-loaded `.txt` / `.md`
- `src/app/api/sources/route.ts` expects text content, not raw PDF upload handling
- `src/lib/services/ingestion.ts` starts from plain text and does chunking/concept extraction only after text already exists

What a real v1 PDF path should do:

1. accept a raw PDF file upload
2. extract text from the PDF on the server
3. lightly normalize the extracted text
4. pass the cleaned text into the existing source ingestion flow

Recommended architecture:

- add a dedicated PDF parsing helper, likely under `src/lib/services/`
- keep parsing/extraction separate from `src/lib/app.ts`
- keep route handlers thin and let `app.ts` orchestrate upload -> extract -> create source -> ingest

Recommended v1 scope:

- text-based PDFs only
- no OCR
- no advanced layout reconstruction beyond light cleanup

Main follow-up files for a future PDF ingestion task:

- `src/components/intake-panel.tsx`
- `src/app/api/sources/route.ts` or a dedicated PDF upload route
- `src/lib/app.ts`
- `src/lib/services/ingestion.ts`
- likely a new `src/lib/services/pdf.ts`

## Recommended Next Task

The next serious engineering step is:

1. split normalized persistence into repository-style access instead of whole-store rewrites
2. move app orchestration off the giant `AppStore` boundary in Postgres mode
3. add focused Postgres verification tests for the normalized adapter

This is the cleanest next move because the schema is now normalized, but the runtime still pays whole-store rewrite costs and keeps persistence concerns too centralized.

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
Current state: build passes, reminder settings work, normalized Postgres tables exist, and bootstrap/import tooling exists.
Next task: split the Postgres path into repository-style access and add focused persistence verification.
```

## Maintenance Rule

This file should be updated after meaningful repo changes, especially when any of these change:

- architecture
- storage mode
- API surface
- major product workflows
- recommended next task

Do not update this file for trivial cosmetic edits only.
