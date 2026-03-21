# Handoff

This file is the shortest reliable starting point for a new AI agent or a new conversation thread.

If you are picking up work on this repo, read this file first, then read:

- `README.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/AGENTS.md`
- `docs/PARALLEL_GUIDED_FLOW_PLAN.md` if the active task is being parallelized across multiple agents

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
- `DATABASE_URL= npm run build`

The current product shell is already a guided post-login flow:

1. upload notes
2. inspect the map
3. rate familiarity per concept
4. generate quizzes
5. continue review

The repo now also includes a first RAG slice:

1. active ingest can request Gemini chunk embeddings
2. stored chunks can be queried semantically
3. concept detail can answer grounded questions from retrieved notes
4. explicit quiz regeneration can use retrieved chunk grounding

The map stage now has two shipped modes:

1. `Library` for subjects and notes
2. `Concepts` for concept relationships

## What Is Implemented

### Frontend

- guided dashboard shell
- interactive concept graph workspace
- interactive library graph with radial subject expansion
- study queue
- quiz workspace
- ingest workspace
- server-side file/PDF upload path
- retrieval-backed concept detail
- reminder settings panel

### Backend / App Layer

- module creation
- source creation
- concept extraction
- Gemini chunk embeddings on active ingest
- server-side PDF text extraction
- graph edge generation
- module similarity
- note-scoped quiz generation from library graph note selection
- review scheduling
- quiz generation
- retrieval-backed explicit quiz regeneration
- quiz scoring and mastery updates
- grounded concept retrieval answers
- reminder settings read/write

### API Routes

- `/api/modules`
- `/api/sources`
- `/api/graph`
- `/api/concepts/[id]`
- `/api/concepts/[id]/evidence`
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
- `src/lib/services/pdf.ts`
- `src/lib/services/retrieval.ts`
- `src/lib/services/review.ts`
- `src/lib/services/quiz.ts`

### Main UI Files

- `src/components/dashboard-shell.tsx`
- `src/components/graph-canvas.tsx`
- `src/components/library-graph.tsx`
- `src/components/intake-panel.tsx`
- `src/components/quiz-panel.tsx`
- `src/components/reminder-panel.tsx`

## Known Constraints

- concept extraction is still heuristic
- text ingestion is still basic
- PDF ingestion is now limited to text-based PDFs and still needs OCR plus better extraction hardening
- retrieval now powers concept detail and explicit quiz regeneration, but not a broader search surface yet
- the upload stage is clearer now, but success feedback can still be made stronger
- the library graph is live, but very dense subjects still need more advanced clustering/search
- persistence is only partially productionized
- the app layer still rewrites the full normalized store snapshot on save
- there is no real queue/worker system yet
- auth is still effectively demo-level
- graph layout now persists in browser workspace state, but graph curation edits are not yet durable app state

## Planned Product Direction

These are the product decisions currently preferred for upcoming work:

- treat auth as a future wrapper only; design the main journey post-login
- keep the user in upload after processing notes and show subject-level progress there
- keep the map split into `Library` and `Concepts` modes
- keep subjects as first-class nodes and notes as expandable children
- keep note-node selection as a note-scoped quiz entry point
- add a per-concept quick familiarity rating before quiz generation
- use Gemini as the primary semantic ingestion and retrieval layer for uploaded notes
- replace scattered workspace actions with one clearer stage-based flow

The intended user journey is:

1. upload notes
2. stay in upload and confirm subject-level ingest progress
3. open the map in `Library` or `Concepts` mode
4. expand subjects into notes or inspect the concept graph
5. jump into note-scoped or mixed quizzes
6. rate familiarity on concepts
7. ask grounded questions against the map and stored evidence
8. continue review and reminders

## PDF Ingestion Context

The repo now has a real v1 PDF ingestion path.

Current reality:

- `src/components/intake-panel.tsx` supports pasted text plus `.txt`, `.md`, and `.pdf` uploads
- `src/app/api/sources/route.ts` accepts both JSON text ingest and `multipart/form-data`
- `src/lib/services/pdf.ts` extracts text server-side before the source enters the existing ingest flow

Current scope:

- text-based PDFs only
- no OCR
- light cleanup only, not advanced layout reconstruction

Main follow-up files for improving PDF ingestion:

- `src/components/intake-panel.tsx`
- `src/app/api/sources/route.ts`
- `src/lib/services/pdf.ts`

## Recommended Next Task

The next serious engineering step is:

1. extend retrieval into broader note search or more study surfaces
2. add OCR or stronger PDF support beyond text-based PDFs
3. keep hardening persistence and background work
4. then add auth and user isolation

The repo already has the guided shell, upload feedback, library graph, note-scoped quiz entry, and first retrieval slice. The next gap is depth and production hardening.

## Parallelization Context

The old Postgres normalization branch split has been completed and cleaned up locally.

If you want to run multiple agents for the current product work, use the updated branch/task split in `docs/PARALLEL_GUIDED_FLOW_PLAN.md`.

That file now covers the guided-flow workstream:

- `codex-guided-shell`
- `codex-familiarity-flow`
- `codex-gemini-ingestion`
- `codex-guided-integration`

## How To Resume In A New Thread

Use a prompt like this:

```text
Read docs/HANDOFF.md, README.md, docs/PROJECT_OVERVIEW.md, and docs/AGENTS.md first.
This repo is a Learning Optimizer app.
Current state: build passes, reminder settings work, normalized Postgres tables exist, and bootstrap/import tooling exists.
Next task: extend retrieval beyond the current concept-detail/quiz surfaces, improve PDF support, and continue production hardening.
```

## Maintenance Rule

This file should be updated after meaningful repo changes, especially when any of these change:

- architecture
- storage mode
- API surface
- major product workflows
- recommended next task

Do not update this file for trivial cosmetic edits only.
