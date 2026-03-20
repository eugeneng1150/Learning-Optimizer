# Learn This Repo

This guide is for learning the backend and persistence ideas that show up in Learning Optimizer.

It is intentionally repo-first. Instead of teaching database theory in the abstract, it explains the concepts through this codebase's current shape.

## 1. Start With The Big Picture

At a high level, this repo works like this:

1. The UI renders from `src/app/page.tsx` and client components in `src/components/`.
2. Client interactions call route handlers in `src/app/api/`.
3. Route handlers delegate into the app orchestration layer in `src/lib/app.ts`.
4. The app layer uses service logic in `src/lib/services/`.
5. The store boundary in `src/lib/store.ts` persists data either to local JSON or PostgreSQL.

### How It Appears In This Repo

- `src/lib/app.ts` is the center of most product flows.
- `src/lib/services/` contains the learning logic: ingestion, graph building, review scheduling, and quiz scoring.
- `src/lib/store.ts` hides whether persistence is local file storage or Postgres.
- `src/lib/postgres-store.ts` maps the app's in-memory store shape into normalized Postgres tables.

### Why It Matters

If you can follow this chain, you can usually understand any feature in the repo:

- request comes in
- orchestration decides what to do
- services compute the result
- persistence stores the state

### Read More

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers-and-middleware
- PostgreSQL tutorial overview: https://www.postgresql.org/docs/current/tutorial.html

## 2. What An `AppStore` Architecture Is

An `AppStore` architecture means the application thinks in terms of one large in-memory state object instead of many small persistence operations.

In this repo, that object is `AppStore` in `src/lib/types.ts`.

### How It Appears In This Repo

- `getStore()` returns the whole store.
- App logic modifies one part of that object.
- `saveStore(store)` persists the whole thing again.

This was a good prototype shape because it made the app easy to build quickly.

### Why It Matters

This style is simple at first, but it becomes expensive when the app grows:

- reads often load more data than the feature needs
- writes often persist more data than changed
- concurrency gets harder because multiple requests can read stale copies and overwrite each other

### Read More

- Repository pattern overview: https://martinfowler.com/eaaCatalog/repository.html
- PostgreSQL tutorial, SQL and table concepts: https://www.postgresql.org/docs/current/tutorial-table.html

## 3. What Database Normalization Means Here

Normalization means storing related data in separate tables with relationships between them, instead of packing everything into one large nested blob.

For this repo, that means tables such as:

- `users`
- `modules`
- `sources`
- `chunks`
- `concepts`
- `concept_edges`
- `review_states`
- `quiz_items`
- `quiz_attempts`
- `reminder_settings`

### How It Appears In This Repo

- The normalized schema lives in `db/postgres.sql`.
- The tables are connected with primary keys, foreign keys, and join tables like `concept_sources` and `quiz_item_concepts`.

### Why It Matters

Normalization gives you:

- better data integrity
- less duplicated data
- targeted queries
- targeted updates
- clearer ownership of each piece of state

Example:

- If one concept belongs to multiple sources, that relationship is represented explicitly.
- You do not need to duplicate full source data inside every concept record.

### Read More

- Database normalization basics: https://learn.microsoft.com/en-us/troubleshoot/office/access/database-normalization-description
- PostgreSQL constraints and foreign keys: https://www.postgresql.org/docs/current/ddl-constraints.html
- Microsoft relational concepts module: https://learn.microsoft.com/en-us/shows/dbfundamentals/02

## 4. Why The Current App Still Rewrites The Whole Store

This is the part that is easy to miss:

The schema is normalized, but the app layer still mostly behaves like it is saving one giant store object.

### How It Appears In This Repo

- `src/lib/app.ts` still works in terms of broad store snapshots.
- `src/lib/store.ts` still exposes `getStore()` and `saveStore()`.
- `src/lib/postgres-store.ts` translates that whole store shape into many normalized tables.

