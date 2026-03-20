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

The current product shell still reflects the older workspace-first prototype. The intended next direction is a guided post-login flow:

1. upload notes
2. generate a mindmap
3. rate familiarity per concept
4. generate quizzes
5. continue review

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
- the UI is still workspace-heavy and visually cluttered compared with the intended guided journey

## Planned Product Direction

These are the product decisions currently preferred for upcoming work:

- treat auth as a future wrapper only; design the main journey post-login
- make the mindmap the first success screen after notes are processed
- add a per-concept quick familiarity rating before quiz generation
- use Gemini as the primary semantic ingestion layer for uploaded notes
- replace scattered workspace actions with one clearer stage-based flow

The intended user journey is:

1. upload notes
2. process notes with Gemini
3. inspect the generated mindmap
4. rate familiarity on concepts
5. generate quizzes from that map
6. continue review and reminders

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

1. redesign the shell into a guided flow instead of separate workspaces
2. add Gemini-backed ingestion for uploaded notes and map generation
3. add user-specific per-concept familiarity rating before quiz generation
4. then split normalized persistence into repository-style access instead of whole-store rewrites

This is the cleanest next move because the current UI and ingestion flow no longer match the intended product experience, and the persistence refactor will be easier to shape once the product flow is clearer.

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
Next task: redesign the app into a guided flow, add Gemini-backed ingestion, and introduce per-concept familiarity rating before quizzes.
```

## Maintenance Rule

This file should be updated after meaningful repo changes, especially when any of these change:

- architecture
- storage mode
- API surface
- major product workflows
- recommended next task

Do not update this file for trivial cosmetic edits only.
