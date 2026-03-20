# Learning Optimizer

Learning Optimizer is a Next.js web app for turning study material into an AI-assisted learning system.

The current prototype focuses on four core loops:

- ingest module notes and source material
- convert source material into a concept graph
- schedule concept reviews with spaced repetition
- generate quizzes to test whether the user actually understands the material

The intended product direction is a guided flow rather than a set of separate workspaces:

1. upload notes
2. generate a mindmap
3. rate familiarity per concept
4. generate quizzes
5. continue review

## What the App Does

The app is built around the idea that learning should become a connected knowledge network instead of a pile of isolated notes.

In the current implementation, users can:

- create modules
- add text-based learning sources
- generate concept nodes and evidence-backed edges
- inspect related concepts in a graph view
- review due concepts from a spaced-repetition queue
- answer mixed recall quiz prompts
- store reminder settings for in-app and email review nudges

Planned next UX direction:

- make the mindmap the first success screen after ingestion
- replace scattered workspace actions with one primary action per stage
- add per-concept familiarity rating before quiz generation
- move from heuristic ingestion toward Gemini-backed document understanding

## Current Product Areas

### 1. Graph Workspace

The graph is the central knowledge view. Concepts are extracted from ingested material, linked together, and shown as a network.

Each concept can expose:

- title and summary
- module associations
- source evidence
- mastery state
- related edges

### 2. Study Workspace

The study queue uses an FSRS-style review model to decide which concepts are due next.

The current review engine tracks:

- `stability`
- `difficulty`
- `retrievability`
- `dueAt`

### 3. Quiz Workspace

The quiz engine generates mixed recall items from concepts and graph relationships.

The current quiz types are:

- flashcard recall
- short-answer explanation
- relationship questions between linked concepts

### 4. Ingest Workspace

Users can create modules and add source content that gets chunked and processed into concepts and edges.

The current prototype supports text ingestion. The planned direction is Gemini-backed document understanding, where uploaded notes are processed into concepts, relationships, summaries, and evidence before the app persists the resulting graph.

Today, the active implementation is still text-first and prototype-grade.

### 5. Reminder Settings

Reminder settings are now configurable through the app and persisted through the `/api/reminders` route.

The current settings model supports:

- `emailEnabled`
- `inAppEnabled`
- `dailyHour`

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Local JSON-backed persistence for prototype state
- Optional PostgreSQL-backed persistence via `DATABASE_URL`
- Node-based service layer for ingestion, graphing, review scheduling, quizzes, and reminders

## Project Structure

```text
src/
  app/
    api/
    globals.css
    layout.tsx
    page.tsx
  components/
    dashboard-shell.tsx
    graph-canvas.tsx
    intake-panel.tsx
    concept-panel.tsx
    study-queue.tsx
    quiz-panel.tsx
    reminder-panel.tsx
  lib/
    app.ts
    store.ts
    types.ts
    seed.ts
    services/
      ingestion.ts
      graph.ts
      review.ts
      quiz.ts
  tests/
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Bootstrap the normalized Postgres schema:

```bash
npm run db:bootstrap
```

Import the current local JSON store into Postgres:

```bash
npm run db:import-local
```

## Current Persistence Model

This repo currently uses a local file-backed store under `.data/` for fast prototyping.

That means:

- it is easy to run locally
- it is not yet production-grade storage
- the service boundaries are already separated enough to swap in a database later

There is now also a PostgreSQL adapter behind the same store interface.

### Persistence Modes

- no `DATABASE_URL`: app uses the local JSON store under `.data/store.json`
- with `DATABASE_URL`: app persists the app state to normalized PostgreSQL tables
### Postgres Bootstrap And Import

The Postgres path now writes the app state into normalized tables defined in `db/postgres.sql`.

The app layer still uses the existing `AppStore` contract, and the Postgres adapter maps that store shape into the normalized tables.

To use PostgreSQL:

1. Create a database
2. Copy `.env.example` to `.env.local`
3. Set `DATABASE_URL`
4. Run `npm run db:bootstrap`
5. If you already have local `.data/store.json` data, run `npm run db:import-local`
6. Start the app normally with `npm run dev`

If your local prototype data lives somewhere other than `.data/store.json`, either:

- set `LEARNING_OPTIMIZER_DATA_DIR`
- or run `npm run db:import-local -- --from /absolute/path/to/store.json`

If a legacy Postgres `app_state` snapshot table is still present, the runtime adapter can import that snapshot into the normalized tables on first Postgres load.

The bootstrap SQL for the current Postgres store lives in `db/postgres.sql`.

## Near-Term Next Steps

The most important functional improvements from here are:

- redesign the UI around a guided flow instead of separate workspaces
- add Gemini-backed ingestion so uploaded notes can produce richer concept maps
- add per-concept familiarity rating before quiz generation
- split the normalized Postgres path into repository-style reads and writes instead of full-store rewrites
- add robust background job handling for reminders and ingestion
- tighten scoring and mastery evaluation logic

## Documentation

Start with [docs/HANDOFF.md](docs/HANDOFF.md) if you are resuming work in a new thread or handing the repo to another agent.

Additional documentation:

- [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- [docs/AGENTS.md](docs/AGENTS.md)
- [docs/learn.md](docs/learn.md)
- [docs/PARALLEL_GUIDED_FLOW_PLAN.md](docs/PARALLEL_GUIDED_FLOW_PLAN.md)
