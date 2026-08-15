# Implementation Tasks — Spec Platform (MySpec-class SDD Tool)

> Derived from `constitution.md`, `requirements.md`, and `solution.md`. Every task traces to at least one requirement identifier or to a binding constitution rule.

## Overview

### Scope

This plan builds the platform described in `solution.md`: a Next.js modular monolith on Vercel with a pure workflow state machine, multi-provider LLM generation with durable resumable streaming, immutable spec revisions, and ZIP export — followed by the optional Quality stage.

### Execution Model

The plan makes no assumption about who executes it. Every task is self-describing — it names its dependencies, the modules it touches, and testable acceptance criteria — so it can be picked up by a solo developer driving an AI coding agent, or by several developers working in parallel.

- Tasks marked **`Parallel-safe: yes`** touch a disjoint module set from their siblings within the same milestone and may be worked concurrently once their dependencies are met.
- Tasks marked **`Parallel-safe: no`** modify shared foundations (the transition table, the section schema, migrations) and should be completed before dependent siblings start.
- A single executor may simply follow the numeric order; it is a valid topological ordering of the dependency graph.

### Sequencing Strategy

**Walking skeleton first.** Milestone 1 delivers the thinnest complete journey — sign in, submit a prompt, generate one stubbed spec file, approve it, download a ZIP — against a deterministic stub provider. Every later milestone deepens that path rather than adding a disconnected layer. This keeps an integrated, demonstrable system from day one and surfaces integration risk before the expensive work.

### Milestone Map

| Milestone | Tasks | Delivers | Demonstrable outcome |
|---|---|---|---|
| M0 | 1–10 | Foundation & toolchain | CI green on an empty app with enforced boundaries |
| M1 | 11–23 | Walking skeleton | Sign in → prompt → stub spec → approve → ZIP |
| M2 | 24–38 | Workflow engine & interview | Real gates and MCQ interview drive the flow |
| M3 | 39–52 | Generation, streaming & resilience | Real models stream, fail over, and resume |
| M4 | 53–62 | Review board, refinement & decisions | Per-stage review and diff-gated refinement |
| M5 | 63–71 | Attachments, parsing & research | Documents and live web research ground the specs |
| M6 | 72–80 | Export, sessions & completion | **MVP cut line** — full four-file bundle journey |
| M7 | 81–90 | Optional Quality stage | `quality.md` plus enrichment, removable |
| M8 | 91–98 | Hardening | Security, observability, performance verified |
| M9 | 99–103 | Documentation & release | Deployed, documented, parity-checked |

**MVP cut line:** end of Milestone 6. Everything up to that point delivers the parity product from `requirements.md`. Milestone 7 adds the differentiator and is intentionally the first thing after the line, per constitution P3.

### Task Format Legend

- `_Dependencies:_` — task numbers that must be complete first.
- `_Requirements:_` — FR / NFR / IR / DR identifiers, or the constitution rule being satisfied.
- `_Touches:_` — modules and files the task is expected to modify.
- `_Complexity:_` — **Small** < 1 hour, **Medium** 1–2 hours, **Large** 2–4 hours. Nothing exceeds 4 hours.
- `_Parallel-safe:_` — whether the task can run concurrently with its milestone siblings.

## Milestone 0 — Foundation & Toolchain

Goal: an empty but correct application whose CI already enforces every structural rule the constitution mandates.

- [x] 1\. Initialise the Next.js App Router project with strict TypeScript
  - Scaffold Next.js with the App Router, React, and TypeScript; enable `strict: true`, `noUncheckedIndexedAccess`, and `noImplicitOverride` in `tsconfig.json`.
  - Add a `typecheck` script; verify the build fails on an intentional `any`.
  - Acceptance Criteria:
    - `pnpm typecheck` passes on a clean checkout and fails when an `any` annotation is introduced.
    - The dev server renders a placeholder route.
  - _Dependencies: none_
  - _Requirements: Constitution — Technology Constraints, Coding Standards_
  - _Touches: repository root, `tsconfig.json`, `package.json`_
  - _Complexity: Small_
  - _Parallel-safe: no_

- [x] 2\. Configure ESLint and Prettier as build-blocking checks
  - Add ESLint with the TypeScript plugin, forbid `any`, non-null assertion abuse, and unchecked casts; add Prettier with a shared config.
  - Wire `lint` and `format:check` scripts.
  - Acceptance Criteria:
    - A file containing `const x: any = 1` fails `pnpm lint`.
    - A misformatted file fails `pnpm format:check`.
  - _Dependencies: 1_
  - _Requirements: Constitution — Coding Standards_
  - _Touches: `eslint.config.js`, `.prettierrc`, `package.json`_
  - _Complexity: Small_
  - _Parallel-safe: no_

- [x] 3\. Create the module folder structure and lint-enforced import boundaries
  - Create `src/modules/{workflow,agents,prompts,specs,projects,quality,adapters,web}` with an `index.ts` public interface per module.
  - Encode the allowed-edge table from `solution.md` using `import/no-restricted-paths` (or `eslint-plugin-boundaries`), including the rule that nothing may import `quality`.
  - Add a fixture test asserting a forbidden import produces a lint error.
  - Acceptance Criteria:
    - Importing `adapters/*` from `web` fails lint.
    - Importing `quality` from any core module fails lint.
    - Importing `agents` from `workflow` fails lint.
  - _Dependencies: 2_
  - _Requirements: Constitution A1, A6; SC-15_
  - _Touches: `src/modules/**`, `eslint.config.js`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 4\. Set up Vitest for unit testing
  - Configure Vitest with path aliases matching the module structure and a coverage reporter.
  - Add a sample pure-function test to prove the harness runs with no database or network.
  - Acceptance Criteria:
    - `pnpm test:unit` runs and passes with zero network access.
    - Coverage output is produced.
  - _Dependencies: 3_
  - _Requirements: Constitution — Testing Approaches item 1_
  - _Touches: `vitest.config.ts`, `package.json`_
  - _Complexity: Small_
  - _Parallel-safe: yes_

- [x] 5\. Set up Playwright with the supported browser matrix
  - Configure Playwright projects for Chromium, Firefox, and WebKit; document that Edge is covered by the Chromium project.
  - Add a trivial smoke test against the placeholder route.
  - Acceptance Criteria:
    - `pnpm test:e2e` runs the smoke test on all three browser projects.
  - _Dependencies: 1_
  - _Requirements: NFR-011; SC-12_
  - _Touches: `playwright.config.ts`, `e2e/`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 6\. Provision Neon Postgres and configure Drizzle with in-repo migrations
  - Create production and preview Neon branches; configure the Drizzle serverless driver and the migration folder.
  - Add `db:generate` and `db:migrate` scripts; commit the initial empty migration.
  - Acceptance Criteria:
    - `pnpm db:migrate` applies cleanly to a fresh database.
    - Migration SQL files are committed to the repository.
  - _Dependencies: 1_
  - _Requirements: Constitution — Technology Constraints; D-12_
  - _Touches: `src/db/**`, `drizzle.config.ts`, `migrations/`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 7\. Implement the Zod-validated environment configuration loader
  - Define a schema covering every variable in the solution's configuration table; parse once at boot and export a typed config object.
  - Fail fast with a readable message listing every missing or invalid variable.
  - Acceptance Criteria:
    - Booting with a missing required variable exits non-zero and names the variable.
    - No module reads `process.env` directly outside the loader (enforced by a lint rule).
  - _Dependencies: 3_
  - _Requirements: IR-X2; NFR-006 AC-1; Constitution — Coding Standards_
  - _Touches: `src/config/env.ts`, `eslint.config.js`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 8\. Set up the GitHub Actions CI pipeline
  - Run lint, the boundary fixture, typecheck, unit tests, and E2E tests on every pull request; block merge on any failure.
  - Cache dependencies and Playwright browsers.
  - Acceptance Criteria:
    - A PR with a failing unit test cannot be merged.
    - A PR with a forbidden cross-module import cannot be merged.
  - _Dependencies: 4, 5, 6_
  - _Requirements: Constitution — Testing Approaches Rules; SC-15_
  - _Touches: `.github/workflows/ci.yml`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 9\. Configure the Vercel project with previews and a migration deploy step
  - Connect the repository, set server-side environment variables, and add a deploy step running `db:migrate` against the target branch.
  - Acceptance Criteria:
    - A pull request produces a preview deployment bound to the preview database branch.
    - Production deploy applies pending migrations before serving traffic.
  - _Dependencies: 6, 7_
  - _Requirements: Solution — Deployment & Operations_
  - _Touches: Vercel project settings, `vercel.json`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 10\. Install Tailwind and shadcn/ui with the base application shell
  - Configure Tailwind, vendor the shadcn/ui primitives needed for cards, buttons, and forms, and build an empty authenticated-area layout.
  - Acceptance Criteria:
    - The shell renders with Tailwind styles applied and no external component runtime dependency.
  - _Dependencies: 1_
  - _Requirements: Solution — Technology Stack_
  - _Touches: `src/modules/web/**`, `tailwind.config.ts`_
  - _Complexity: Small_
  - _Parallel-safe: yes_

## Milestone 1 — Walking Skeleton

Goal: the thinnest complete journey, end to end, against a deterministic stub provider.