So if the app updates one concept or one reminder setting, the persistence layer can still end up rewriting far more data than the feature logically changed.

### Why It Matters

This causes:

- unnecessary database work
- more complex write paths
- higher risk of clobbering unrelated changes
- weaker separation between application logic and persistence logic

The important distinction is:

- normalized schema: fixed
- whole-store runtime behavior: not fixed yet

Normalization improved the database structure. It did not automatically improve the application write pattern.

### Read More

- PostgreSQL transactions tutorial: https://www.postgresql.org/docs/current/tutorial-transactions.html
- PostgreSQL index introduction: https://www.postgresql.org/docs/current/indexes-intro.html

## 5. What Repository-Style Persistence Means

A repository is a narrower persistence boundary around one type of data or one set of related operations.

Instead of saying:

- load the whole store
- mutate it
- save the whole store

you say:

- update this concept
- insert this quiz attempt
- fetch due review states for this user

### How It Would Appear In This Repo

Examples of future repository-style modules would be things like:

- `conceptRepository.update(concept)`
- `reviewStateRepository.upsert(state)`
- `quizAttemptRepository.insert(attempt)`

### Why It Matters

Repositories make it easier to:

- write only the rows that changed
- keep orchestration code focused on product logic
- test persistence behavior more directly
- reduce coupling between business logic and storage format

### Read More

- Martin Fowler on Repository: https://martinfowler.com/eaaCatalog/repository.html

## 6. Service Layer vs Orchestration Layer vs Persistence Layer

These terms are related, but they are not the same thing.

### Service Layer

This repo's service layer is in `src/lib/services/`.

It contains logic like:

- chunking source content
- merging concepts
- building graph edges
- updating review state
- generating quiz items

This is the "how the learning system behaves" layer.

### Orchestration Layer

This repo's orchestration layer is `src/lib/app.ts`.

It coordinates multiple services and persistence operations for a user-facing flow.

Example:

- creating a source
- chunking it
- extracting concepts
- building edges
- generating quizzes
- creating reminder jobs
- persisting the resulting state

This is the "how a product flow is stitched together" layer.

### Persistence Layer

This repo's persistence layer is mainly:

- `src/lib/store.ts`
- `src/lib/postgres-store.ts`

This is the "how data is stored and retrieved" layer.

### Why It Matters

These layers should not collapse into one giant file with mixed responsibilities.

When they are separated well:

- services are easier to test
- orchestration is easier to read
- persistence can change without rewriting product logic

### Read More

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers-and-middleware
- PostgreSQL current documentation home: https://www.postgresql.org/docs/current/index.html

## 7. Glossary

### Normalized schema

A relational schema where data is split into separate tables with clear relationships, rather than duplicated everywhere.

### Snapshot store

A persistence style where the system saves one big object graph as a whole state snapshot.

### Repository

A persistence abstraction that exposes focused operations for a specific data area instead of a giant global store.

### Primary key

The column or columns that uniquely identify a row in a table.

### Foreign key

A constraint that says one row must point to a valid row in another table.

### Transaction

A group of database operations that succeed or fail together.

### Orchestration layer

The layer that coordinates a product flow across services and persistence.

### Service layer

The layer that implements domain behavior or business rules.

## 8. Recommended Reading Order

If you want the shortest practical path, read in this order:

1. This file
2. `README.md`
3. `docs/PROJECT_OVERVIEW.md`
4. `src/lib/types.ts`
5. `src/lib/app.ts`
6. `src/lib/postgres-store.ts`
7. `db/postgres.sql`

Then read these external references:

1. PostgreSQL tutorial: https://www.postgresql.org/docs/current/tutorial.html
2. PostgreSQL constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
3. PostgreSQL transactions: https://www.postgresql.org/docs/current/tutorial-transactions.html
4. Martin Fowler on Repository: https://martinfowler.com/eaaCatalog/repository.html
5. Database normalization basics: https://learn.microsoft.com/en-us/troubleshoot/office/access/database-normalization-description

