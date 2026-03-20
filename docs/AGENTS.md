# Agent Workstreams

Before assigning work, read `docs/HANDOFF.md` first so agents start from the latest repo state.

This document defines the recommended sub-agent structure for the Learning Optimizer repo.

The point is not to record which agent happened to do what in the past. The point is to define stable ownership boundaries so multiple agents can work in parallel without repeatedly colliding in the same files.

## How To Use This File

When parallelizing work:

- assign an agent to one workstream
- keep changes inside that workstream when possible
- avoid editing shared orchestration files unless that agent explicitly owns integration work
- if a task crosses workstreams, either split it or assign one integration owner

## General Rules

- `src/lib/app.ts` is high-conflict and should usually have a single integration owner
- `src/lib/types.ts` is shared contract surface and should be changed carefully
- `src/lib/store.ts` affects persistence for the whole app and should not be edited casually by multiple agents at once
- UI-only changes should stay inside `src/components/` unless they truly require new backend behavior
- route changes in `src/app/api/` should match a clear backend/service owner

## Workstream 1: Ingestion Agent

### Purpose

Own how raw learning material enters the system.

### Typical Responsibilities

- module creation flow
- source ingestion flow
- upload and parsing support
- chunking strategy
- source normalization

### Primary Files

- `src/components/intake-panel.tsx`
- `src/app/api/modules/route.ts`
- `src/app/api/sources/route.ts`
- `src/lib/services/ingestion.ts`

### Inputs

- pasted text
- uploaded files
- module metadata

### Outputs

- normalized sources
- chunks
- ingestion-ready content for graph extraction

### Avoid Overlap With

- graph logic in `src/lib/services/graph.ts`
- review logic in `src/lib/services/review.ts`
- quiz generation in `src/lib/services/quiz.ts`

## Workstream 2: Graph Agent

### Purpose

Own concept extraction, graph linking, and graph-facing interactions.

### Typical Responsibilities

- concept merging
- edge generation
- edge typing
- module similarity logic
- graph exploration UI
- concept editing behavior

### Primary Files

- `src/lib/services/graph.ts`
- `src/components/graph-canvas.tsx`
- `src/components/concept-panel.tsx`
- `src/app/api/graph/route.ts`
- `src/app/api/concepts/[id]/route.ts`
- `src/app/api/edges/[id]/route.ts`
- `src/app/api/modules/[id]/similar/route.ts`

### Inputs

- chunked source material
- existing concepts and edges

### Outputs

- concept nodes
- graph edges
- graph metadata for the UI

### Avoid Overlap With

- ingestion chunking changes unless coordinated with the ingestion agent
- quiz scheduling or reminder logic

## Workstream 3: Review Agent

### Purpose

Own retention logic and study scheduling.

### Typical Responsibilities

- spaced repetition model
- due queue generation
- mastery progression
- reminder job triggering logic

### Primary Files

- `src/lib/services/review.ts`
- `src/components/study-queue.tsx`
- `src/app/api/reviews/due/route.ts`

### Inputs

- concept mastery outcomes
- quiz performance

### Outputs

- due review queue
- updated review states
- reminder job candidates

### Avoid Overlap With

- quiz prompt generation details
- graph extraction logic

## Workstream 4: Quiz Agent

### Purpose

Own testing of understanding.

### Typical Responsibilities

- quiz item generation
- answer scoring
- quiz session UX
- relationship-question quality

### Primary Files

- `src/lib/services/quiz.ts`
- `src/components/quiz-panel.tsx`
- `src/app/api/quizzes/generate/route.ts`
- `src/app/api/quiz-attempts/route.ts`

### Inputs

- concepts
- graph edges
- source evidence

### Outputs

- quiz prompts
- expected answers
- grading outcomes

### Avoid Overlap With

- reminder delivery settings
- persistence layer changes unless unavoidable

## Workstream 5: Reminder Agent

### Purpose

Own reminder configuration and reminder delivery state.

### Typical Responsibilities

- reminder settings UX
- reminder settings API
- reminder job display
- notification cadence controls

### Primary Files

- `src/components/reminder-panel.tsx`
- `src/app/api/reminders/route.ts`

### Inputs

- review queue timing
- user reminder preferences

### Outputs

- reminder settings state
- reminder delivery configuration
- reminder status visibility in the UI

### Avoid Overlap With

- core review scheduling formulas unless explicitly coordinated with the review agent

## Workstream 6: Persistence And Infra Agent

### Purpose

Own storage, infrastructure boundaries, and future production migration work.

### Typical Responsibilities

- store abstraction changes
- database migration planning
- schema evolution
- file storage integration
- queue/job infrastructure integration

### Primary Files

- `src/lib/store.ts`
- `src/lib/types.ts`
- `src/lib/seed.ts`
- future DB or infra directories

### Inputs

- application-level state requirements

### Outputs

- durable storage model
- migration-safe contracts
- infrastructure adapters

### Avoid Overlap With

- feature logic changes unless necessary for a schema or storage transition

## Workstream 7: Frontend Shell Agent

### Purpose

Own navigation, workspace layout, and high-level UX composition.

### Typical Responsibilities

- dashboard layout
- workspace navigation
- theme and styling
- multi-panel coordination

### Primary Files

- `src/components/dashboard-shell.tsx`
- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/globals.css`

### Inputs

- data already exposed by the app layer and API routes

### Outputs

- page structure
- navigation flow
- visual composition

### Avoid Overlap With

- deep feature logic inside ingestion, graph, quiz, or review services

## Workstream 8: Integration Agent

### Purpose

Own cross-cutting changes that touch multiple workstreams.

### Typical Responsibilities

- changes in `src/lib/app.ts`
- updates to dashboard snapshots
- connecting new service outputs to routes and UI
- resolving cross-agent merge points

### Primary Files

- `src/lib/app.ts`
- sometimes `src/lib/types.ts`
- sometimes `src/app/api/dashboard/route.ts`

### Inputs

- outputs from all other workstreams

### Outputs

- coherent end-to-end behavior
- stable shared contracts

### Avoid Overlap With

- broad feature-specific implementation when a specialist agent can do it first

## Recommended Parallel Splits

Here are good combinations that usually parallelize cleanly.

### Split A

- Ingestion Agent
- Graph Agent
- Review Agent
- Frontend Shell Agent

### Split B

- Quiz Agent
- Reminder Agent
- Persistence And Infra Agent
- Integration Agent

### Split C

For a larger push:

- one agent on persistence migration
- one agent on model-backed ingestion
- one agent on graph quality
- one agent on quiz quality
- one agent on reminder delivery
- one integration owner

## When Not To Parallelize

Do not split work across many agents when:

- all changes will end up in `src/lib/app.ts`
- the task mainly changes shared types
- the feature is still too vague to define boundaries
- the likely merge cost is higher than the implementation cost

## Practical Rule

If two agents are likely to edit the same file more than once, the split is probably wrong.