- [x] 11. Create the users, projects, and sessions schema
  - Define Drizzle tables for `users`, `projects`, `sessions`, and `workflow_state` per the solution's data model, with foreign keys and timestamps.
  - Acceptance Criteria:
    - Migration applies cleanly and rolls forward on an existing database.
    - `projects.owner_id` is a non-null foreign key to `users.id`.
  - _Dependencies: 6_
  - _Requirements: DR-1; Solution — Data Model_
  - _Touches: `src/db/schema/**`, `migrations/`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 12\. Implement Auth.js with Google and GitHub providers
  - Configure Auth.js with the database session strategy, httpOnly `Secure` `SameSite=Lax` cookies, and both OAuth providers.
  - Ensure a returning identity resolves to the existing account rather than creating a duplicate.
  - Acceptance Criteria:
    - Signing in with Google creates exactly one user; signing in again reuses it.
    - Signing in with GitHub for an unseen identity creates a new account.
    - After sign-out, a request carrying the prior session cookie is unauthenticated.
  - _Dependencies: 11_
  - _Requirements: FR-001; IR-002_
  - _Touches: `src/modules/projects/auth/**`, `src/app/api/auth/[...nextauth]/route.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 13\. Implement the OwnerScope repository pattern
  - Define `OwnerScope` and make it a required first parameter on every project-scoped repository method; inject the ownership predicate into every query.
  - Add a lint rule or type-level guard preventing an unscoped project query.
  - Acceptance Criteria:
    - No repository method reading project-scoped data compiles without an `OwnerScope`.
    - A query for another user's project returns empty rather than the row.
  - _Dependencies: 11_
  - _Requirements: NFR-005; AR-1; DR-1; D-13_
  - _Touches: `src/modules/projects/repositories/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 14\. Implement route protection and not-found equivalence
  - Add middleware protecting every application and API route except the auth handlers; map unauthenticated access to a redirect and unowned access to `NOT_FOUND`.
  - Acceptance Criteria:
    - An unauthenticated request to a project route redirects to sign-in without revealing existence.
    - An authenticated request for another user's project returns 404, not 403.
  - _Dependencies: 12, 13_
  - _Requirements: FR-001 AC-5; AR-2; NFR-005 AC-2_
  - _Touches: `src/middleware.ts`, `src/modules/web/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 15\. Build the project list and create-from-prompt flow
  - Implement `GET /api/projects` and `POST /api/projects`; the create form takes a free-text prompt, persists it as the session's grounding input, and enters the `interview` stage.
  - Reject empty or whitespace-only prompts client- and server-side.
  - Acceptance Criteria:
    - The list shows only the signed-in user's projects with name, stage, and last-updated time.
    - Submitting a prompt creates a project whose session stores the prompt verbatim.
    - Submitting whitespace is rejected with a message.
  - _Dependencies: 10, 13, 14_
  - _Requirements: FR-002 AC-1/AC-2; FR-003_
  - _Touches: `src/modules/projects/**`, `src/modules/web/projects/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 16\. Create the spec files and revisions schema with the immutability trigger
  - Define `spec_files` and `spec_revisions`; add a `BEFORE UPDATE` trigger freezing `content`, `origin`, `derived_from`, `context_attachment_ids`, `revision_number`, `spec_file_id`, and `created_at`.
  - Permit `approved` to move `false → true` only; deny `DELETE` except via project cascade.
  - Constrain `file_name` to the five permitted names and make `(spec_file_id, revision_number)` unique.
  - Acceptance Criteria:
    - An `UPDATE` altering `content` raises a database error.
    - Setting `approved` from `true` to `false` raises; `false` to `true` succeeds.
    - Inserting a sixth file name violates the constraint.
  - _Dependencies: 11_
  - _Requirements: FR-012; DR-2; DR-3; DR-4; D-11_
  - _Touches: `src/db/schema/specs.ts`, `migrations/`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 17\. Implement revision allocation and the RevisionRepository
  - Allocate `revision_number` inside the insert transaction so numbers are gapless; expose resolvers for latest, latest-approved, and latest pre-enrichment revisions.
  - Acceptance Criteria:
    - Concurrent inserts on the same spec file produce consecutive numbers with no gaps or duplicates.
    - `latestApproved` ignores unapproved revisions.
  - _Dependencies: 16_
  - _Requirements: FR-012 AC-1/AC-4; DR-3_
  - _Touches: `src/modules/specs/repositories/revisions.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 18\. Implement the deterministic stub LLM adapter
  - Build the `TestDouble` implementation of the adapter interface, returning fixed markdown chunk-by-chunk with configurable delay and failure injection.
  - Acceptance Criteria:
    - The stub streams a known document in deterministic chunks.
    - It can be configured to fail at a chosen chunk index for later failover tests.
  - _Dependencies: 3_
  - _Requirements: IR-001-AC-5; IR-X4; NFR-012 AC-5_
  - _Touches: `src/modules/adapters/llm/test-double.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 19\. Implement minimal workflow state persistence and the stage rail
  - Persist stage and substage on `workflow_state`; render the current and remaining stages in the session shell.
  - Acceptance Criteria:
    - The stage rail reflects the persisted stage after a page reload.
    - Stage and substage are readable from a single query.
  - _Dependencies: 10, 11_
  - _Requirements: FR-007 AC-1/AC-9_
  - _Touches: `src/modules/workflow/**`, `src/modules/web/session/SessionShell.tsx`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 20\. Implement the minimal stub generation path
  - Implement `POST /api/sessions/:id/generate` in its simplest form: resolve `OwnerScope`, invoke the stub adapter, collect the markdown, and persist it as an **unapproved** `SpecRevision` via the RevisionRepository, returning the spec card payload.
  - No provider registry, failover, chunk log, or event protocol yet — those arrive in tasks 43–45, which extend this handler rather than replacing the route.
  - Acceptance Criteria:
    - One invocation persists exactly one unapproved revision for the target spec file.
    - No real model provider is contacted; the stub adapter is the only source.
    - A request for a session the caller does not own returns `NOT_FOUND`.
  - _Dependencies: 17, 18, 19_
  - _Requirements: FR-008 AC-1/AC-3/AC-5; NFR-005_
  - _Touches: `src/app/api/sessions/[id]/generate/route.ts`, `src/modules/agents/spec/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 21\. Implement the SpecCard with approve and request-changes decisions
  - Render a generated spec with approve and request-changes actions; implement `POST /api/specs/:specFileId/decision`.
  - Requesting changes produces a new **unapproved** revision that is itself presented for approval; the prior revision stays in history.
  - Acceptance Criteria:
    - The workflow does not advance while no decision is recorded.
    - Approving marks exactly that revision approved.
    - Requesting changes creates a new revision with `approved = false`.
  - _Dependencies: 17, 19, 20_
  - _Requirements: FR-009 AC-1..AC-5_
  - _Touches: `src/modules/specs/**`, `src/modules/web/session/SpecCard.tsx`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 22\. Implement basic ZIP export of approved revisions
  - Implement `GET /api/projects/:id/export` assembling a ZIP from approved revisions with exact file names and no additional entries.
  - Acceptance Criteria:
    - The archive contains only spec markdown files, named exactly, extractable into `.specs/` without renaming.
    - Files without an approved revision are omitted rather than emitted empty.
  - _Dependencies: 17_
  - _Requirements: FR-015 AC-1/AC-9/AC-10_
  - _Touches: `src/modules/specs/export/**`, `src/app/api/projects/[id]/export/route.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 23\. Write the walking-skeleton E2E test
  - Playwright test: sign in with a stubbed identity, create a project from a prompt, generate one stub spec, approve it, download the ZIP, assert its contents.
  - Acceptance Criteria:
    - The test passes headlessly in CI against the stub provider with no live model call.
    - The downloaded archive contains the expected file with the expected content.
  - _Dependencies: 5, 20, 21, 22_
  - _Requirements: SC-16; Constitution — Testing Approaches item 2_
  - _Touches: `e2e/skeleton.spec.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

## Milestone 2 — Workflow Engine & Interview

Goal: replace the skeleton's implicit flow with the real, exhaustively tested state machine and the structured interview.

- [x] 24\. Implement the stage model and the explicit transition table
  - Define `StagePosition`, `Substage`, and the static transition table covering every legal edge including `complete → quality`; each row references a gate by identifier.
  - Acceptance Criteria:
    - The table is a plain exported array enumerable by tests.
    - A transition absent from the table is rejected with `TRANSITION_NOT_IN_TABLE`.
  - _Dependencies: 19_
  - _Requirements: FR-007; Constitution A2, P1; D-1_
  - _Touches: `src/modules/workflow/transition-table.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 25\. Implement the WorkflowSnapshot assembler
  - Build the repository query producing a snapshot: stage, substage, answered rounds per stage, satisfied information needs, spec approval flags, review decisions, quality flag, registered capabilities.
  - Acceptance Criteria:
    - The snapshot is a plain serialisable object constructible in a test from fixtures.
    - Assembling it requires at most the documented number of queries.
  - _Dependencies: 24_
  - _Requirements: FR-007 AC-1; NFR-012 AC-2_
  - _Touches: `src/modules/workflow/snapshot.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 26\. Implement the gate predicates
  - Implement `interviewGate`, `collectGate`, `approvalGate`, `reviewGate`, and `completionGate` as pure functions over the snapshot, each returning a typed reason code on rejection.
  - No gate may perform network, database, filesystem, or model I/O.
  - Acceptance Criteria:
    - Every gate is a pure function; a test invoking one with a literal snapshot performs no I/O.
    - `interviewGate` requires grounding input, one answered round, and a persisted summary, naming whichever is missing.
    - `completionGate` refuses when any required spec lacks an approved revision.
  - _Dependencies: 25_
  - _Requirements: FR-006; FR-007 AC-2..AC-4; FR-020 AC-2; NFR-012 AC-1_
  - _Touches: `src/modules/workflow/gates/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 27\. Implement the round budget gate
  - Implement `roundBudgetGate` as `answeredRounds(stage) < MAX_ROUNDS_PER_STAGE` with the default of 3 read from configuration; return `ROUND_LIMIT_REACHED` when exhausted.
  - Acceptance Criteria:
    - A fourth round request for a stage is refused with `ROUND_LIMIT_REACHED`.
    - Changing the configured budget changes the behaviour with no code change.
  - _Dependencies: 7, 26_
  - _Requirements: FR-005 AC-10; Constitution P1; D-2_
  - _Touches: `src/modules/workflow/gates/round-budget.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 28\. Implement applyTransition with optimistic concurrency
  - Persist transitions in a transaction guarded by `workflow_state.version`; a stale version fails with `CONFLICT`.
  - Acceptance Criteria:
    - Two concurrent transitions produce exactly one success and one `CONFLICT`.
    - No transition is persisted unless `evaluateTransition` allowed it.
  - _Dependencies: 26_
  - _Requirements: FR-007 AC-6; Solution — workflow error handling_
  - _Touches: `src/modules/workflow/apply-transition.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 29\. Implement the transition API endpoint
  - Implement `POST /api/sessions/:id/transition` returning 200 on success and 409 with the machine-readable reason code on rejection.
  - Acceptance Criteria:
    - An out-of-order transition returns 409 carrying the unmet gate's reason code.
    - The response never advances state on rejection.
  - _Dependencies: 14, 28_
  - _Requirements: FR-007 AC-6; NFR-012 AC-4_
  - _Touches: `src/app/api/sessions/[id]/transition/route.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 30\. Write exhaustive transition matrix unit tests
  - Enumerate the transition table programmatically and assert every legal edge is allowed under a satisfying snapshot and rejected under each unsatisfying one; assert every illegal pair is refused.
  - Include both Quality orderings and the `complete → quality → complete` cycle. Task 81 extends this same suite with capability-registration cases.
  - Acceptance Criteria:
    - Every entry in the transition table is covered by at least one passing and one failing case.
    - Every `ReasonCode` is asserted at least once.
    - The suite runs with no database, model, or UI.
  - _Dependencies: 27, 28_
  - _Requirements: NFR-012 AC-3/AC-6; SC-8_
  - _Touches: `src/modules/workflow/__tests__/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 31\. Create the question rounds, answers, and information needs schema
  - Define `question_rounds`, `answers`, and `information_needs`; make `(session_id, stage, round_number)` and `(session_id, stage, name)` unique.
  - Acceptance Criteria:
    - Duplicate information-need names within a stage are rejected by the database.
    - Round numbers are unique per session and stage.
  - _Dependencies: 11_
  - _Requirements: DR-5; DR-13; FR-005 AC-7_
  - _Touches: `src/db/schema/interview.ts`, `migrations/`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 32\. Implement the QuestionSet schema with repair-once validation
  - Implement `QuestionSetSchema` enforcing 2–8 options per question, single/multiple type, and mandatory `allowOther: true`; on failure, attempt one repair pass, then abort with `DRAFT_INVALID`.
  - Acceptance Criteria:
    - A set with 1 option or 9 options is rejected.
    - A question missing `allowOther` is rejected.
    - A set failing twice is never persisted and surfaces `DRAFT_INVALID`.
  - _Dependencies: 31_
  - _Requirements: FR-005 AC-2/AC-3; NFR-009 AC-2; D-2_
  - _Touches: `src/modules/agents/schemas/question-set.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 33\. Implement the InterviewAgent
  - Produce question rounds from the session prompt and prior answers, declaring the information needs each round intends to satisfy; validate through `QuestionSetSchema` before persistence.
  - Never re-declare an information need already marked satisfied for the stage.
  - Acceptance Criteria:
    - A generated round persists with its stage, round number, and declared information needs.
    - A need already satisfied is not re-declared in a later round of the same stage.
  - _Dependencies: 18, 32_
  - _Requirements: FR-005 AC-7/AC-9_
  - _Touches: `src/modules/agents/interview/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 34\. Build the MCQ card UI
  - Render validated question sets as single- or multi-select cards, always rendering exactly one free-text "other" field derived from `allowOther`.
  - Block generation while a card awaits submission.
  - Acceptance Criteria:
    - Every rendered question shows exactly one free-text entry, never two.
    - No spec generation is triggered in the same interaction that displays a card.
  - _Dependencies: 10, 32_
  - _Requirements: FR-005 AC-1/AC-3/AC-4_
  - _Touches: `src/modules/web/session/McqCard.tsx`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 35\. Implement answer submission and information-need satisfaction
  - Implement `POST /api/sessions/:id/answers`, persisting selected option ids and free text, and marking the round's information needs satisfied.
  - Persist answers before rendering the next step.
  - Acceptance Criteria:
    - Both option ids and free text are retained for every answer.
    - Satisfied needs are derivable from persisted rounds after a reload, not from conversation memory.
  - _Dependencies: 33, 34_
  - _Requirements: FR-005 AC-5/AC-8/AC-11; DR-5; NFR-003 AC-1_
  - _Touches: `src/app/api/sessions/[id]/answers/route.ts`, `src/modules/projects/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 36\. Handle free-text replies to a pending question card
  - When the user replies in chat instead of submitting the pending card, persist the reply as stage context and mark any information needs it demonstrably satisfies.
  - Then either emit a narrower follow-up round (subject to `roundBudgetGate`) or, if `collectGate` now passes, proceed to generation.
  - Acceptance Criteria:
    - A free-text reply is never silently discarded and never silently dismisses the pending round.
    - An information need satisfied by the reply is not re-asked in a later round.
    - If the reply satisfies the collect gate, the stage proceeds without a further round.
  - _Dependencies: 27, 33, 35_
  - _Requirements: FR-005 AC-6_
  - _Touches: `src/modules/agents/interview/**`, `src/modules/web/session/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 37\. Implement the round-exhaustion fallback
  - When `roundBudgetGate` is exhausted and `collectGate` is unsatisfied, present the unmet information needs with a free-text entry that records the answer directly; when `collectGate` is satisfied, proceed to generation.
  - Acceptance Criteria:
    - Exhausting the budget with unmet needs never leaves the session without an action.
    - Supplying the outstanding information via free text satisfies the need and unblocks generation.
  - _Dependencies: 27, 35, 36_
  - _Requirements: FR-005 AC-10; SC-16_
  - _Touches: `src/modules/web/session/**`, `src/modules/workflow/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 38\. Implement session summary persistence and wire the interview exit gate
  - Persist a short session summary during the interview and connect `interviewGate` to the real transition endpoint.
  - Acceptance Criteria:
    - Leaving `interview` is refused until grounding input, one answered round, and a summary all exist.
    - An agent claim that the interview is complete does not satisfy the gate on its own.
  - _Dependencies: 26, 35_
  - _Requirements: FR-006 AC-1..AC-4_
  - _Touches: `src/modules/projects/sessions.ts`, `src/modules/workflow/gates/interview.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

## Milestone 3 — Generation, Streaming & Resilience

Goal: real models produce structurally valid specs, survive provider failure, and survive dropped connections.

- [x] 39\. Implement the section schema module
  - Create `specs/section-schema.ts` as the single typed source of required headings per spec type, validated by Zod, and export the reusable Zod shape type for other modules to build their own schemas from.
  - Establish the **consumption chain**: only `assemblePrompt` (task 41) and `validateStructure` (task 40) import the schema module; every other structural check goes through `validateStructure`.
  - Add a lint rule enforcing that import restriction and forbidding heading lists restated anywhere else.
  - Acceptance Criteria:
    - Only `assemblePrompt` and `validateStructure` import `section-schema.ts`; any other import fails lint.
    - A duplicated heading list elsewhere in the repository fails lint.
    - The exported shape type is reusable without exposing the parity heading data.
  - _Dependencies: 3_
  - _Requirements: Constitution P3; D-16_
  - _Touches: `src/modules/specs/section-schema.ts`, `eslint.config.js`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 40\. Implement validateStructure and the parity structural check
  - Implement heading presence and ordering validation against the section schema, exposed as the single structural-validation entry point for all other modules.
  - Add the build-blocking parity test asserting default-mode output is exactly the four files with required headings in order.
  - Acceptance Criteria:
    - A generated file missing a required heading fails validation.
    - A file with headings out of order fails validation.
    - The parity test blocks the build on violation.
  - _Dependencies: 39_
  - _Requirements: NFR-007; SC-7; Constitution — Testing Approaches item 4_
  - _Touches: `src/modules/specs/validate-structure.ts`, `src/modules/specs/__tests__/parity.test.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 41\. Implement the prompts module
  - Store prompts as versioned file assets keyed by identifier; implement `assemblePrompt` with typed interpolation deriving required sections from the section schema.
  - Acceptance Criteria:
    - A missing prompt identifier or unfilled variable fails at build or boot, not at request time.
    - No prompt file restates a heading list literally.
  - _Dependencies: 39_
  - _Requirements: Constitution — Coding Standards; D-16_
  - _Touches: `src/modules/prompts/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 42\. Implement the LLM adapter over the AI SDK
  - Wrap `@ai-sdk/anthropic`, `@ai-sdk/openai`, and `@ai-sdk/google` behind one `generateStreaming` interface accepting assembled messages and tools; keep provider types inside the module.
  - Build the provider registry from `LLM_PROVIDER_ORDER`.
  - Acceptance Criteria:
    - No provider-specific type is exported from the module.
    - Reordering the chain via configuration changes provider selection with no code change.
  - _Dependencies: 7, 18_
  - _Requirements: IR-001; Constitution P7, A3; D-6_
  - _Touches: `src/modules/adapters/llm/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 43\. Implement the failover client
  - Apply `LLM_REQUEST_TIMEOUT_MS` per provider; on error or timeout advance to the next provider; raise `AllProvidersFailedError` only when the chain is exhausted.
  - Strip provider names and raw payloads from user-facing errors.
  - Acceptance Criteria:
    - With the primary stubbed to fail, generation completes via the next provider without user intervention.
    - A failure is surfaced only after every configured provider has been attempted.
    - No user-facing message contains a provider name or stack trace.
  - _Dependencies: 42_
  - _Requirements: NFR-004; FR-018 AC-1/AC-2/AC-7; SC-4_
  - _Touches: `src/modules/adapters/llm/failover-client.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 44\. Create the generation runs and chunks schema with the StreamRecorder
  - Define `generation_runs` (including `first_token_at` and `completed_at`) and `generation_chunks`; implement batched appends (~250 ms or 2 KB) and stamp `first_token_at` on the first delta of the successful attempt.
  - Prune chunks once a run reaches `complete`.
  - Acceptance Criteria:
    - Chunks are appended in batches, not per token.
    - `first_token_at` is set exactly once per successful run.
    - Chunks are removed after the run completes and its revision is persisted.
  - _Dependencies: 11, 42_
  - _Requirements: NFR-003; SC-1; D-7_
  - _Touches: `src/db/schema/generation.ts`, `src/modules/adapters/llm/stream-recorder.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 45\. Extend the generation handler with gating and the event protocol
  - Extend the task 20 handler: check the gate before any model call, open the stream, and emit `run`, `delta`, `research`, `restart`, `complete`, and `error` events as newline-delimited JSON.
  - Acceptance Criteria:
    - A rejected gate returns 409 with the reason code and issues no model call.
    - A successful run emits `run` first and `complete` last with the persisted revision identifier.
    - The task 23 skeleton test still passes against the extended handler.
  - _Dependencies: 20, 29, 43, 44_
  - _Requirements: FR-008 AC-1..AC-3; Constitution A5_
  - _Touches: `src/app/api/sessions/[id]/generate/route.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 46\. Implement the fetch-based resumable stream client
  - Implement `useResumableStream` consuming both the POST generation stream and the GET resume stream with `response.body.getReader()`; track the highest rendered sequence and reconnect with backoff.
  - Acceptance Criteria:
    - Streaming renders incrementally, never only on completion.
    - `EventSource` is not used anywhere in the codebase.
    - A simulated disconnect triggers reconnection automatically.
  - _Dependencies: 45_
  - _Requirements: FR-008 AC-2; NFR-002 AC-2; D-8_
  - _Touches: `src/modules/web/session/useResumableStream.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 47\. Implement the stream resume endpoint
  - Implement `GET /api/generations/:runId/stream?from=<seq>`: resolve `OwnerScope` through run → session → project → owner before replaying, then replay chunks above the sequence and attach to the live stream, or return `complete` if finished.
  - Acceptance Criteria:
    - A resume request for another user's run returns `NOT_FOUND`, indistinguishable from a missing run.
    - Reconnecting mid-generation loses no rendered content and produces no duplicate text.
    - Resuming a finished run returns `complete` immediately.
  - _Dependencies: 13, 44, 46_
  - _Requirements: FR-017; NFR-003 AC-3; NFR-005 AC-2; SC-3; SC-5_
  - _Touches: `src/app/api/generations/[runId]/stream/route.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 48\. Implement mid-stream failover restart semantics
  - On failover after streaming has begun, discard buffered chunks, emit `restart`, and re-append from sequence zero for the new attempt; never concatenate output across providers.
  - Acceptance Criteria:
    - Forcing a failure at chunk five emits `restart` and the client clears rendered text.
    - No revision ever contains text from two providers.
    - Partial output is never persisted as a revision.
  - _Dependencies: 43, 44, 46_
  - _Requirements: FR-018 AC-5; D-9_
  - _Touches: `src/modules/adapters/llm/failover-client.ts`, `src/modules/web/session/useResumableStream.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 49\. Implement generation failure handling and retry
  - On `AllProvidersFailedError` or structural-validation failure, mark the run failed, emit a sanitised `error`, and offer a retry that resumes from the same workflow position with identical context.
  - Acceptance Criteria:
    - All prior answers, approved specs, and revisions survive the failure.
    - Retry continues from the failed position with no duplicated stage and no repeated question round.
    - No partial output is persisted as an approved revision.
  - _Dependencies: 40, 48_
  - _Requirements: FR-018 AC-2..AC-6; FR-008 AC-7_
  - _Touches: `src/modules/agents/**`, `src/modules/web/session/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 50\. Implement the ContextAssembler
  - Assemble generation context from the session prompt, all prior answers, attachment text, and every previously approved spec, in deterministic order with an explicit size budget and truncation policy.
  - Expose the insertion points later extended by feedback filtering (task 57), late attachments (task 69), and untrusted-content wrapping (task 71).
  - Acceptance Criteria:
    - The same inputs always produce a byte-identical assembled context.
    - All four context sources are present when available.
    - Exceeding the size budget truncates by the documented policy rather than dropping a source silently.
  - _Dependencies: 35, 41_
  - _Requirements: FR-008 AC-6_
  - _Touches: `src/modules/agents/context-assembler.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 51\. Implement the SpecAgent
  - Invoke the model with the assembled context and stream the result; validate output through `validateStructure` before persisting a revision.
  - Acceptance Criteria:
    - Output failing structural validation is treated as a failed generation and is not persisted.
    - Exactly one spec file is produced per generation run.
    - The agent imports `validateStructure`, never `section-schema.ts` directly.
  - _Dependencies: 40, 41, 45, 50_
  - _Requirements: FR-008 AC-4..AC-7_
  - _Touches: `src/modules/agents/spec/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 52\. Write LLM adapter tests
  - Cover failover ordering, mid-stream restart, chunk batching, `first_token_at` stamping, and resume replay from a sequence number, using the stub provider.
  - Acceptance Criteria:
    - Every test runs with no live provider call.
    - Failover order matches the configured chain exactly.
  - _Dependencies: 47, 48_
  - _Requirements: NFR-012 AC-5; IR-001-AC-5; SC-4_
  - _Touches: `src/modules/adapters/llm/__tests__/**`_
  - _Complexity: Large_
  - _Parallel-safe: yes_

## Milestone 4 — Review Board, Refinement & Decisions

Goal: every stage is reviewed, refinements are gated by an accepted diff, and decisions can be typed as well as clicked.

- [x] 53\. Create the review feedback schema
  - Define `review_feedback` with `outcome`, `items` (each carrying a stable `id`), `decision`, and `selected_item_ids`, null for accept and ignore decisions.
  - Acceptance Criteria:
    - Every persisted feedback item has a stable, non-empty id.
    - `selected_item_ids` is populated only for request-changes decisions.
  - _Dependencies: 16_
  - _Requirements: FR-010 AC-7; Solution — Data Model_
  - _Touches: `src/db/schema/specs.ts`, `migrations/`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 54\. Implement the ReviewAgent
  - Produce `{ outcome, mustfix[], recommendations[] }` validated against `ReviewArtifact`; each item carries a section reference, description, and concrete suggestion.
  - Acceptance Criteria:
    - Output is Zod-validated before persistence.
    - Every item classifies as blocking or advisory and names a section.
    - The overall outcome is exactly `pass` or `needs_revision`.
  - _Dependencies: 51, 53_
  - _Requirements: FR-010 AC-1..AC-3_
  - _Touches: `src/modules/agents/review/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 55\. Build the ReviewBoard UI with per-item selection
  - Render blocking and advisory items separately with per-item checkboxes; present accept, ignore, and request-changes actions.
  - Acceptance Criteria:
    - The workflow waits until one of the three actions is chosen.
    - Request-changes submits the chosen `selectedItemIds`.
    - Request-changes is disabled with no item selected.
  - _Dependencies: 10, 54_
  - _Requirements: FR-010 AC-4/AC-7_
  - _Touches: `src/modules/web/session/ReviewBoard.tsx`_
  - _Complexity: Large_
  - _Parallel-safe: yes_

- [x] 56\. Implement the review decision endpoint and gate wiring
  - Implement `POST /api/reviews/:id/decision` with `ReviewDecision` validation; accept and ignore permit the next stage, request-changes returns the stage to `generate`.
  - Acceptance Criteria:
    - Accept or ignore satisfies `reviewGate` for the stage.
    - Request-changes without a selected item is rejected by validation.
    - A revised spec, once approved, triggers a fresh review of the new content.
  - _Dependencies: 26, 55_
  - _Requirements: FR-010 AC-5/AC-6/AC-8_
  - _Touches: `src/app/api/reviews/[id]/decision/route.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 57\. Implement the RevisionAgent with filtered feedback
  - Extend the ContextAssembler so the revision prompt contains only the selected feedback items; omit unselected items entirely rather than marking them optional.
  - Acceptance Criteria:
    - A prompt built with two of five selected items contains only those two.
    - No unselected recommendation appears in the revised output.
  - _Dependencies: 50, 56_
  - _Requirements: FR-010 AC-7_
  - _Touches: `src/modules/agents/revision/**`, `src/modules/agents/context-assembler.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 58\. Create the proposed changes schema
  - Define `proposed_changes` with a partial unique index on `(spec_file_id) WHERE status = 'pending'`.
  - Acceptance Criteria:
    - Inserting a second pending proposal for the same file violates the index.
    - A proposal is never readable through any spec-content query path.
  - _Dependencies: 16_
  - _Requirements: DR-10; DR-11; D-10_
  - _Touches: `src/db/schema/specs.ts`, `migrations/`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 59\. Implement the ProposedChangeService and DiffService
  - Compute proposed content from a plain-language instruction without persisting a revision; produce a line-level unified diff against the current revision.
  - Refuse a proposal that would remove a required section, using `validateStructure` rather than reading the section schema directly.
  - Acceptance Criteria:
    - Submitting an instruction creates a pending proposal and no revision.
    - An instruction removing a required heading is refused with the section named.
    - An ambiguous instruction produces a clarifying question instead of a guessed change.
  - _Dependencies: 40, 58_
  - _Requirements: FR-011 AC-1/AC-2/AC-8/AC-9_
  - _Touches: `src/modules/specs/proposed-changes/**`, `src/modules/specs/diff.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 60\. Build the DiffCard with accept and reject
  - Render the diff with accept and reject actions; accept persists a new revision, reject discards the proposal leaving content byte-identical.
  - Block a second change to the same file while a proposal is pending.
  - Acceptance Criteria:
    - Rejecting creates no revision and the file content is byte-for-byte unchanged.
    - Accepting creates exactly one new revision with prior revisions unmodified.
    - A second instruction for the same file while pending is refused with `PENDING_DECISION`.
  - _Dependencies: 59_
  - _Requirements: FR-011 AC-3..AC-7; FR-012 AC-6_
  - _Touches: `src/modules/web/session/DiffCard.tsx`, `src/app/api/proposed-changes/[id]/decision/route.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 61\. Implement the DecisionIntentResolver
  - Resolve a typed message against the pending decision: deterministic phrase match first, constrained model classification only if inconclusive, abstain below the confidence threshold or when the message reads as a question.
  - Acceptance Criteria:
    - A clear "approve" phrase resolves with no model call.
    - An ambiguous message or a question returns null and leaves the card pending.
    - A resolved intent cannot select an action the pending card does not offer.
  - _Dependencies: 21, 56, 60_
  - _Requirements: FR-009 AC-6/AC-7; FR-010 AC-4; Constitution P2; D-4_
  - _Touches: `src/modules/agents/decision-intent/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 62\. Implement the chat message endpoint routing to decision endpoints
  - Implement `POST /api/sessions/:id/messages`; a resolved intent is dispatched internally to the same endpoint the card would call, and the response reports which decision was applied.
  - An unresolved intent returns the assistant's textual answer with `pendingAction` unchanged.
  - Acceptance Criteria:
    - A typed approval produces the identical persisted state as clicking approve.
    - An unresolved message leaves the pending card rendered unchanged.
    - The audit trail does not distinguish card-driven from chat-driven decisions.
  - _Dependencies: 61_
  - _Requirements: FR-009 AC-7; SC-14_
  - _Touches: `src/app/api/sessions/[id]/messages/route.ts`, `src/modules/web/session/useChatDecision.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

## Milestone 5 — Attachments, Parsing & Research

Goal: user documents and live web research ground the generated specs, safely.

- [x] 63\. Create the attachments schema and the storage adapter
  - Define `attachments`; implement `StorageAdapter` over private Vercel Blob with owner-scoped signed URL issuance and bulk deletion.
  - Acceptance Criteria:
    - Stored objects are not publicly addressable.
    - A signed URL is issued only after an ownership check; a non-owner receives `NOT_FOUND`.
  - _Dependencies: 11, 13_
  - _Requirements: FR-004; IR-005; NFR-008 AC-2_
  - _Touches: `src/db/schema/attachments.ts`, `src/modules/adapters/storage/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 64\. Implement the upload guard
  - Validate declared type, sniffed content type, and size against `MAX_UPLOAD_BYTES` and `ALLOWED_UPLOAD_TYPES` **before** any bytes are written to storage.
  - Acceptance Criteria:
    - An oversized file is rejected with `UPLOAD_REJECTED` and no blob is written.
    - An unsupported type is rejected naming the supported types, with no partial storage.
  - _Dependencies: 7, 63_
  - _Requirements: FR-004 AC-4; NFR-008 AC-1/AC-3; SC-9_
  - _Touches: `src/modules/projects/attachments/upload-guard.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 65\. Implement the extractor registry with MIME sniffing and timeouts
  - Build `ExtractorRegistry` keyed by sniffed MIME type, enforcing `PARSE_TIMEOUT_MS` per extraction and recording `parse_status` and `extracted_text` on the attachment.
  - Extraction runs once at upload, never per generation.
  - Acceptance Criteria:
    - An unregistered MIME type never reaches an extractor.
    - A parse timeout records `parse_status = 'failed'` with a reason and leaves the session usable.
    - Extracted text is persisted and reused across generations.
  - _Dependencies: 64_
  - _Requirements: IR-004; FR-004 AC-5; DR-8_
  - _Touches: `src/modules/adapters/parsing/registry.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 66\. Implement the PDF and DOCX extractors
  - Implement extraction with `unpdf` and `mammoth` behind the `ParsingAdapter` interface.
  - Acceptance Criteria:
    - A multi-page PDF and a DOCX both yield extracted text stored on the attachment.
    - A corrupt file of either type records a failure rather than throwing out of the adapter.
  - _Dependencies: 65_
  - _Requirements: IR-004-AC-1; FR-004 AC-3; D-14_
  - _Touches: `src/modules/adapters/parsing/pdf.ts`, `src/modules/adapters/parsing/docx.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 67\. Implement the XLSX, text, and image handlers
  - Implement `xlsx` extraction, plain-text and Markdown passthrough, and image passthrough with no extraction attempt for vision-capable models.
  - Acceptance Criteria:
    - A spreadsheet yields extracted cell text.
    - Markdown and plain text are stored verbatim.
    - An image is stored with `parse_status` reflecting passthrough and is offered to vision models.
  - _Dependencies: 65_
  - _Requirements: IR-004-AC-1/AC-2; FR-004 AC-3_
  - _Touches: `src/modules/adapters/parsing/xlsx.ts`, `src/modules/adapters/parsing/text.ts`, `src/modules/adapters/parsing/image.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 68\. Build the attachment upload and list UI
  - Allow attaching at session start and at any later point; list attachments with name, type, parse status, and the stage at which each was attached; support removal.
  - Acceptance Criteria:
    - A document attached mid-session is available to the current and all subsequent stages.
    - Removing an attachment excludes its content from subsequent generations.
    - Parse failures are visibly reported without blocking the session.
  - _Dependencies: 10, 66, 67_
  - _Requirements: FR-004 AC-1/AC-2/AC-6/AC-7_
  - _Touches: `src/modules/web/session/Attachments.tsx`, `src/app/api/sessions/[id]/attachments/route.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 69\. Implement context recording and late-attachment analysis
  - Record `context_attachment_ids` on every spec revision at generation time; implement `LateAttachmentAnalyzer` computing which approved files predate a new attachment and notify the owner by file name with a direct refine action.
  - Never modify an approved file automatically.
  - Acceptance Criteria:
    - Every revision stores the attachment set available when it was generated.
    - Attaching a document after two approvals names exactly those two files.
    - No approved file changes as a side effect of a late attachment.
  - _Dependencies: 51, 59, 68_
  - _Requirements: FR-004 AC-9..AC-11; DR-12_
  - _Touches: `src/modules/projects/attachments/late-analyzer.ts`, `src/modules/agents/spec/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 70\. Implement the research adapter with budget and fallback
  - Implement search and fetch bounded by `WEB_FETCH_MAX_BYTES` and `WEB_FETCH_TIMEOUT_MS`; on failure or timeout resolve to no result, log `RESEARCH_UNAVAILABLE`, and continue generation.
  - Emit `research` stream events so the UI can show an activity indicator distinct from ordinary generation.
  - Acceptance Criteria:
    - Research runs automatically without user configuration or request.
    - A research failure never fails the stage.
    - Content over the byte cap is truncated before reaching a model.
    - The activity indicator appears during research and clears afterwards.
  - _Dependencies: 7, 45_
  - _Requirements: FR-019; IR-003_
  - _Touches: `src/modules/adapters/research/**`, `src/modules/web/session/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 71\. Implement untrusted-content wrapping in context assembly
  - Insert attachment text and fetched web content inside clearly delimited, labelled untrusted-data blocks, never as instructions.
  - Acceptance Criteria:
    - Attachment and web content appear only inside untrusted blocks in the assembled context.
    - Gate evaluation is provably independent of this content.
  - _Dependencies: 41, 50, 69, 70_
  - _Requirements: NFR-009 AC-1; FR-004 AC-8; FR-019 AC-5_
  - _Touches: `src/modules/agents/context-assembler.ts`, `src/modules/prompts/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

## Milestone 6 — Export, Sessions & Completion (MVP cut line)

Goal: the complete parity product — the full four-file journey, resumable, exportable, completable.

- [x] 72\. Implement export mode resolution and the export record
  - Resolve a declared mode to a concrete revision set: default mode always resolves each core file to its most recent pre-enrichment revision and omits `quality.md`; quality mode resolves to enriched revisions.
  - Accept a `QualityPort`; when null, force default mode and issue no staleness query.
  - Add the `export_records` table and write one row per performed export.
  - Acceptance Criteria:
    - Default-mode export after enrichment yields the pre-enrichment revisions.
    - The archive contains no file beyond those defined for the mode.
    - With no Quality capability registered, mode is forced to default.
    - Every export writes one `ExportRecord` capturing mode, included files, and omitted files.
  - _Dependencies: 17, 22_
  - _Requirements: FR-015 AC-2/AC-3/AC-5; Solution — Data Model; Constitution A6, P3_
  - _Touches: `src/modules/specs/export/resolve-mode.ts`, `src/db/schema/specs.ts`, `migrations/`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 73\. Implement the omission manifest and export UI
  - Produce the archive even when files lack approved revisions, returning the omitted list; display the manifest and the mode used at download time, in the interface only.
  - Acceptance Criteria:
    - An incomplete bundle downloads successfully rather than being refused.
    - Omitted files are named in the interface at download.
    - The manifest is never added as a file inside the archive.
    - No empty or placeholder markdown file is emitted.
  - _Dependencies: 10, 72_
  - _Requirements: FR-015 AC-4/AC-6..AC-9_
  - _Touches: `src/modules/web/session/ExportPanel.tsx`, `src/modules/specs/export/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 74\. Implement copy-to-clipboard for a single spec file
  - Implement `GET /api/specs/:specFileId/content?mode=` returning raw markdown; copy on the client with a visual confirmation and a manual-selection fallback.
  - Acceptance Criteria:
    - Copied content is raw markdown with no UI decoration, truncation, or code fences.
    - The content matches the revision the current export mode resolves to.
    - A clipboard failure offers the raw content for manual selection.
  - _Dependencies: 72_
  - _Requirements: FR-016_
  - _Touches: `src/app/api/specs/[specFileId]/content/route.ts`, `src/modules/web/session/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 75\. Implement full session resume
  - Restore stage, substage, and the pending action on reopen; re-present a pending question set, spec approval, diff decision, or review decision exactly as it was.
  - Acceptance Criteria:
    - Reopening restores all answers, revisions, and attachments.
    - A pending decision of any of the four kinds is re-presented unchanged.
    - Already-answered questions are not re-asked and approved specs are not regenerated.
    - A reload, sign-out, or network interruption does not change persisted workflow state.
  - _Dependencies: 47, 56, 60_
  - _Requirements: FR-017; NFR-003 AC-3; SC-3_
  - _Touches: `src/modules/workflow/**`, `src/modules/web/session/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 76\. Implement project rename and cascading permanent delete
  - Rename leaves content and workflow state untouched; delete requires explicit confirmation stating permanence and cascades through every table plus blob objects.
  - Acceptance Criteria:
    - Rename changes only the name.
    - Deletion requires confirmation and the dialog states it is permanent.
    - After deletion, no row or blob object for the project remains and it is absent from listings.
  - _Dependencies: 15, 63_
  - _Requirements: FR-002 AC-3..AC-5; DR-6; DR-7; IR-005-AC-3_
  - _Touches: `src/modules/projects/**`, `src/modules/web/projects/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 77\. Implement project duplication
  - Copy spec files at their current revisions plus the workflow state, answers, information needs, and attachment references, and explicitly no pending proposed change.
  - Acceptance Criteria:
    - A duplicated mid-session project resumes into a valid state whose gates still pass.
    - Modifying the duplicate does not alter the source, and vice versa.
    - No pending proposal is carried into the duplicate.
  - _Dependencies: 75, 76_
  - _Requirements: FR-002 AC-6/AC-7_
  - _Touches: `src/modules/projects/duplicate.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 78\. Implement workflow completion and the sealed state
  - Transition to `complete` on the final accepted review; refuse entry if any required spec lacks an approved revision; reject every transition out of `complete` except `complete → quality`, with a reason.
  - Acceptance Criteria:
    - Completion is refused while a required spec is unapproved.
    - A completed session still permits conversational refinement.
    - Any transition from `complete` other than to `quality` is rejected with `SESSION_SEALED`.
  - _Dependencies: 30, 56_
  - _Requirements: FR-020 AC-1..AC-4/AC-9_
  - _Touches: `src/modules/workflow/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [x] 79\. Build the deterministic E2E fixture harness
  - Build reusable Playwright fixtures: a seeded authenticated user, a per-stage stub provider script, download capture, and helpers for answering MCQ cards and resolving decision cards.
  - Acceptance Criteria:
    - A test can drive a full stage in three helper calls or fewer.
    - The stub script is deterministic across runs and browsers.
    - The harness is reused by the skeleton test without duplication.
  - _Dependencies: 5, 18, 23_
  - _Requirements: Constitution — Testing Approaches item 3; NFR-012 AC-5_
  - _Touches: `e2e/fixtures/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 80\. Write the full critical-journey E2E test
  - Playwright: prompt → interview rounds → all four stages with approvals and reviews → ZIP download, asserting the archive contains exactly the four correctly named files.
  - Acceptance Criteria:
    - The journey completes with no dead end and no manual intervention.
    - The archive contains exactly four files with the expected names.
    - The test is deterministic in CI with no live model call.
  - _Dependencies: 23, 73, 78, 79_
  - _Requirements: SC-16; Constitution — Testing Approaches item 2_
  - _Touches: `e2e/critical-journey.spec.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

> **— MVP CUT LINE —** Everything above delivers the parity product. Ship or beta-test here before starting Milestone 7.

## Milestone 7 — Optional Quality Stage [DEFERRED by amendment А-2 → Этап 2/3; see execution.md §3-bis. Task numbers 81+ keep their identity; do not execute until the parity programme (tasks 104+) is accepted.]

Goal: the differentiator, built so that removing it leaves the parity path byte-identical.

- [ ] 81\. Implement the stage capability registry
  - Add `StageCapability` and `capabilityRegistry` to `workflow`; filter `tasks → quality` and `complete → quality` out of the legal transition set when the registry is empty.
  - Acceptance Criteria:
    - With an empty registry the transition set collapses to `tasks → complete` with no conditional branch in the parity path.
    - Requesting `tasks → quality` with no capability returns `CAPABILITY_NOT_REGISTERED`.
    - The task 30 matrix suite is extended with registered and unregistered capability cases and still reports 100% table coverage.
  - _Dependencies: 24, 30_
  - _Requirements: Constitution A6; NFR-012 AC-3; SC-8; D-3_
  - _Touches: `src/modules/workflow/capabilities.ts`, `src/modules/workflow/transition-table.ts`, `src/modules/workflow/__tests__/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [ ] 82\. Create the quality module skeleton and registration flag
  - Create the `quality` module with no tables of its own; register `QualityCapability` at boot only when `QUALITY_STAGE_ENABLED` is true.
  - Acceptance Criteria:
    - No core module imports `quality`; the lint boundary rule proves it.
    - Setting the flag false leaves the registry empty with no other code change.
  - _Dependencies: 3, 81_
  - _Requirements: Constitution A6; D-3_
  - _Touches: `src/modules/quality/**`, `src/config/env.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [ ] 83\. Define the quality.md section schema inside the quality module
  - Create `quality/quality-section-schema.ts` declaring the required headings for `quality.md` (traceability matrix, expanded acceptance criteria, risk and assumption log), reusing the Zod shape type exported by `specs` without importing the parity heading data.
  - Provide a module-local structural validator for `quality.md`.
  - Acceptance Criteria:
    - `specs/section-schema.ts` contains no `quality.md` entry and requires no edit when the Quality module is installed or removed.
    - The parity structural check never references the quality heading definition.
    - The quality validator rejects a `quality.md` missing any of its three required sections.
  - _Dependencies: 39, 82_
  - _Requirements: Constitution A6, P3; FR-014 AC-2; DR-4_
  - _Touches: `src/modules/quality/quality-section-schema.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [ ] 84\. Implement the enrichment pass
  - Rewrite the four core files as new revisions with `origin = 'enrichment'` and `derived_from` set to the parity revision each was built from; never overwrite parity revisions.
  - Acceptance Criteria:
    - Every enriched revision records its derivation source; the check constraint enforces the pairing.
    - Pre-enrichment revisions remain resolvable after the pass.
    - An enrichment failure leaves parity revisions untouched and the bundle exportable in default mode.
  - _Dependencies: 17, 82_
  - _Requirements: FR-014 AC-4; Constitution A4_
  - _Touches: `src/modules/quality/enrichment-pass.ts`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [ ] 85\. Implement the TraceabilityBuilder
  - Extract requirement, solution, and task identifiers from current revisions and build the matrix; refuse to emit any row referencing an identifier absent from the bundle.
  - Acceptance Criteria:
    - Every matrix row resolves to an identifier present in the current bundle.
    - A dangling identifier aborts the file rather than emitting the reference.
  - _Dependencies: 84_
  - _Requirements: FR-014 AC-3_
  - _Touches: `src/modules/quality/traceability-builder.ts`_
  - _Complexity: Large_
  - _Parallel-safe: yes_

- [ ] 86\. Implement the QualityAgent producing quality.md
  - Generate a file named exactly `quality.md` containing the traceability matrix, expanded EARS+ criteria covering edge and negative cases, and the risk, assumption, and open-question log.
  - Validate output with the module-local quality validator from task 83.
  - Acceptance Criteria:
    - The file name is exactly `quality.md`.
    - All three required content blocks are present.
    - Validation uses the quality module's own schema, never `specs/section-schema.ts`.
  - _Dependencies: 41, 83, 85_
  - _Requirements: FR-014 AC-1/AC-2; DR-4_
  - _Touches: `src/modules/quality/quality-agent.ts`, `src/modules/prompts/quality/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [ ] 87\. Implement staleness computation and export blocking
  - Compute staleness as the existence of a parity revision newer than an enrichment's `derived_from`; block quality-mode export with `EXPORT_STALE` and offer to re-run enrichment.
  - Reuse retained enriched artifacts when nothing has changed.
  - Acceptance Criteria:
    - Refining a core file after enrichment marks the enriched artifacts stale.
    - A quality-mode export while stale is refused with `EXPORT_STALE`.
    - Re-enabling with no newer parity revision reuses artifacts without regenerating.
    - Stale revisions remain in history but are excluded from every export path.
  - _Dependencies: 60, 72, 86_
  - _Requirements: FR-014 AC-5..AC-8; DR-9_
  - _Touches: `src/modules/quality/staleness-service.ts`, `src/modules/specs/export/**`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [ ] 88\. Implement the quality selection endpoint and gate card
  - Implement `POST /api/sessions/:id/quality-selection` and the `QualityGateCard`, defaulting to skip, rendered only at the tasks review decision and on a completed session, and hidden entirely when no capability is registered.
  - Acceptance Criteria:
    - The card never appears at session start, in project settings, or on the export screen.
    - Taking no action does not enable the stage.
    - The endpoint returns `GATE_REJECTED` when called from any other position.
  - _Dependencies: 55, 82_
  - _Requirements: FR-013 AC-1..AC-5; Constitution A2_
  - _Touches: `src/app/api/sessions/[id]/quality-selection/route.ts`, `src/modules/web/session/QualityGateCard.tsx`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 89\. Implement completion re-entry
  - Enabling Quality from `complete` transitions to `quality/collect` retaining all content; accepting the quality review returns to `complete`; disabling from `complete` changes export mode only.
  - Acceptance Criteria:
    - Re-entry retains all spec files, revisions, answers, and attachments.
    - The cycle can repeat any number of times with revision history intact.
    - Disabling from `complete` deletes no revision and leaves the session complete.
  - _Dependencies: 78, 87, 88_
  - _Requirements: FR-013 AC-6; FR-020 AC-5..AC-8/AC-10; DR-14_
  - _Touches: `src/modules/workflow/**`, `src/modules/projects/quality-selection.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

- [ ] 90\. Extend the parity check to the unregistered-module case
  - Run the full generation suite with the Quality module unregistered, asserting four-file output, no Quality content, and the required headings in order.
  - Assert that removing the module requires no edit to `specs/section-schema.ts`. Add the stale-export-blocked case to the same suite.
  - Acceptance Criteria:
    - The parity suite passes with the module absent and remains build-blocking.
    - A diff of `specs/section-schema.ts` between module-present and module-absent builds is empty.
    - A quality-mode export blocked by staleness is covered.
  - _Dependencies: 40, 83, 89_
  - _Requirements: Constitution A6, P3; SC-7_
  - _Touches: `src/modules/specs/__tests__/parity.test.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: no_

## Milestone 8 — Hardening [DEFERRED by amendment А-2 → Этап 2 (pre-beta); see execution.md §3-bis]

Goal: prove the non-functional guarantees rather than assert them.

- [ ] 91\. Integrate Sentry with payload scrubbing
  - Report unhandled exceptions and `AllProvidersFailedError` tagged with stage, substage, and run identifier; scrub credentials and avoid transmitting spec content.
  - Acceptance Criteria:
    - An exhausted-failover generation produces exactly one Sentry event.
    - No event payload contains key material or full spec content.
    - The application continues operating when the monitoring service is unavailable.
  - _Dependencies: 49_
  - _Requirements: NFR-010; IR-006; SC-11_
  - _Touches: `src/modules/adapters/monitoring/**`, `sentry.*.config.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 92\. Implement structured logging for transitions and decisions
  - Log every transition attempt with session id, from, to, allowed, and reason code; log `ROUND_LIMIT_REACHED` separately and record decision resolution path as deterministic, model, or abstain.
  - Acceptance Criteria:
    - Every rejected transition produces a log line naming the unmet gate.
    - Decision-path distribution is queryable from logs.
  - _Dependencies: 29, 62_
  - _Requirements: Solution — Observability; Constitution — success measurement_
  - _Touches: `src/modules/workflow/**`, `src/modules/agents/decision-intent/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 93\. Implement the sanitising markdown renderer
  - Render all model-derived markdown with raw HTML disabled and script content stripped.
  - Acceptance Criteria:
    - Markdown containing a script tag renders inert.
    - Raw HTML in generated content is not executed.
  - _Dependencies: 21_
  - _Requirements: NFR-009 AC-3; SC-10_
  - _Touches: `src/modules/web/markdown/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 94\. Build the prompt-injection test corpus
  - Assemble attachment and web-content payloads attempting to alter stage order, ownership, or trigger an export; assert gate outcomes are byte-identical with and without the payload.
  - Acceptance Criteria:
    - No payload changes any gate outcome.
    - No payload causes an export or a stage advance.
  - _Dependencies: 71, 93_
  - _Requirements: NFR-009 AC-1/AC-2; SC-10_
  - _Touches: `src/modules/agents/__tests__/injection.test.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 95\. Write the tenant isolation and secret exposure test suite
  - Assert every project-scoped endpoint returns `NOT_FOUND` for a foreign resource, including stream resume; add a build-time check that no provider credential appears in a client bundle.
  - Acceptance Criteria:
    - Every project-scoped endpoint has a negative-path test returning 404, never 403.
    - The build fails if a secret string appears in client output.
  - _Dependencies: 47, 76_
  - _Requirements: NFR-005; NFR-006; SC-5; SC-6_
  - _Touches: `src/modules/projects/__tests__/isolation.test.ts`, CI scripts_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 96\. Instrument and verify the first-token latency target
  - Compute p95 of `first_token_at - created_at` over successful runs; expose it as an operational query and verify against the 3-second target.
  - Acceptance Criteria:
    - The p95 query returns a value computed only from successful runs.
    - A progress state is shown whenever the first token has not arrived within 3 seconds.
  - _Dependencies: 44, 91_
  - _Requirements: NFR-001; SC-1_
  - _Touches: `src/modules/adapters/llm/**`, operational queries_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 97\. Audit loading and progress states
  - Ensure every asynchronous surface shows progress, streaming output, or a skeleton within 500 ms and that the interface stays interactive during generation.
  - Acceptance Criteria:
    - Playwright asserts a visible progress affordance within 500 ms for every async action.
    - No state exists where work is pending with no progress indication.
  - _Dependencies: 46, 73_
  - _Requirements: NFR-002; SC-2_
  - _Touches: `src/modules/web/**`, `e2e/responsiveness.spec.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 98\. Run and fix the cross-browser matrix
  - Execute streaming, ZIP download, and clipboard copy across Chromium, Firefox, and WebKit using the task 79 harness; fix divergences.
  - Acceptance Criteria:
    - All three operations pass on all three browser projects in CI.
  - _Dependencies: 74, 79, 80_
  - _Requirements: NFR-011; SC-12_
  - _Touches: `e2e/**`, `playwright.config.ts`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

## Milestone 9 — Documentation & Release [DEFERRED by amendment А-2 → Этап 2/3 (final release); see execution.md §3-bis]

- [ ] 99\. Write the README and local setup guide
  - Document prerequisites, environment variables, database setup, and how to run the app and each test suite.
  - Acceptance Criteria:
    - A new developer reaches a running local application following only the README.
  - _Dependencies: 9_
  - _Requirements: Constitution — Deployment & Operations_
  - _Touches: `README.md`_
  - _Complexity: Small_
  - _Parallel-safe: yes_

- [ ] 100\. Write architecture and module boundary documentation
  - Document the module map, the allowed-edge table, the state machine, and the Quality removal seam, linking to the spec bundle rather than duplicating it.
  - Acceptance Criteria:
    - The allowed-edge documentation matches the lint configuration exactly.
    - No required-heading list is duplicated into documentation.
  - _Dependencies: 90_
  - _Requirements: Constitution A1, A6, P3_
  - _Touches: `docs/architecture.md`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 101\. Write the operations runbook
  - Cover environment variables, migration procedure, provider chain reconfiguration, failover behaviour, monitoring, and incident triage for exhausted-failover failures.
  - Acceptance Criteria:
    - Reordering the provider chain is documented as a configuration-only change.
    - The runbook covers the migration rollback path.
  - _Dependencies: 91, 96_
  - _Requirements: IR-X2; NFR-004; NFR-010_
  - _Touches: `docs/operations.md`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 102\. Produce the parity checklist against the reference bundle
  - Build the hand-scored checklist comparing generated output structure and usability with the reference product, and record the first scoring run.
  - Acceptance Criteria:
    - The checklist enumerates every required section per file type.
    - A completed scoring run is recorded with results.
  - _Dependencies: 80, 90_
  - _Requirements: Success criterion 2; SC-17_
  - _Touches: `docs/parity-checklist.md`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 103\. Execute the production release checklist and first deploy
  - Verify all suites green, secrets configured, migrations applied, monitoring receiving events, and OAuth callbacks correct for the production domain; deploy and smoke-test the critical journey in production.
  - Acceptance Criteria:
    - The critical journey completes in production against a real provider.
    - Monitoring receives a test error event.
    - Both OAuth providers sign in successfully on the production domain.
  - _Dependencies: 98, 99, 101_
  - _Requirements: SC-16; Solution — Deployment & Operations_
  - _Touches: deployment configuration, `docs/release-checklist.md`_
  - _Complexity: Medium_
  - _Parallel-safe: no_


## Parity Programme (amendment А-2, accepted 2026-08-14) — Milestones M7п–M10п

Source of truth for acceptance: `.specs/research/myspec-parity-reference.md` («Эталон»; Часть 1 = observed behaviour of app.myspec.dev, Часть 5–6 = official docs and lineage). These milestones replace the deferred blocks above as the active tail of the plan. Existing FR identifiers keep governing the foundation; parity features trace to Эталон sections and to amendments А-2/А-3. Tasks 116–129 are intentionally one notch coarser; the Architect refines each block at the preceding gate. Gate rule А-2.1 (executor self-run with artifacts) applies to every milestone below.

### Milestone 7п — Chat-first core (А-2 · M7)

Goal: the whole session lives in one conversation feed — messages, question-round forms, stage chips, document cards — on top of the existing state machine, streaming, and liveness contracts (Д-1, Р-2, Р-3 untouched).

- [x] 104\. Build the conversation feed read model
  - Derive the feed as a pure projection of persisted state (seed prompt, question rounds with answers, stage transitions, generation runs, revisions, review boards, chat messages), ordered chronologically; each block carries a stable id, role, stage, substage, and kind.
  - No new write path: the feed is reconstructed deterministically on load; free chat keeps its existing store.
  - Acceptance Criteria:
    - The projection is a pure function of persisted entities: same state → identical feed (fixture/property tests).
    - Every state the M6 gate visits (pending round, in-flight generation, pending approval, undecided review, sealed session) maps to a well-defined feed tail.
    - Block ids are stable across reloads.
    - Unit fixtures cover all block kinds.
  - _Dependencies: 75_
  - _Requirements: Эталон §1.1–1.2; А-2_
  - _Touches: `src/modules/web/feed/**` (new), reads `src/modules/workflow/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 105\. Rebuild the session page chat-first
  - Single feed rendering the projection; sticky header with numbered step pills derived from the transition graph; bottom composer (text + send, wired to the existing chat); seed rendered as the user bubble «I want to build {name}. My project description is: {prompt}».
  - Every session-moving action goes through the `session-request` framework; stop-waiting / stop-generation render inside the owning feed block.
  - Acceptance Criteria:
    - The full M6 journey runs inside the feed with the liveness invariant holding at every position and in flight (liveness.spec extended to feed selectors, green).
    - Step pills highlight the current stage and come from the graph, not a hard-coded list in the component.
    - Reload at any point reproduces the identical feed (task 75 resume AC re-verified on the feed).
    - All existing e2e suites updated to the feed and green on CI.
  - _Dependencies: 104_
  - _Requirements: Эталон §1.1; FR-017; Р-3 contracts_
  - _Touches: `src/app/(app)/projects/[id]/**`, `src/modules/web/session/**`, `e2e/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 106\. In-feed question rounds v2 + audience profile (У-5)
  - Round header «Round N — K questions»; per question: required marker, «Select one» / «Select all that apply», options with label, one-line description, optional `(Recommended)` flag, and an Other free-text option; Submit Answers; after submit the form stays in the feed, disabled, answers fixed.
  - Extend the round draft schema (v3): the model supplies option descriptions and at most one recommended flag per question; Р-1 parsing and single retry unchanged; v2 drafts still render (missing description → plain option).
  - У-5: audience profile (`technical` | `non-technical`) chosen at project creation with a default, stored on the session; question prompts branch on it (non-technical keeps interview.questions.v2 jargon rules).
  - Acceptance Criteria:
    - v3 drafts validate; a v2 fixture still renders and submits.
    - `(Recommended)` renders only when the model marked it; select-all accepts multiple; Other submits free text.
    - A submitted round survives reload as a disabled block with the chosen answers visible.
    - The profile provably changes the prompt text (unit assertion) and is asked exactly once.
  - _Dependencies: 104, 105_
  - _Requirements: Эталон §1.1 (анкеты), §1.2; А-3 У-5_
  - _Touches: `src/modules/agents/interview/**`, `src/modules/web/feed/**`, `src/modules/web/session/mcq-card.tsx`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 107\. Stage chips and document cards in the feed
  - Transition chip (`{Stage} · {from} → {Stage} · {to}`, animated dashes) at every position change; document card: stage name, mono path `specs/{bundle}/{file}.md`, Approved badge, `Rev N`, preview toggle over the existing content endpoint.
  - Generation streams into the feed card via the existing resumable stream; reattach (D-99) and the single-run invariant (D-100/D-101) hold unchanged inside the feed.
  - Acceptance Criteria:
    - A generation started, abandoned mid-flight, and revisited renders in the same card with Stop offered, not Generate (resume.spec adapted to the feed).
    - `Rev N` equals the file's revision count; Approved appears only after approval.
    - Chips appear exactly at state-machine position changes (projection ordering test).
  - _Dependencies: 104, 105_
  - _Requirements: Эталон §1.1 (чипы, карточки); M3 resume rule_
  - _Touches: `src/modules/web/feed/**`, `src/modules/web/session/spec-card.tsx`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 108\. Content language follows the seed (У-1)
  - Detect the seed prompt's language once at session creation (deterministic heuristic, model fallback), persist it on the session, and instruct every agent call — rounds, summaries, documents, reviews, chat replies — to answer in it, from one shared prompt-assembly point. UI chrome stays English.
  - Acceptance Criteria:
    - Russian seed → Russian questions, summaries, documents, and review texts; English seed → English (fixtures both ways).
    - The language is persisted once; no per-call re-detection.
    - A unit guard proves the instruction flows from the single assembly point, not per-prompt copies.
  - _Dependencies: 106_
  - _Requirements: А-3 У-1; Эталон §5.3_
  - _Touches: `src/modules/agents/**` (prompt assembly), `src/db/schema/**` (one column)_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 109\. Free chat woven into every stage
  - The composer is always live; free-form messages are answered in-feed as ordinary blocks stamped with the current stage/substage; decision phrases keep resolving through DecisionIntentResolver with button-equivalent effects (M4 contract).
  - Acceptance Criteria:
    - A question asked mid-review is answered without changing workflow state (DB position identical before/after — test).
    - A decision phrase typed in chat produces the same DB state as the button (M4 e2e extended to the feed).
    - Chat replies stream and obey the liveness invariant while in flight.
  - _Dependencies: 105_
  - _Requirements: Эталон §1.2 (свободный чат); FR of M4 decisions_
  - _Touches: `src/modules/web/feed/**`, `src/modules/agents/decision-intent/**` (read-only)_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [x] 110\. M7п gate — feed-first walk (self-run, А-2.1)
  - Extend the live gate script to the feed surface; artifacts to `artifacts/gate-M7/` (screenshot per feed state, RESULT.md, TRANSCRIPT.md, light trace); liveness counted on every snapshot.
  - Acceptance Criteria:
    - Full prompt → ZIP walked in the feed on the `google,ollama` chain; verdict GREEN, or defects fixed and the walk repeated.
    - All M6 resume checks pass on the feed surface.
    - Zero available session-moving controls on any snapshot = red run.
  - _Dependencies: 104–109_
  - _Requirements: А-2.1_
  - _Touches: `e2e/gate-M7.live.ts`, `artifacts/gate-M7/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

### Milestone 8п — Review cycle (А-2 · M8)

Goal: the reviewer that makes the product feel intelligent — structured findings, checkbox selection, targeted revision loop — plus the deterministic linters (У-3) the original lacks.

- [x] 111\. Structured review output (review.v2)
  - Review agent returns `{verdict: needs_revision | pass, summary, mustFix[], recommendations[]}`; each item `{sectionPath, title, body, suggestion, confidence 1..10}`. Р-1 outer-JSON parse + one retry; boards persist with full history (never applied automatically).
  - Acceptance Criteria: schema validated with fixtures; malformed output → one retry then visible error; boards survive reload; existing accept/ignore/request-changes decisions still resolve.
  - _Dependencies: 107_ · _Requirements: Эталон §1.3_ · _Touches: `src/modules/agents/review/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 112\. Review card parity UI
  - Verdict badge (Needs Revision / Pass), summary, collapsible Must Fix (checked by default) and Recommendations (unchecked), confidence badge with tooltip, italic Suggestion; buttons Accept feedback / Request changes / Ignore; checkbox state travels with the decision and is fixed in history once decided.
  - Acceptance Criteria: defaults per group; the three buttons behave per Эталон §1.3; a decided board renders its final checkbox state after reload.
  - _Dependencies: 111_ · _Requirements: Эталон §1.3_ · _Touches: `src/modules/web/feed/**`, `review-board.tsx`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 113\. Targeted revision cycle
  - Request changes with selected items → an in-feed message stating what was folded in and which open calls the writer made → Rev N+1 → a re-review that verifies the selected items and may add findings caused by the revision → loop until Pass + acceptance. Transition table extended for the loop; the M2 rule (100% of edges tested) holds.
  - Acceptance Criteria: the re-review prompt provably receives the selected items; unselected items are not re-litigated (fixture); each cycle appends, never overwrites; the loop is bounded with honest copy on exhaustion (gate-copy pattern).
  - _Dependencies: 111, 112_ · _Requirements: Эталон §1.3_ · _Touches: `src/modules/workflow/transition-table.ts`, `src/modules/agents/review/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 114\. Deterministic spec linters (У-3)
  - Pre-review linter pass on each drafted revision: cross-reference resolution (FR/NFR/DR/IR mentions exist), identifier stability vs the previous revision (no renumbering), EARS conformance for requirement lines, requirement→task traceability for tasks documents. Findings merge into the board as machine items (source `linter`, confidence 10) under Must Fix.
  - Acceptance Criteria: seeded broken cross-reference, renumbered identifier, and non-EARS requirement are each caught; a clean document yields zero linter items; linter items cost no model call.
  - _Dependencies: 111_ · _Requirements: А-3 У-3; Эталон §6_ · _Touches: `src/modules/specs/lint/**` (new)_ · _Complexity: Large_ · _Parallel-safe: yes_

- [x] 115\. M8п gate — review-cycle walk (self-run, А-2.1)
  - Live cycle: needs-revision board → request changes with a subset selected → Rev N+1 → re-review → pass → accept; text-phrase decision parity checked live; artifacts to `artifacts/gate-M8/`.
  - _Dependencies: 111–114_ · _Requirements: А-2.1_ · _Complexity: Medium_ · _Parallel-safe: no_

### Milestone 9п — Methodologies & IA (А-2 · M9) — refined at the M8п gate (Architect, 2026-08-15)

Goal: methodologies become data, the surface becomes the product's information architecture — sidebar, project page, composer, viewer. Templates for foreign methodologies are vendored from their open-source homes, not reverse-engineered. Likely two sessions; the natural seam is after task 119 — if context runs low there, stop with a report and continue in a fresh session (still one milestone).

- [x] 116\. Methodology configurations: stage graphs as data
  - Define `MethodologyConfig`: id, display name + badge parts («MySpec · Greenfield · V1»), chat class (`generate` | `edit`), ordered stage graph (positions, edges, gate references, round/revision budgets), per-stage document file set, per-stage prompt template references, optional stages.
  - The transition table consumes a config; the existing hard-coded graph becomes `myspec-greenfield-v1` and must reproduce today's behaviour exactly. Ship five configs per Эталон §1.4: `myspec-greenfield-v1`, `myspec-brownfield-v1`, `speckit-greenfield-v1`, `openspec-brownfield-v1`, `myspec-edit-v1`.
  - Vendor stage templates and prompt scaffolds from `github/spec-kit` and `Fission-AI/OpenSpec` under `src/modules/methodologies/templates/**` with their LICENSE files; template text reaches models only through the single prompt-assembly point (У-1 applies to every methodology).
  - Structural validation of configs: terminal position reachable from start, no unreachable stages, backward edges only within a stage, budgets positive; a malformed config is a build-time error, not a runtime surprise.
  - Acceptance Criteria:
    - The default config reproduces the current 33-edge matrix byte-for-byte (snapshot assertion against the existing table export).
    - Config validation rejects each seeded malformation (unreachable stage, missing terminal, cross-stage backward edge) with a named error.
    - All five configs pass validation; their stage lists match Эталон §1.4 exactly.
    - LICENSE files for vendored material are present and referenced from a NOTICE section in the repo README.
  - _Dependencies: 115_
  - _Requirements: Эталон §1.4, §5.2; А-2_
  - _Touches: `src/modules/methodologies/**` (new), `src/modules/workflow/transition-table.ts` (consume config)_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [ ] 117\. Methodology selection and config-driven surface
  - New Generate chat offers the methodology picker (badge, step-list preview) with **Auto** as default: a cheap single-shot classification of the seed description over the existing adapter chain; on any failure or ambiguity it falls back to `myspec-greenfield-v1` silently.
  - Session stores the methodology id; step pills, stage prompts, round budgets, document cards, and the ZIP file set all derive from the config. The methodology badge renders in the session header.
  - Export: the default methodology keeps the M6 contract — exactly 4 files with exact names; other methodologies export their config's file set; the omission manifest logic is config-driven.
  - Acceptance Criteria:
    - Each of the four generate configs walks seed → Complete on stub e2e with its own pills and produces its own file set in the ZIP.
    - Auto returns a valid config id for three seeded descriptions (greenfield idea, change to existing system, ambiguous) and falls back safely on adapter failure.
    - The default methodology's export is byte-contract-identical to M6 (existing export e2e untouched and green).
    - The badge renders from config parts, not hard-coded strings.
  - _Dependencies: 116_
  - _Requirements: Эталон §1.4; FR-015 (export contract preserved)_
  - _Touches: `src/modules/web/projects/**`, `src/modules/specs/export/**`, `src/modules/web/feed/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [ ] 118\. Edit workflow (Reference → Describe → Review)
  - Edit chat class over `myspec-edit-v1`: Reference (pick bundle files from a completed session), Describe (prefilled «I want to update spec {bundle} to …»), Review (the model proposes cross-file edits rendered as diff cards; approve applies all touched files atomically in one transaction as new revisions; request-changes loops through the M8п cycle machinery).
  - Reuses M4 proposed-changes/diff plumbing and M8п review loop; no new decision endpoints.
  - Acceptance Criteria:
    - An edit session on a completed bundle produces new revisions only on approve; reject leaves every file byte-identical (M4 contract re-asserted here).
    - A multi-file edit applies atomically: either every touched file gains a revision or none does (induced mid-transaction failure test).
    - Three-step pills render from the edit config; the prefill matches the Эталон wording.
    - Revision history on each touched file shows the edit session as its source.
  - _Dependencies: 116, 117_
  - _Requirements: Эталон §1.4 (Edit), §5.1 (Vibe Specify'ing); FR-013/FR-014 contracts_
  - _Touches: `src/modules/web/feed/**`, `src/modules/specs/**`, edit config_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [ ] 119\. Sidebar: Specs / Local Workspace / Attachments
  - Resizable sidebar on the session page: Specs (bundle files with status badges, click opens the viewer of task 122 once it exists — until then the existing preview), Attachments (names + sizes from the M5 store), Local Workspace as an honest stub: «Mount folder» control that plainly says the capability is coming and does nothing else.
  - Acceptance Criteria:
    - Sidebar width persists across reloads (client-side); collapse/expand works.
    - Specs section reflects live revision state (new revision → updated badge without full reload).
    - Attachment rows show human-readable sizes; clicking downloads/opens as today.
    - The stub performs no network call and its copy makes no false promise.
  - _Dependencies: 110_
  - _Requirements: Эталон §1.5 (сайдбар)_
  - _Touches: `src/modules/web/session/**` (layout), `src/modules/web/feed/**`_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 120\. Project page: chats, filters, MCP placeholder
  - Generate | Edit tabs listing that project's chats; search by name; Active / Archived / All filters (archive = new boolean on sessions with archive/restore actions; archived sessions excluded from Active everywhere); rows carry methodology badge, bundle badge, completion status, and «Last message Nd ago» derived from the feed's newest block.
  - MCP Servers placeholder card: per-project vs User Profile split, «0 servers», Add server disabled with honest copy (per А-2 Backlog: real MCP runtime is out of scope).
  - Acceptance Criteria:
    - Filters and search compose (searching within Archived works); archiving is reversible and never deletes.
    - Row badges come from the session's config; the age label derives from persisted rows, not client clocks.
    - The placeholder card performs no network call.
    - e2e covers tab switch, search, archive → restore.
  - _Dependencies: 117_
  - _Requirements: Эталон §1.5 (проектная страница)_
  - _Touches: `src/modules/web/projects/**`, `src/modules/projects/**`, one migration (archive flag)_
  - _Complexity: Large_
  - _Parallel-safe: yes_

- [ ] 121\. Composer upgrades: @-references, slash commands, model picker
  - @-references: typing `@` offers bundle files and attachments; a chosen reference travels with the message and the handler injects that file's current content into the agent context (existing context-assembly path; no new write path).
  - Slash commands: `/` opens a menu whose entries map 1:1 onto existing actions (ask round, proceed, approve, request changes, export…) and dispatch to the same endpoints as the buttons — a command the current position's gate refuses shows the gate-copy reason.
  - Per-chat model picker: registry derived from configured providers (Auto + each available model; models whose keys are absent are hidden); selection persists on the session; every agent call for that session honours it; Auto = the failover chain exactly as today.
  - Acceptance Criteria:
    - Picking a concrete model provably changes the adapter invocation (route-level unit with a spy), and Auto restores chain behaviour.
    - An @-referenced file's content reaches the prompt (assembly-point test), and a dangling reference (file deleted) degrades with a visible notice, not a silent drop.
    - Slash dispatches are byte-equivalent to button dispatches at the DB level (same-state test, M4 pattern).
    - Composer remains fully keyboard-operable; the picker renders in the composer as in Эталон §1.5.
  - _Dependencies: 110_
  - _Requirements: Эталон §1.5 (композер); А-3 (Auto = failover)_
  - _Touches: `src/modules/web/session/**` (composer), `src/modules/adapters/llm/**` (per-session model override), session column_
  - _Complexity: Large_
  - _Parallel-safe: yes_

- [ ] 122\. Document viewer: Outline / Preview / Raw / Diff
  - Viewer over a spec file's revisions, opened from the sidebar or a document card: Outline (heading tree parsed from markdown; clicking scrolls Preview to the section), Preview (rendered markdown), Raw (exact bytes), Diff (against the previous revision, reusing the M4 diff renderer; green added / red removed).
  - Read-only; revision switcher lists all revisions with their review verdicts.
  - Acceptance Criteria:
    - All four views work on a file with ≥2 revisions; Diff of Rev 1 states there is no predecessor rather than erroring.
    - Outline navigation lands on the right section for duplicated heading names (anchor disambiguation).
    - Raw is byte-identical to the stored revision (copy path reuses the task 74 endpoint).
    - Viewer state (view, revision) survives a reload via URL params.
  - _Dependencies: 119_
  - _Requirements: Эталон §5.1 (Outline/Preview/Raw/Diff)_
  - _Touches: `src/modules/web/viewer/**` (new)_
  - _Complexity: Medium_
  - _Parallel-safe: yes_

- [ ] 123\. M9п gate — methodologies walked live (self-run, А-2.1)
  - Live set, bounded deliberately (default config is already covered by the M7п gate): one **full** live journey on `speckit-greenfield-v1` (the longest foreign graph) and one on `myspec-brownfield-v1` (the shortest); one live **Edit** session over the bundle the SpecKit walk produced; a live model-picker check (explicitly select the local model; verify the call and the badge). All five configs green on stub e2e.
  - Closes the M8п open question: the RESULT records, for every requirements/tasks board the walks produce, that linters ran and how many machine items each board carried (zero is a valid count on a clean document — the record is the evidence).
  - Artifacts to `artifacts/gate-M9/` (RESULT.md with per-state controls, TRANSCRIPT.md, screens, light trace).
  - Acceptance Criteria:
    - Both live journeys and the live Edit session end GREEN, or defects are fixed and the affected walk repeated.
    - Liveness invariant on every snapshot; zero available session-moving controls = red.
    - Linter run counts recorded per board; at least one board is a requirements or tasks document.
    - The M6 resume checks hold on at least one non-default methodology.
  - _Dependencies: 116–122_
  - _Requirements: А-2.1_
  - _Touches: `e2e/gate-M9.live.ts`, `artifacts/gate-M9/**`_
  - _Complexity: Large_
  - _Parallel-safe: no_

### Milestone 10п — Visual layer & finish (А-2 · M10) — to be refined at the M9п gate

- [ ] 124\. Design tokens and typography per Эталон §1.5 with our own palette and brand (dark/light theme, persisted).
- [ ] 125\. Brand loader, connection-lost modal, toasts.
- [ ] 126\. Completion panel (Session completed · bundle · Edit/Download) + «Build with your favourite tool» + Generate AI Prompt (references the approved documents; instructs preservation of architecture and conventions).
- [ ] 127\. Diff preview polish in the Edit flow (green/red lines, sidebar access).
- [ ] 128\. Parity checklist walk: every item of Эталон Часть 1 screenshotted ours-vs-theirs, gaps listed; one ultracode red-team pass over the checklist (mode map §3-bis).
- [ ] 129\. M10п gate — final parity verdict by the Architect over the checklist artifacts; release tag.


## Requirement Coverage

Every functional requirement maps to at least one task.

| Requirement | Tasks |
|---|---|
| FR-001 Authentication | 12, 14 |
| FR-002 Project lifecycle | 15, 76, 77 |
| FR-003 Session start from prompt | 15 |
| FR-004 Document attachments | 63, 64, 65, 66, 67, 68, 69, 71 |
| FR-005 Structured interview | 27, 32, 33, 34, 35, 36, 37 |
| FR-006 Interview exit gate | 26, 38 |
| FR-007 Staged workflow progression | 19, 24, 26, 29, 30 |
| FR-008 Spec generation with streaming | 20, 45, 46, 49, 50, 51 |
| FR-009 Per-file approval | 21, 61, 62 |
| FR-010 Automated review board | 53, 54, 55, 56, 57 |
| FR-011 Conversational refinement with diff approval | 59, 60 |
| FR-012 Spec revision persistence | 16, 17, 60 |
| FR-013 Optional Quality stage | 82, 88, 89 |
| FR-014 Quality generation and staleness | 83, 84, 85, 86, 87 |
| FR-015 Bundle export as ZIP | 22, 72, 73 |
| FR-016 Copy to clipboard | 74 |
| FR-017 Session resume | 47, 75 |
| FR-018 Failure handling and retry | 43, 48, 49 |
| FR-019 Live web research | 70, 71 |
| FR-020 Completion and re-entry | 78, 89 |
| NFR-001 First token latency | 44, 96 |
| NFR-002 Perceived responsiveness | 46, 97 |
| NFR-003 Durability of user work | 35, 44, 47, 75 |
| NFR-004 Availability through failover | 43, 52 |
| NFR-005 Tenant isolation | 13, 14, 20, 47, 95 |
| NFR-006 Secret confidentiality | 7, 43, 95 |
| NFR-007 Structural conformance | 39, 40, 90 |
| NFR-008 Upload limits and isolation | 63, 64 |
| NFR-009 Untrusted content handling | 32, 71, 93, 94 |
| NFR-010 Failure observability | 91, 92 |
| NFR-011 Browser support | 5, 98 |
| NFR-012 Workflow verifiability | 26, 27, 30, 52, 79, 81 |
| IR-001 LLM providers | 18, 42, 43, 52 |
| IR-002 OAuth providers | 12 |
| IR-003 Web search and fetch | 70 |
| IR-004 Document parsing | 65, 66, 67 |
| IR-005 Object storage | 63, 76 |
| IR-006 Error monitoring | 91 |
| Constitution A1 boundaries | 3, 8, 100 |
| Constitution A6 Quality isolation | 81, 82, 83, 90 |
| Constitution P3 parity | 39, 40, 72, 90, 102 |

## Risks & Sequencing Notes

- **Task 16 is a hard prerequisite for everything downstream.** The immutability trigger and column freeze define the contract every later revision task depends on; retrofitting it after revisions exist requires a data migration. Do not defer it.
- **Task 20 is deliberately thin.** It exists so the walking skeleton is executable end to end before the streaming machinery lands. Tasks 43–45 extend the same route rather than replacing it, and task 45 re-runs the skeleton test to prove the extension is backwards compatible.
- **Task 30 is the highest-leverage test in the plan.** With the transition matrix exhaustively covered, later milestones can change gates confidently. Treat a failure here as a design defect, not a test defect. Task 81 extends this same suite rather than forking it.
- **Streaming and resume (45–48) are the riskiest cluster.** They combine platform function limits, provider behaviour, and client reconnection. Build them against the stub provider first; only then introduce real providers.
- **The section schema has exactly one consumption chain.** `assemblePrompt` and `validateStructure` are its only importers; every other structural check goes through `validateStructure`. If a task needs the raw heading list, that is a signal the chain is being broken.
- **Milestone 7 must not touch the parity path.** If implementing Quality requires editing `workflow`, `specs`, or `specs/section-schema.ts` beyond the declared interfaces, the isolation seam is wrong — revisit tasks 81 and 83 rather than adding a conditional. Task 90 makes this mechanically checkable.
- **Function duration is an unresolved ceiling.** Monitor `completed_at - created_at` from the first real generation onward; if p95 approaches the platform limit, per-section chunked generation is the planned mitigation, not a job queue.
- **Parallelisation guidance.** Tasks 4–10, 54–55, 66–67, 91–98, and 99–102 are the widest parallel bands. Foundation tasks 1–3, 11, 16, 24–30, and 39–40 are serial by nature and should not be split across executors.