## 9. Guided Study Path Through The Code

If you want to learn by reading the actual code, use this sequence.

Each step tells you what question to keep in mind while reading.

### Step 1: Start With The Shared Shapes

Read:

- `src/lib/types.ts`

Question to ask:

- What data does the app believe exists?

What to notice:

- `AppStore` is the large in-memory state shape.
- Most features are just different parts of that one store.
- Domain objects like `ModuleRecord`, `ConceptRecord`, `ReviewState`, and `QuizItem` tell you what the product actually manages.

### Step 2: Understand The Main Product Flows

Read:

- `src/lib/app.ts`

Question to ask:

- When the user does one thing, what other things happen as a result?

What to notice:

- This file is orchestration, not low-level logic.
- Functions like `createSource()`, `generateQuizzes()`, and `submitQuizAttempt()` stitch together multiple services and persistence.
- This is the best file for understanding feature flow.

### Step 3: Read The Store Boundary

Read:

- `src/lib/store.ts`

Question to ask:

- Where does persistence stop being "business logic" and start being "storage"?

What to notice:

- The app code asks for a store, mutates it, and saves it.
- The same interface is used for local JSON and Postgres.
- This is the root reason the app still thinks in whole-store operations.

### Step 4: Read The Postgres Adapter

Read:

- `src/lib/postgres-store.ts`
- `db/postgres.sql`

Question to ask:

- How does one app-level store object get translated into relational tables?

What to notice:

- The schema is normalized into real tables.
- The adapter has to reconstruct `AppStore` on reads and decompose it on writes.
- This is where the tension between "normalized schema" and "whole-store app architecture" becomes obvious.

### Step 5: Read One Service At A Time

Read:

- `src/lib/services/ingestion.ts`
- `src/lib/services/graph.ts`
- `src/lib/services/review.ts`
- `src/lib/services/quiz.ts`

Question to ask:

- Which logic is pure domain behavior, and which logic is orchestration or persistence?

What to notice:

- These files mostly do the actual product thinking.
- They are easier to reason about than `src/lib/app.ts` because they are narrower.
- Good architecture usually pushes more logic here and less into persistence-heavy orchestration code.

### Step 6: Trace A Request From UI To Storage

Read:

- `src/app/page.tsx`
- one or two route handlers under `src/app/api/`
- the relevant component in `src/components/`

Suggested flows:

- ingest a source
- update a concept
- submit a quiz attempt

Question to ask:

- How does the user action travel through the stack?

What to notice:

- UI calls an API route
- route calls `src/lib/app.ts`
- app layer calls services and persistence
- updated state comes back through the dashboard snapshot

### Step 7: Read The Tests Last

Read:

- `src/tests/app.integration.test.ts`
- the focused unit tests in `src/tests/`

Question to ask:

- What behavior does the repo treat as important enough to lock down?

What to notice:

- Tests are often a faster way to understand intended behavior than implementation details.
- The integration test is especially useful because it shows a realistic end-to-end flow.

### A Good Way To Study One Feature

For any feature, follow this order:

1. type in `src/lib/types.ts`
2. orchestration in `src/lib/app.ts`
3. service logic in `src/lib/services/`
4. persistence in `src/lib/store.ts` and `src/lib/postgres-store.ts`
5. route handler in `src/app/api/`
6. UI component in `src/components/`
7. tests in `src/tests/`

That order tends to reduce confusion because you learn:

- what the data is
- what the flow is
- what the logic is
- how it is stored
- how the user touches it

## 10. What To Learn Next After This Repo

Once the concepts above make sense, the next useful topics are:

- SQL joins and query planning
- indexes and why they speed up reads but cost writes
- transactions and isolation
- optimistic concurrency
- repository and unit-of-work patterns
- migrations and backward-compatible schema changes

If you understand those, the next persistence refactor in this repo will make much more sense.
