# Parallel Guided Flow Plan

This file keeps the old filename for continuity, but it now defines the recommended parallel split for the next product workstream.

The current goal is to move the app from the older workspace-heavy prototype toward a guided learning journey:

1. upload notes
2. generate a mindmap
3. rate familiarity per concept
4. generate quizzes
5. continue review

Gemini-backed ingestion is part of that direction, but the UI flow should be cleaned up first so later backend work has a stable target.

## Branch Layout

- `codex-guided-shell`
- `codex-familiarity-flow`
- `codex-gemini-ingestion`
- `codex-guided-integration`

## Execution Order

Start these first:

1. guided shell
2. familiarity flow
3. Gemini ingestion

Start integration after the first three have produced stable outputs.

## Agent 1: Guided Shell

### Branch

- `codex-guided-shell`

### Goal

Refactor the main UI from separate workspaces into a clearer stage-based shell.

### Primary Responsibilities

- redesign the shell around the stages `Upload`, `Map`, `Familiarity`, `Quiz`, and `Review`
- make the mindmap the first success screen after note processing
- reduce scattered action buttons and establish one primary CTA per stage
- preserve current product behavior while changing the presentation and flow

### Expected Files

- `src/components/dashboard-shell.tsx`
- `src/app/page.tsx`
- `src/components/graph-canvas.tsx`
- related shell-level styling files if needed

### Should Not Edit

- `src/lib/app.ts`
- ingestion services
- Postgres schema or persistence files

### Deliverables

- guided shell with a visible current stage
- clearer primary actions and reduced UI clutter
- route or state behavior that lands users on the graph after successful ingestion
- notes about any integration assumptions affecting API or shared types

## Agent 2: Familiarity Flow

### Branch

- `codex-familiarity-flow`

### Goal

Add user-specific concept familiarity rating and connect it to the guided flow.

### Primary Responsibilities

- introduce a simple 1-5 familiarity rating model
- expose familiarity controls in concept detail or a focused rating step
- connect the rating to review-oriented state without changing core quiz behavior unnecessarily
- prepare the app for a guided "rate concepts before quiz" experience

### Expected Files

- `src/lib/types.ts`
- `src/lib/app.ts`
- `src/lib/services/review.ts`
- `src/components/quiz-panel.tsx` only if needed for flow coordination
- new UI files for familiarity controls if needed

### Should Not Edit

- major shell layout files owned by guided shell
- Gemini ingestion service files
- Postgres schema files unless a minimal type contract forces it

### Deliverables

- user-specific familiarity state
- API or app-layer support for saving familiarity
- UI controls for rating familiarity
- documented assumptions about how familiarity influences review ordering or quiz readiness

## Agent 3: Gemini Ingestion

### Branch

- `codex-gemini-ingestion`

### Goal

Introduce a Gemini-backed ingestion path that can become the primary semantic processing flow.

### Primary Responsibilities

- add backend-facing ingestion plumbing for Gemini
- define the Gemini result shape for concepts, relationships, summaries, and evidence
- keep the current heuristic ingestion path available as a fallback
- prepare for raw upload handling, with practical v1 scope documented if full PDF support is not finished

### Expected Files

- `src/app/api/sources/route.ts` or a dedicated upload route
- `src/lib/app.ts`
- `src/lib/services/ingestion.ts`
- new Gemini-specific service files under `src/lib/services/`
- env/docs files if Gemini config is required

### Should Not Edit

- main shell layout files
- review/familiarity UI unless required by new ingestion response shape
- Postgres schema files

### Deliverables

- Gemini-backed ingestion service boundary
- fallback behavior when Gemini is unavailable
- environment/config documentation
- clear notes on what remains out of scope, especially around PDF parsing or OCR

## Agent 4: Integration

### Branch

- `codex-guided-integration`

### Goal

Merge the guided shell, familiarity flow, and Gemini ingestion outputs into one coherent product flow.

### Primary Responsibilities

- integrate outputs from the first three branches
- resolve shared type or app-layer conflicts
- own final changes to high-conflict files
- run verification and update docs

### Expected Files

- `src/lib/app.ts`
- `src/lib/types.ts`
- `src/components/dashboard-shell.tsx`
- route handlers or shared components affected by contract changes
- `docs/HANDOFF.md`

### Deliverables

- working guided flow from upload to graph to familiarity to quiz
- passing tests
- updated handoff docs
- explicit list of known gaps after integration

## Shared Rules

- do not edit the same file from multiple branches unless unavoidable
- if `src/lib/app.ts` must change in a non-integration branch, keep it narrow and document the contract change clearly
- keep Postgres persistence work out of this parallel split unless it is required to support the new product flow
- update docs only when the branch changes assumptions other branches need to know

## Recommended File Ownership

- guided shell owns:
  - `src/components/dashboard-shell.tsx`
  - `src/app/page.tsx`
  - shell-level visual flow
- familiarity flow owns:
  - familiarity state shape
  - familiarity UI components
  - review integration
- Gemini ingestion owns:
  - upload/ingestion route changes
  - Gemini service modules
  - ingestion orchestration contracts
- integration owns:
  - final `src/lib/app.ts`
  - final conflict resolution
  - final docs updates

## Ready-Made Start Prompts

### Guided Shell Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_GUIDED_FLOW_PLAN.md first.
Work only on branch codex-guided-shell.
Task: replace the workspace-heavy dashboard with a guided stage-based shell for Upload, Map, Familiarity, Quiz, and Review.
Make the mindmap the first success screen after note processing.
Do not edit src/lib/app.ts unless a small contract change is unavoidable.
At the end, report:
1. files changed
2. the new stage model
3. any assumptions the integration branch must resolve
```

### Familiarity Flow Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_GUIDED_FLOW_PLAN.md first.
Work only on branch codex-familiarity-flow.
Task: add a user-specific 1-5 familiarity rating flow for concepts and connect it to review-oriented state.
Avoid major shell layout edits and avoid Gemini service work.
At the end, report:
1. files changed
2. new state or type additions
3. how familiarity affects review or quiz flow
4. any integration work needed in src/lib/app.ts
```

### Gemini Ingestion Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_GUIDED_FLOW_PLAN.md first.
Work only on branch codex-gemini-ingestion.
Task: add a Gemini-backed ingestion path that can become the primary semantic processing flow, while preserving a fallback when Gemini is unavailable.
Avoid editing the main dashboard shell unless a small contract change requires it.
At the end, report:
1. files changed
2. Gemini interfaces and env requirements
3. fallback behavior
4. any integration assumptions about upload flow or source contracts
```

### Integration Prompt

```text
Read docs/HANDOFF.md, docs/AGENTS.md, and docs/PARALLEL_GUIDED_FLOW_PLAN.md first.
Work only on branch codex-guided-integration.
Task: integrate the guided shell, familiarity flow, and Gemini ingestion outputs after the first three branches are ready.
Own src/lib/app.ts, shared contract resolution, and final verification.
```
