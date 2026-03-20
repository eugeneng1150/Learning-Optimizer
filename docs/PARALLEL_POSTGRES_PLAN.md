# Parallel Postgres Normalization Plan

This document defines the exact split for the Postgres normalization phase.

The goal is to move from the current snapshot-style Postgres adapter to a normalized persistence layer with low merge friction.

## Branch Layout

- `codex-db-schema`
- `codex-repositories`
- `codex-migration-bootstrap`
- `codex-integration`

## Execution Order

Start these first:

1. schema
2. repositories
3. migration/bootstrap

Start integration after the first three have produced stable outputs.

## Agent 1: Schema

### Branch

- `codex-db-schema`

### Goal

Design and implement the normalized Postgres schema.

### Primary Responsibilities

- replace the single `app_state` table with normalized tables
- define primary keys, foreign keys, and indexes
- preserve support for current domain concepts

### Expected Files

- `db/postgres.sql`
- optionally docs that explain the schema

### Should Not Edit

- `src/lib/app.ts`
- UI components
- route handlers unless absolutely required for contract clarity

### Deliverables

- schema tables for users, modules, sources, chunks, concepts, edges, review states, quiz items, quiz attempts, reminders, and reminder settings
- sensible indexes for lookup-heavy paths
- documented assumptions where the current domain model is underspecified

## Agent 2: Repositories

### Branch

- `codex-repositories`

### Goal

Refactor persistence access away from the single store snapshot model into repository-style reads and writes.

### Primary Responsibilities

- introduce repository modules for normalized persistence access
- separate persistence concerns from the app orchestration layer
- preserve current behavior while changing the storage boundary

### Expected Files

- `src/lib/store.ts`
- new repository files under `src/lib/`
- `src/lib/postgres-store.ts`
- `src/lib/store-utils.ts`
- possibly `src/lib/types.ts`

### Should Not Edit

- visual components unless required by type changes
- `db/postgres.sql` except for clarifying a repository dependency

### Deliverables

- repository modules with clean read/write functions
- a thinner store boundary
- app code prepared to stop depending on one giant in-memory object

## Agent 3: Migration / Bootstrap

### Branch

- `codex-migration-bootstrap`

### Goal

Provide the path from current development data into the normalized database.

### Primary Responsibilities

- DB bootstrap tooling
- migration/import logic from `.data/store.json`
- local setup documentation for the new persistence mode

### Expected Files

- `db/postgres.sql`
- bootstrap or import scripts
- `.env.example`
- `README.md`
- relevant docs in `docs/`

### Should Not Edit

- product logic in services
- UI components

### Deliverables

- repeatable bootstrap path
- import strategy for current snapshot data
- docs for local Postgres setup and migration flow

## Agent 4: Integration

### Branch

- `codex-integration`

### Goal

Merge the normalized schema, repository layer, and bootstrap flow into one coherent system.

### Primary Responsibilities

- integrate outputs from the first three branches
- resolve shared contract changes
- update high-conflict files
- run final verification

### Expected Files

- `src/lib/app.ts`
- `src/lib/types.ts`
- `src/lib/store.ts`
- any route or app-layer files affected by repository contract changes

### Deliverables

- working normalized Postgres path
- passing tests
- passing production build
- updated handoff docs

## Shared Rules

- do not edit the same file from multiple branches unless unavoidable
- if `src/lib/types.ts` must change, keep changes minimal and documented
- if `src/lib/app.ts` must change, prefer leaving that to integration
- update `docs/HANDOFF.md` only in the integration branch unless a branch changes repo setup materially

## Ready-Made Start Prompts

### Schema Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_POSTGRES_PLAN.md first.
Work only on branch codex-db-schema.
Task: replace the snapshot-style Postgres schema with a normalized schema in db/postgres.sql.
Do not edit src/lib/app.ts or UI files.
```

### Repositories Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_POSTGRES_PLAN.md first.
Work only on branch codex-repositories.
Task: introduce repository-style persistence access and reduce dependence on one app-state snapshot.
Avoid changing UI files and avoid editing db/postgres.sql unless absolutely required.
```

### Migration Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_POSTGRES_PLAN.md first.
Work only on branch codex-migration-bootstrap.
Task: add bootstrap/import tooling and docs for moving current local data into Postgres.
Do not edit UI components or core product logic.
```

### Integration Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_POSTGRES_PLAN.md first.
Work only on branch codex-integration.
Task: integrate the schema, repositories, and migration/bootstrap outputs after the first three branches are ready.
Own src/lib/app.ts and shared contract resolution.
```
