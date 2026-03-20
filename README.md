# Learning Optimizer

Learning Optimizer is a Next.js web app for turning study material into an AI-assisted learning system.

The current prototype focuses on four core loops:

- ingest module notes and source material
- convert source material into a concept graph
- schedule concept reviews with spaced repetition
- generate quizzes to test whether the user actually understands the material

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

The current prototype supports text ingestion. The architecture is designed so richer upload/parsing support can be added later.

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

## Current Persistence Model

This repo currently uses a local file-backed store under `.data/` for fast prototyping.

That means:

- it is easy to run locally
- it is not yet production-grade storage
- the service boundaries are already separated enough to swap in a database later

## Near-Term Next Steps

The most important functional improvements from here are:

- move from local JSON persistence to a proper database
- improve source ingestion beyond pasted text
- replace heuristic concept extraction with real LLM-backed extraction
- add robust background job handling for reminders and ingestion
- tighten scoring and mastery evaluation logic

## Documentation

More detailed product and architecture notes live in [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md).
