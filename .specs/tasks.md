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

- [x] 117\. Methodology selection and config-driven surface
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

- [x] 118\. Edit workflow (Reference → Describe → Review)
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

- [x] 119\. Sidebar: Specs / Local Workspace / Attachments
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

- [x] 120\. Project page: chats, filters, MCP placeholder
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

- [x] 121\. Composer upgrades: @-references, slash commands, model picker
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

- [x] 122\. Document viewer: Outline / Preview / Raw / Diff
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

- [x] 130\. Provider-aware context packing (амендмент А-8; вне исходной декомпозиции, добавлена Архитектором 2026-08-16)
  - Every LLM provider declares its effective prompt capacity (tokens) and generation reserve; the Ollama adapter passes an explicit `num_predict`, and its capacity derives from `OLLAMA_CONTEXT_LENGTH` minus that reserve with a safety margin. Cloud providers keep the full default budget.
  - `ContextAssembler` packs to the TARGET provider's capacity by priority: (1) system instruction + section schema/template — inviolable, always byte-intact; (2) stage-critical state (answered rounds, relevant approved excerpts); (3) attachments/references; (4) web research — shrunk or dropped first. Deterministic packing; a packing record (what was included/dropped, estimated sizes) is logged for gate observability.
  - A prompt exceeding the declared capacity is an assembler error, never handed to the provider: provider-side truncation is a defect by definition (D-146).
  - Acceptance Criteria:
    - A fixture whose full-budget context exceeds local capacity packs with research dropped first and the instruction+template block byte-identical to the unpacked form; the cloud path for the same state produces the same prompt as before А-8 (snapshot).
    - The Ollama call provably carries `num_predict`; the assembler never exceeds declared capacity (property test over fixtures).
    - The run-2 failure state (the 114 389-char context that reproduced `missing section`) now yields a structurally conformant document on the local model in a D-91-style pre-flight.
    - The live gate asserts **zero** `truncating input prompt` records in the server/Ollama log for the whole walk.
  - _Dependencies: 116_
  - _Requirements: А-8; А-7 (основной режим — локальный); D-146_
  - _Touches: `src/modules/adapters/llm/**`, `src/modules/agents/**` (ContextAssembler), `e2e/gate-M9.live.ts` (truncation assert)_
  - _Complexity: Large_
  - _Parallel-safe: no_

- [x] 123\. M9п gate — methodologies walked live (self-run, А-2.1)
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

### Milestone 10п — Visual layer & finish (А-2 · M10) — refined at the M9п gate (Architect, 2026-08-16)

Goal: the visual layer with our own tint, the completion surface, structured local output (D-161 ruling), and the final parity verdict. Gate profile per decisions.md (2026-08-16): fresh Google key fronts the chain; the local fallback for this gate is measured at pre-flight — `qwen3:8b` first, `qwen3:14b` if it fails structure/JSON.

- [x] 124\. Design tokens and theme with our own tint
  - Token system per Эталон §1.5 structure (CSS variables for color/surface/foreground, typography scale) with **our own palette and brand** — not their colors; dark/light theme, persisted client-side, SSR-safe (no hydration flash).
  - Every surface consumes tokens; raw color literals outside the single brand file are a lint error.
  - Acceptance Criteria: theme toggle persists across reloads; a grep/lint gate proves zero hard-coded colors outside the brand file; text contrast meets WCAG AA in both themes (checked for token pairs, not by eye); existing e2e suites green on both themes (one smoke pass per theme).
  - _Dependencies: 110_ · _Requirements: Эталон §1.5; А-2 («свой оттенок»)_ · _Touches: `src/app/globals.css`, `src/modules/web/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 125. Brand loader, connection-lost surface, toasts
  - Animated brand loader (our own SVG) for initial session load; a connection-lost surface that appears when the stream/page loses the server and offers reconnect — wired to the existing resume machinery, not a parallel path; toasts for archive/restore/copy/export actions.
  - Acceptance Criteria: killing the dev server mid-session raises the surface, restarting it reconnects and the feed resumes (existing resume tests reused); loader never traps the page (liveness invariant applies); toasts are announced accessibly (aria-live).
  - _Dependencies: 124_ · _Requirements: Эталон §1.5_ · _Touches: `src/modules/web/**`_ · _Complexity: Medium_ · _Parallel-safe: yes_

- [x] 126. Completion panel and «Build with your favourite tool»
  - Session completed panel at terminal: bundle name, file count, Edit and Download actions. Below it — «Build with your favourite tool»: **Generate AI Prompt** produces a prompt that references the approved revisions and instructs the coding agent to follow the bundle (per Эталон §5.1 handoff pattern); platform buttons (Lovable/Bolt/Replit) copy that prompt and open the platform — no fake deeplinks: what we cannot integrate honestly is a copy-and-open, stated as such in the UI.
  - Acceptance Criteria: panel renders only at Complete; the generated prompt names the actual approved revisions of THIS bundle and its methodology's file names; Download from the panel equals the export contract byte-for-byte; copy-and-open behaviour is honest (no claim of direct import).
  - _Dependencies: 124_ · _Requirements: Эталон §1.1 (финал ленты), §5.1_ · _Touches: `src/modules/web/feed/**`, `src/modules/specs/export/**`_ · _Complexity: Large_ · _Parallel-safe: yes_

- [x] 127. Edit-flow diff preview polish
  - Green/red line diff rendering in Edit review cards (M4 renderer restyled by tokens); sidebar access to the last edit's diffs; text command «go back to previous step» creates a NEW revision restoring the prior content — immutability of revisions preserved, revert is an append, never a rewrite.
  - Acceptance Criteria: diff colors come from tokens (both themes); revert produces Rev N+1 byte-equal to Rev N-1 with the edit chat as source; history shows all three revisions.
  - _Dependencies: 124_ · _Requirements: Эталон §5.1 (Diff Preview, «Go back»)_ · _Touches: `src/modules/web/**`, `src/modules/specs/**`_ · _Complexity: Medium_ · _Parallel-safe: yes_

- [x] 131\. Structured local output — grammar-constrained JSON (вердикт Архитектора по D-161)
  - The local adapter requests grammar/schema-constrained output (Ollama `format` with the JSON schema) for structured calls — Edit proposal, review.v2, interview drafts — so valid JSON does not depend on model obedience. Cloud path unchanged byte-for-byte (snapshot). Р-1 layers stay as the outer guard.
  - Pre-flight proves the whole-bundle Edit proposal on the gate's local model; if the model still cannot deliver under constraint, that is reported as a named limitation of local mode — not silently rerouted to cloud.
  - The recommendation-repair (`atMostOneRecommended`) logs one line when it fires, so future gates can tell «repair worked» from «model complied» (вердикт по §7.1 рапорта р.5).
  - Acceptance Criteria: constrained Edit call returns parseable JSON on the pre-flight state that failed in D-161 (three-for-three); cloud snapshot unchanged; repair emits a log line covered by a test; `GATE_EDIT_LOCAL=1` walk segment passes with the constraint on.
  - _Dependencies: 130_ · _Requirements: D-161; А-7 (основной режим — локальный); А-8_ · _Touches: `src/modules/adapters/llm/**`, `src/modules/agents/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 128\. Parity checklist walk (ultracode red-team)
  - Build the checklist from Эталон Часть 1 (§1.1–1.5, every observable behaviour and surface); walk our product item-by-item with screenshots ours-vs-dump; produce the gap list with a verdict per item (parity / deliberate own-tint difference / gap). Then ONE ultracode red-team pass adversarially hunting for missed discrepancies (mode map §3-bis).
  - Acceptance Criteria: every checklist item carries a verdict and evidence; gaps are enumerated with owners (fix in 129 or recorded as accepted difference by the Architect); the red-team pass found-items are all dispositioned; artifacts in `artifacts/parity-M10/`.
  - _Dependencies: 124–127, 131_ · _Requirements: А-2 (финальный парити-вердикт)_ · _Touches: `artifacts/parity-M10/**`, `e2e/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 129\. M10п gate — final walk and stage-1 seal (self-run, А-2.1)
  - Pre-flight per the gate profile: fresh key check, `qwen3:8b` measured (document structure + JSON round + constrained Edit); the smallest passing model becomes the walk's local fallback. Full live walk on the final visual layer, both themes smoked; fix-worthy gaps from 128 closed and re-walked.
  - Acceptance Criteria: walk GREEN with zero truncations and zero structural rejections; parity checklist verdicts all dispositioned; CI green; artifacts `artifacts/gate-M10/`.
  - After the Architect accepts: tag `m10p-accepted` and release tag `stage1-complete` — Этап 1 закрыт.
  - _Dependencies: 128_ · _Requirements: А-2.1_ · _Touches: `e2e/gate-M10.live.ts`, `artifacts/gate-M10/**`_ · _Complexity: Large_ · _Parallel-safe: no_

### Milestone 11п — Parity gaps (Architect, 2026-08-17; по итогам red-team задачи 128)

Goal: close every gap the red-team confirmed, so the stage-1 seal is earned, not declared. Source of truth: `artifacts/parity-M10/CHECKLIST.md` (verdicts as amended by А-12: gap `1.2-4`-persistence returned from «своё отличие» to gaps). One session expected.

- [x] 132\. Substantive gaps (behaviour)
  - `1.2-3` **Analytical bridge between rounds**: after a round's answers are submitted, the interviewer writes a short in-feed commentary before the next round — naming contradictions between answers, physical impossibilities, and what the next round will therefore probe (Эталон §1.2, Часть 6 слой 1). Prompt-level, persisted as an ordinary feed message; language follows У-1; non-technical profile keeps У-5 rules; on the local provider the bridge is budgeted by А-8 packing like any message.
  - `1.2-4a` **Chat reply position**: replies stop being re-stamped to the current position — each carries the stage/substage it was answered in, per `feed-item.tsx`'s own docblock.
  - `1.2-4b` **Chat replies persist** (returned to gaps by А-12): free-chat exchanges are persisted and project into the feed after reload — the reference dump's saved session contains its chat verbatim, so ephemerality is a parity gap, not a tint. No new write path beyond the chat store that already exists for decisions; the projection reads it.
  - `1.4-6` **One methodology vocabulary**: stage names from the config reach the proceed button, the transition chip, and card captions (D-119 promised exactly this).
  - `1.4-7` **Round budget reaches the surface**: `roundBudgetFor` is called and displayed (rounds used/remaining on the round card), and the exhausted state names the methodology's own budget.
  - Acceptance Criteria: bridge appears between every pair of rounds on a live two-round stage and names at least the chosen options it builds on (fixture asserts the prompt receives prior answers); reload reproduces chat replies byte-for-byte in their original positions; a non-default methodology walk shows its own names in all three surfaces and its budget on the card; e2e green.
  - _Dependencies: 131_ · _Requirements: Эталон §1.2, §1.4; D-119; А-12_ · _Touches: `src/modules/agents/interview/**`, `src/modules/web/feed/**`, chat store_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 133\. Surface gaps (11)
  - The six cheap fixes named in CHECKLIST §«Что чинится»: `1.1-2` (bubble fill token), `1.1-13` (completion copy sentence), `1.4-5` (call the computed `substageLabel`), `1.4-8` (export copy line), `1.5-3` (panel title), `1.2-1` (seed template does not duplicate the description) — plus the remaining five: `1.1-13` completion panel becomes the feed's true tail (stage bar and Refine render above it, chat pins below nothing), `1.2-2` one source for «how many rounds», `1.2-5` bundle-created event block in the feed, `1.4-4` Edit template de-duplication, `1.5-2` attach control in the composer + brand gradient on the send button, `1.5-4` project description surfaced.
  - Acceptance Criteria: each item's checklist row flips to «парити» with evidence; the completion panel is the last block in a completed session's feed; composer shows attach and the gradient send in both themes.
  - _Dependencies: 132_ · _Requirements: CHECKLIST §Разрывы (поверхностные)_ · _Touches: `src/modules/web/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 134\. Cosmetic gaps (7)
  - `1.1-3` `data-msg-snippet`, `1.1-6` tag-chips on options (when the model supplies them; schema stays optional), `1.1-10` transition chip: all four reference traits, `1.1-11` card caption in primary + Preview icon, `1.3-4` review item header = section path (title moves into the body line), `1.4-1` full methodology name visible without tooltip, `1.5-11` AI prose typography per reference scale.
  - Acceptance Criteria: each row flips with evidence; no token-gate violations introduced.
  - _Dependencies: 133_ · _Requirements: CHECKLIST §Разрывы (косметические)_ · _Touches: `src/modules/web/**`_ · _Complexity: Medium_ · _Parallel-safe: yes_

- [x] 135\. M11п gate — checklist re-walk and the stage-1 seal (self-run, А-2.1)
  - Re-run `parity-M10.spec.ts` with the updated expectations; re-issue the checklist with new verdicts (target: 0 unowned gaps — every row is парити or an Architect-confirmed difference); one short live walk (default methodology, both themes) proving the bridge, persistent chat, and surfaces live; gate profile as in 129.
  - Acceptance Criteria: checklist has zero undispositioned rows; live walk GREEN (zero truncations, zero structural rejections); CI green; artifacts `artifacts/gate-M11/`.
  - After the Architect's acceptance: tags `m11p-accepted` and `stage1-complete`.
  - _Dependencies: 132–134_ · _Requirements: А-2 (финальный парити-вердикт), А-2.1_ · _Touches: `e2e/**`, `artifacts/gate-M11/**`_ · _Complexity: Large_ · _Parallel-safe: no_


### Milestone 12п — Design finale & bug hunt (Architect, 2026-08-17; личная приёмка заказчика этапа 1)

Goal: the customer personally walked the product end-to-end — mechanics confirmed working, design sent back for a real polish. Mandate (А-14, уточнён 2026-08-17): **the reference is a FUNCTIONAL and UX bar only — «функционально и по удобству не хуже». Its graphics are NOT a target: the visual identity must be our own and deliberately distinct.** Where the reference can do something we cannot, or does it better (the three-view document viewer is the customer's own example), we match or beat it. Where it is merely a look, we go our own way and justify it in one line. The reference material is `.specs/research/etalon-design.zip`: three full page saves in journey order (new chat → mid-journey → completed voxel demo — the customer recreated OUR test prompt on THEIR site, so content matches side-by-side) plus their complete stylesheet `root-CbIPcGKW.css` (Inter, OKLCH palette, radius/type scales). Unpack it to `.specs/research/etalon-design/` first and study all three pages in a browser before writing a line of CSS — read them as a **capability and ergonomics inventory** (what can a user do here, in how many clicks, with what feedback), not as a visual template. Our palette, brand and visual language stay ours (задача 124); this milestone is about capability parity, composition, hierarchy, spacing and finish — expressed in our own identity.

- [x] 136\. Reported defects first — root causes, not cosmetics
  - **Sidebar collapse is irreversible** (customer repro: the `›` toggle collapses the Specs column, layout squashes, pressing again does not restore). Root-cause the state/width handling; collapse must be a clean two-state toggle that survives reload; the un-collapsed default returns exactly.
  - **Composer is squashed into a vertical strip** (placeholder «Ask anything» renders one letter per line — the textarea gets ~2ch width). Root-cause the flex/grid constraint; the composer must occupy the feed column's full width at every viewport ≥1024px, with graceful behaviour below.
  - Sweep for siblings of both bugs: any other collapse/resize control and any other flex child that can be starved (audit every `flex`/`grid` container the two fixes touch).
  - Acceptance Criteria: both customer repros pass as new e2e tests (collapse → expand → identical layout; composer min-width at three viewports); no other control exhibits the class (audit list in the report).
  - _Dependencies: 135_ · _Requirements: рекламации заказчика 2026-08-17 (скриншоты 1–2)_ · _Touches: `src/modules/web/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 137\. Composition and layout per the reference journey
  - Rebuild the page composition so the product reads as one designed application: feed as the centred primary column with a comfortable reading measure, sidebar with its sections, collapse and resize, sticky header whose pills do not fight the title, and a properly docked composer (attach + model picker + Send) rather than a floating fragment.
  - Use the reference to calibrate **ergonomics** — reading width, density, what stays visible while scrolling, how the composer behaves — then design our own proportions and rhythm on top. Copying their exact paddings is explicitly NOT the goal; being as comfortable to use, or better, is.
  - Acceptance Criteria: side-by-side screenshots (ours vs reference) for the three journey moments, each annotated with **what we do at least as well and where we deliberately differ** (visual divergence is expected; ergonomic regression is not); no horizontal scroll at 1280/1536/1920; sidebar resize + collapse work; e2e green on both themes.
  - _Dependencies: 136_ · _Requirements: Эталон §1.1/§1.5; etalon-design pages_ · _Touches: `src/modules/web/**` (layout shell)_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 138\. Document experience — the card is a door, not a box
  - Every document card in every state opens the full viewer (глаз): during live generation the viewer streams the same content (reuse the resumable reader — no second data path); after approval likewise. The in-card preview stays a bounded excerpt, not a scrollable well.
  - Viewer header gains the metrics the customer asked for: line count, word count, revision, and per-view (Raw shows line numbers). Copy/Download stay.
  - Acceptance Criteria: the eye is present and works on a card in `generating`, `drafted`, and `approved` states (e2e covers all three); Raw shows numbered lines; counts match `wc -l`/word count of the exported bytes; streaming into an open viewer keeps the liveness invariant (Stop reachable).
  - _Dependencies: 136_ · _Requirements: рекламация заказчика (скриншот 3 vs 4–5)_ · _Touches: `src/modules/web/viewer/**`, `src/modules/web/feed/**`_ · _Complexity: Large_ · _Parallel-safe: yes_

- [x] 139\. Polish pass over every surface
  - With composition fixed, walk every surface against the reference quality bar and finish it: review boards, round forms, chips, completion panel, project page, pickers, empty states, hover/focus states, transitions (respecting `prefers-reduced-motion`), spacing rhythm, icon set consistency.
  - Creative freedom applies — improve on the reference where we can justify it in one sentence; every deliberate divergence listed in the report.
  - Acceptance Criteria: a full-journey screenshot set (both themes) attached; token gate and contrast tests still green; zero raw-colour violations; divergence list present.
  - _Dependencies: 137, 138_ · _Requirements: А-14_ · _Touches: `src/modules/web/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 141\. Desktop-readiness of the shell (заказчик: сайт может стать desktop-приложением)
  - Design the shell now so a later desktop wrapper is a packaging step, not a rewrite: an **application layout** (fixed viewport height with internally scrolling panes — feed, sidebar, viewer — instead of one long page scroll), no dependence on browser chrome for navigation (in-app affordances where a browser button is the only way today), resilience from ~1000×700 upward, and UI state (sidebar width/collapse, theme, viewer view) persisted through ONE module so it can move to a desktop store later.
  - Keyboard-first ergonomics as part of it: shortcuts for send, open viewer, switch view (Outline/Preview/Raw/Diff), collapse sidebar — with a discoverable in-app list; visible token-driven focus rings everywhere.
  - Explicitly OUT of scope: packaging (Electron/Tauri), native menus, auto-update, file-system access. This task only removes future blockers, and says so in the journal.
  - Acceptance Criteria: no page-level scrollbar on the session surface at 1280×800 — panes scroll internally; fully operable at 1000×700 without horizontal scroll; every shortcut works and is listed in-app; UI state survives reload through a single persistence module; the report names what a desktop wrapper would still need.
  - _Dependencies: 137_ · _Requirements: А-14.1 (будущая адаптация в desktop)_ · _Touches: `src/modules/web/**` (shell, persistence)_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 140\. M12п gate — scripted bug hunt + live walk (self-run, А-2.1)
  - The customer's directive: «сразу протестировать на баги». Beyond the standard walk, run a destructive pass: collapse/expand and resize everything repeatedly, reload at every state, switch themes mid-generation, open/close the viewer during streaming, drive Edit and revert, spam the composer — every found defect is fixed with a regression test, every non-trivial one journaled.
  - Then the standard short live walk (gate profile: fresh key first, smallest passing local model) on the final visuals.
  - Acceptance Criteria: bug-hunt log with disposition per finding; live walk GREEN (zero truncations/structural rejections/console errors); artifacts `artifacts/gate-M12/` incl. both-themes screens; CI green.
  - Final acceptance of this milestone is the **customer's own eyes** — the Architect verifies artifacts, the customer walks the product; tags `m12p-accepted` only after both.
  - _Dependencies: 136–139, 141_ · _Requirements: А-2.1; А-14_ · _Touches: `e2e/**`, `artifacts/gate-M12/**`_ · _Complexity: Large_ · _Parallel-safe: no_


### Milestone 13п — Interview modes, the autonomous subject, defects & RU locale (Architect, 2026-08-18; режим сессии — ULTRACODE по приказу заказчика)

Goal: the customer's second hands-on pass plus his video demo (`video demo/Desktop 2026.08.18 - 18.29.26.06.mp4`, on this machine — extract frames/audio locally and study it FIRST, before any task below). Four workstreams: reported defects, native RU chrome, a third «concrete» interview mode, and the **autonomous generation mode — the subject Программа А will drive**, which is why the customer ordered ultracode: prompts and autonomy must be built at ensemble quality, not first-draft quality. Note discovered from the customer's saved page: his browser AUTO-TRANSLATES our English chrome (the «врата» comedy is Google Translate) — locale work below removes that entire failure class.

- [x] 142\. Reported defects and state clarity
  - **Raw view clipping** (скриншот 3): in Raw the pane slides right — part of the window is eaten off-screen and long lines never fit. Root-cause the pane width/overflow chain; long lines get horizontal scroll INSIDE the code well, the pane itself never exceeds the viewport. e2e measures the pane's right edge ≤ viewport at three widths.
  - **Superseded vs active review boards** (скриншот 1, разобрано по HTML — поведение задумано, подача провалена): a superseded board gets an explicit badge («Superseded — a newer review is below» / «Устаревший обзор — новый ниже»), dimmed and collapsed by default; the active board is visually distinct with its checkboxes and three buttons always visible together. The «This review is no longer the one in front of you» copy is replaced by the badge.
  - **Stage-panel hierarchy** (скриншот 2): after approval the panel stacks «Generate» + gate-wait block + refinement into a confusing pile. Restructure: ONE primary action per state, secondary actions visually secondary, the gate-wait block appears only while an actual wait is in flight (never idles at «0 seconds»), refinement collapsed behind its header. Study the video for how the reference sequences this surface.
  - Acceptance Criteria: three e2e repros (Raw clipping, superseded-board distinction, single-primary-action per panel state); a screenshot set of the reworked panel states.
  - _Dependencies: 140_ · _Requirements: рекламации 2026-08-18; D-112_ · _Touches: `src/modules/web/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 143\. Native Russian chrome (рукописная локализация)
  - Full RU locale for every UI string (chrome, empty states, tooltips, shortcut list, error notices) — hand-written by the model at ensemble quality, not machine-translated; locale switch persisted in the UI-state module (default: ru for this deployment); У-1 content language stays independent of chrome locale.
  - String extraction becomes a lint-enforced registry (no literal UI strings in components), so a new surface cannot ship untranslated silently.
  - Acceptance Criteria: walking the full journey with locale=ru shows zero English chrome (e2e asserts a curated list of surfaces); gate-copy/ReasonCode explanations localized; auto-translate no longer has anything to mangle; both locales pass the existing e2e suite.
  - _Dependencies: 142_ · _Requirements: рекламации (автоперевод); У-1_ · _Touches: `src/modules/web/**`, string registry (new)_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 144\. Third interview mode — «Concrete» (по видео и формулировке заказчика)
  - A third question style alongside the existing two profiles: **always tight and practical** — asks specifically WHAT to build, HOW the user wants it implemented and HOW they will use it; consistent direct second-person voice (никаких «что должен чувствовать муравей»); options remain but lean to implementation choices; answers may carry **справки** (short reference notes attached to an answer — the video shows answers that include context, not bare picks).
  - Built at ensemble quality (ultracode): generate N candidate prompt variants, judge panel scores them on concreteness/voice-consistency/actionability against transcripts of both reference sessions, best variant ships; the losers' best questions are folded in.
  - Style is chosen at chat creation next to the audience profile; existing modes untouched.
  - Acceptance Criteria: a live round in Concrete mode produces only implementation-and-usage questions (judged by a scripted rubric over 3 live rounds); voice is uniformly second-person (lint over the round text in tests); справки render attached to options and survive submit/reload.
  - _Dependencies: 142_ · _Requirements: директива заказчика 2026-08-18; видео-демо_ · _Touches: `src/modules/agents/interview/**`, round schema (optional fields)_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 145\. Autonomous generation mode — the Программа А subject
  - A per-chat mode in which the AI drives the whole journey from the seed prompt alone: it answers its own interview rounds (each auto-answer recorded in the feed with a one-line rationale — the transparency IS the product), auto-decides reviews (Must Fix → request changes until Pass, bounded by the existing cycle budgets; recommendations judged against the seed), and carries the session seed → complete bundle **with zero human clicks**.
  - Human sovereignty preserved: the run is watchable live; Stop at any point drops the session into normal manual mode at exactly that position; every existing gate/budget/contract holds — autonomy is a driver over the same machine, never a bypass (P1/P2: the gates stay the law, the driver is just another user).
  - The driver itself is an agent module (prompt + policy) — built and red-teamed at ensemble quality (ultracode): adversarial panel attacks it with vague seeds, contradictory seeds, hostile seeds; failure modes get named handling, not hopes.
  - Acceptance Criteria: a live autonomous run from a one-sentence seed reaches Session completed without any click, on the gate chain, within budgets; feed shows every auto-decision with rationale; Stop mid-run converts to manual cleanly (e2e); a hostile-seed corpus produces refusals/honest stops, never runaway loops; the bundle passes the structural checks and linters as usual.
  - _Dependencies: 144_ · _Requirements: А-7 (Программа А); North Star этап 2_ · _Touches: `src/modules/agents/autonomous/**` (new), `src/modules/web/**` (mode surface)_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 147\. Viewer presentation per the customer's video (Architect addendum, 2026-08-18)
  - The document preview becomes a **centred overlay modal** as the video shows: file name + `Revision N` on the left; one line on the right — `Outline · [Preview|Raw|Diff] · Copy · Download · ✕`; identical width across all tabs; scrolling inside the window; `Outline` is a dropdown panel anchored to its button, not a permanent column. Esc and ✕ close; the docked-pane variant retires.
  - **Raw wraps long lines** (амендмент к AC задачи 142 по видео): a line wider than the well continues on the next visual line WITHOUT a number (the gutter numbers logical lines only); horizontal scrolling exists nowhere in the viewer. Display-only: bytes, Copy and Download remain exact (побайтовость задачи 122 не тронута).
  - Acceptance Criteria: overlay matches the video's composition point-for-point (side-by-side frames in the report); all four views share one width; Raw shows a >200-char line fully wrapped with correct logical-line numbering; page never scrolls sideways (re-run of the 142 probe stays green); liveness holds with the overlay open over a live stream (Stop reachable — re-run of the M12п check).
  - _Dependencies: 142_ · _Requirements: видео-демо (разбор `.specs/research/video-demo-2026-08-18.md`); А-14.1_ · _Touches: `src/modules/web/viewer/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 146\. M13п gate — ultracode red-team + live walks (self-run, А-2.1)
  - Video-demo conformance check first (the panel-preview flow and answer types per the video — list what the video shows vs what we ship, disposition each). Then the ultracode red-team pass over the two new agents (Concrete interviewer, autonomous driver) and the reworked surfaces; then live walks: one manual journey in Concrete mode + one full autonomous run, both themes, RU locale, gate profile (fresh key first, smallest passing local model).
  - Acceptance Criteria: red-team findings all dispositioned; both live walks GREEN (zero truncations/structural rejections, clean console); artifacts `artifacts/gate-M13/`; customer's eyes-acceptance follows the Architect's artifact verification.
  - _Dependencies: 142–145, 147_ · _Requirements: А-2.1; А-16_ · _Touches: `e2e/**`, `artifacts/gate-M13/**`_ · _Complexity: Large_ · _Parallel-safe: no_


### Программа А — автономный контур доставки (Architect, 2026-08-19; план нарезан из бандла A0 — `.specs/research/programma-a/`; амендмент А-20)

> Источник плана — бандл, который продукт сгенерировал сам (шаг 0, автономный прогон A0). Лестница бандла принята дословно: локальное ядро → handoff-конвейер → параллельность → Telegram. Сверка с реальностью репозитория — А-20: контур живёт новым пакетом `loop/` в этом же репозитории со своей SQLite; Spec Platform остаётся на своём стеке (Postgres/PGlite) и получает локальный режим и машинный экспорт; схемы бандла (`requirements.json`/`tasks.json`) — контракт между двумя приложениями, обе стороны тестируются против одних фикстур. M15а–M17а стоят скелетом: детальную декомпозицию каждого Архитектор пишет после приёмки предыдущего (порядок А-2). Номера закреплены сейчас, чтобы трассировка не перенумеровывалась.

### Milestone 14а — Spec Platform local single-user mode & machine bundle (Программа А, первая часть по А-7 §4)

- [x] 148\. Local single-user mode — auto-owner session without OAuth
  - Behind an explicit env flag (e.g. `LOCAL_SINGLE_USER=1`, read at boot): every request resolves to one fixed local owner identity created on first boot; the OAuth surface is not rendered and its routes refuse; sign-out is absent in local mode. NOT a second auth branch scattered over the code: one substitution point at the same seam `currentOwnerScope()` reads today — every scope check, gate and repository call downstream stays byte-identical.
  - The flag is a deployment property, not a session property: with the flag unset, behavior is byte-identical to today.
  - Acceptance Criteria: with the flag on, opening `/` lands in the owner's projects with no login step (e2e with JS off proves the server made the session); the existing e2e suite passes with the flag ON against the local profile; a regression run with the flag OFF shows the present OAuth flow unchanged.
  - _Dependencies: —_ · _Requirements: А-7 §4; бандл A0 (FR «Локальный однопользовательский режим»)_ · _Touches: `src/modules/projects/auth/**`, auth surface in `src/app/**`_ · _Complexity: Medium_ · _Parallel-safe: no_

- [x] 149\. Persistent local database profile
  - A durable local DB profile reusing the machinery the throwaway harness already trusts (PGlite): data lives in a project-local gitignored directory, survives restarts, selected by the same env seam that picks the throwaway one today. One command brings the whole local stack up (DB + dev server with the local flag), one takes it down; a short RU README section for the заказчик (три команды).
  - Explicitly NOT a migration to SQLite: Spec Platform stays on its Postgres dialect (18 миграций, партиальные уникальные индексы, триггеры); SQLite в Программе А — база оркестратора (`loop/`), не платформы (А-20).
  - Acceptance Criteria: full journey (seed → sealed bundle) on the local profile with the dev server restarted mid-journey — session, revisions, boards and messages survive restart byte-for-byte; the throwaway gate harness is untouched and green.
  - _Dependencies: 148_ · _Requirements: А-7 §4; NFR-003_ · _Touches: db bootstrap scripts, docs_ · _Complexity: Medium_ · _Parallel-safe: no_

- [x] 150\. Machine-readable bundle export — the inter-app contract
  - A new export shape alongside the ZIP (a mode, not a replacement): `bundle/constitution.md`, `bundle/architecture.md` (the approved solution revision), `bundle/requirements.json`, `bundle/tasks.json` — the JSON valid against the Программы А schemas (`requirements_schema.json`/`tasks_schema.json` из бандла A0), which become shared fixtures IN THIS REPO. IDs stable across re-export; `dependsOn` derived from the tasks document's stated dependencies; every requirement row present exactly once.
  - Derived from the SAME approved revisions the ZIP prints — no separate generation, no model in the loop; deterministic for a fixed bundle.
  - Acceptance Criteria: AJV validation of both JSON files against the shared schema fixtures is a unit test; a golden-fixture test pins the markdown→JSON mapping so schema drift is a red diff; ZIP export byte-identical to today.
  - _Dependencies: 149_ · _Requirements: бандл A0 (Integration: Spec Platform Bundle); А-20_ · _Touches: `src/modules/specs/export/**` (new mode)_ · _Complexity: Medium_ · _Parallel-safe: no_

- [x] 151\. M14а gate — live walk on the local profile (self-run, А-2.1)
  - Live walk: local stack up by the one-command script, auto-owner session, full autonomous run from a short RU seed to a sealed bundle (профиль гейта: свежий ключ спереди), machine export produced and AJV-validated, dev-server restart mid-walk proving persistence. Both themes, RU chrome; liveness invariant on every snapshot; the usual red conditions (truncation, structural rejection, console) plus one new: any OAuth surface visible in local mode = red.
  - Acceptance Criteria: walk GREEN with artifacts `artifacts/gate-M14a/` (RESULT, screens, transcript, sha256 of the machine bundle); Architect artifact verification, then customer eyes-acceptance.
  - _Dependencies: 148–150_ · _Requirements: А-2.1_ · _Touches: `e2e/**`, `artifacts/gate-M14a/**`_ · _Complexity: Medium_ · _Parallel-safe: no_

### Milestones 15а–17а — сам контур (скелет; задачи получат полные тела с AC при детализации своего milestone)

### Milestone 15а — Orchestrator core & single-cycle handoff (бандл A0: M1+M2; детализировано Архитектором 2026-08-19 при приёмке M14а, амендмент А-21)

> Новый пакет `loop/` (pnpm workspace) со своей SQLite; монолит — оркестратор живёт в процессе сервера пакета. **Docker Desktop — системное требование с этого milestone**: первый шаг сессии — preflight `docker version` через named pipe; если Docker недоступен — честная остановка с рапортом, не BLOCKED. Правила пакета: интерфейс дашборда — по-русски сразу (реестр строк платформы на `loop/` не распространяется — своя поверхность, RU-only v1, названное решение); границы модулей и lint — те же инструменты репозитория.

- [x] 152\. `loop/` package bootstrap: SQLite core + config
  - pnpm-workspace package `loop/`; SQLite (WAL) opened with `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;` on EVERY connection; migrations for `projects`/`milestones`/`tasks`/`reports`/`agent_logs`/`agent_decisions` per the A0 solution schema; `.env` validation fail-fast on the three mandatory vars (`ANTHROPIC_API_KEY`, `PORT`, `WORKSPACE_ROOT_PATH` — остальные валидируются при фактическом присутствии), process exits with a readable stderr explanation when one is missing.
  - Acceptance Criteria: DB file created on first boot; concurrent-write test (10 parallel writers into `agent_logs`) passes with zero `database is locked`; missing mandatory var = immediate exit with named var in stderr.
  - _Dependencies: —_ · _Requirements: бандл A0 (Task 1.1, 1.2)_ · _Touches: `loop/**` (new)_ · _Complexity: Medium_ · _Parallel-safe: no_

- [ ] 153\. Local dashboard + SSE log feed
  - Next.js app of the `loop/` package on `127.0.0.1:<PORT>`, no auth surface at all (локальный контур); дашборд: проект, вехи/задачи со статусами, лента логов. `GET /api/observability/stream-logs` — SSE, fed by the in-process event bus (никакого поллинга БД); reload не теряет хвост (последние N строк из `agent_logs` доклеиваются до подписки).
  - Acceptance Criteria: строка лога, выпущенная оркестратором, появляется в открытой странице без перезапроса (e2e); дашборд по-русски; холодный старт до интерактивной страницы ≤ 3 с на машине CI.
  - _Dependencies: 152_ · _Requirements: бандл A0 (Task 1.3, 1.4)_ · _Touches: `loop/**`_ · _Complexity: Medium_ · _Parallel-safe: no_

- [x] 154\. Docker Engine adapter: named pipe / socket seam + path translation
  - Адаптер жизненного цикла контейнеров (create/start/stop/pause/unpause/remove, logs attach) поверх Docker Engine API; платформенный шов: `npipe://./pipe/docker_engine` на win32, unix socket на Linux/CI — один интерфейс, две транспортные реализации, выбор по `process.platform` с override в `.env`. Трансляция путей Windows→Docker (`C:\…` → `/c/…`, нижний регистр диска, прямые слэши) — чистая функция с golden-тестами (диски, вложенность, пробелы, кириллица в пути).
  - Acceptance Criteria: интеграционный тест на CI (unix socket): контейнер создаётся, запускается, пишет в смонтированный том, гасится и удаляется; golden-тесты трансляции зелёные; named-pipe ветка покрыта юнитом на выбор транспорта (живой пайп — на гейте, машина заказчика).
  - _Dependencies: 152_ · _Requirements: бандл A0 (Task 2.1, 2.2); Security Constraints_ · _Touches: `loop/**`_ · _Complexity: Medium_ · _Parallel-safe: yes (после 152)_

- [ ] 155\. Headless executor wrapper (Claude Code in a container)
  - Образ исполнителя (node + Claude Code CLI) и обёртка запуска: контейнер получает смонтированный workspace (через трансляцию 154), задание `task_<taskId>.json`, точечные переменные окружения (НЕ весь `.env`); неинтерактивный запуск — фактические флаги/переменные CLI уточнить по документации Claude Code на момент реализации (в бандле «claude --yes»/«CI=true» названы «например»); stdout/stderr стримятся в `agent_logs` и SSE-ленту; жёсткий таймаут итерации 5 минут → задача `FAILED`.
  - Именованное ограничение, если аутентификация Claude Code в контейнере потребует интерактивного входа: остановка с описанием того, что нужно от заказчика (однократный вход/токен), — это операционный шаг, не дефект.
  - Acceptance Criteria: контейнерный тест: обёртка исполняет скриптовое задание (правка файла в томе) без единого интерактивного ожидания; таймаут-тест: зависший процесс убит по 5 минутам и задача помечена `FAILED`; `.env` целиком в контейнере отсутствует (проверено изнутри).
  - _Dependencies: 154_ · _Requirements: бандл A0 (Task 2.3); User Roles §Технический протокол_ · _Touches: `loop/**`, образ исполнителя_ · _Complexity: Large_ · _Parallel-safe: no_

- [ ] 156\. Bundle intake + handoff generation (вехи режет код)
  - Приём `bundle/` (constitution.md, architecture.md, requirements.json, tasks.json): AJV по общим фикстурам `fixtures/spec-bundle/` — тем же, против которых тестируется экспорт задачи 150 (контракт встречается в одной точке). Нарезка вех — **детерминированная**: топологическая раскладка по `dependsOn` (код, не модель; зеркало D-229 — «ход выбирает код»); при пустых `dependsOn` фолбэк — фазовый порядок источника (задачи фазы N зависят от фазы N−1, консервативно). Модель наполняет ТЕКСТЫ handoff-заданий (title/description/filesToEdit-предложение) через провайдерный шов платформенного образца — цепочка из `.env`, НЕ захардкоженный anthropic; `milestones.json` + `task_*.json` пишутся строго по схемам, `filesToEdit` обязателен.
  - Acceptance Criteria: интейк бандла M14а-гейта (реальная фикстура) даёт валидные вехи в правильном фазовом порядке; цикл в `dependsOn` — именованная ошибка интейка, не зависание; AJV-отказ печатает путь ошибки.
  - _Dependencies: 152_ · _Requirements: бандл A0 (Task 2.4); задача 150_ · _Touches: `loop/**`, `fixtures/spec-bundle/`_ · _Complexity: Large_ · _Parallel-safe: no_

- [ ] 157\. Single-cycle acceptance gate (двухфазная верификация)
  - Полный одиночный цикл: PENDING-задача → контейнер исполнителя → `report_<taskId>.json` → приёмка оркестратором в СВЕЖЕМ чистом контейнере (копия кодовой базы, независимый прогон тестов; отчёт исполнителя — информационный, гейт решает только перепрогон); techStack-автодетект по маркерным файлам с немедленной перезаписью `task_*.json` на диске (диск — источник правды); Artifact Walks по `expectedArtifacts` (validationCmd/Args из корня workspace, successRegex по stdout+stderr); `generic` без явных команд = именованный отказ гейта; BLOCKED-протокол: `BLOCKED_<taskId>.md` по шаблону бандла, chokidar-вотчер, удаление файла → задача `PENDING` в течение 1 с; rationale из отчёта → `agent_decisions` (MD5 hex lowercase при отсутствии `decisionId`).
  - Acceptance Criteria: сквозной тест цикла на стабовом исполнителе (без живой модели, NFR-012-дисциплина платформы); тест «исполнитель прислал SUCCESS, чистый контейнер красный» → задача НЕ `COMPLETED`, конвейер стоит; тест вотчера блокировок (создание/удаление, 1 с); тест автодетекта с перезаписью.
  - _Dependencies: 155, 156_ · _Requirements: бандл A0 (Task 2.5, 2.6, 2.7)_ · _Touches: `loop/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [ ] 158\. M15а gate — live single-cycle walk (self-run, А-2.1)
  - Живая прогулка: настоящий игрушечный nodejs-проект (бандл из машинного экспорта платформы — путь задачи 150) проходит интейк → вехи → задание → живой исполнитель Claude Code в контейнере → отчёт → чистый контейнер → `COMPLETED`; посреди цикла оркестратор убивается (SIGKILL) и рестартует — состояние восстановлено с диска (Шаг 0 бандла — в объёме M16а, здесь достаточно возобновления одиночного цикла); скрины дашборда, SSE-лента в артефактах. Красные условия: интерактивное зависание исполнителя, `database is locked`, потеря состояния на рестарте.
  - Acceptance Criteria: walk GREEN, артефакты `artifacts/gate-M15a/` (RESULT, скрины, `handoff/`-дерево, логи); проверка Архитектора, затем приёмка заказчика.
  - _Dependencies: 152–157, 168_ · _Requirements: А-2.1_ · _Touches: `loop/e2e/**`, `artifacts/gate-M15a/**`_ · _Complexity: Large_ · _Parallel-safe: no_

- [x] 168\. Generation-run sweep at boot (закрывает Backlog B-1; сторона платформы)
  - Осиротевший `generation_runs.status='running'` (продюсер умер вместе с процессом) чинится при загрузке: sweep в instrumentation помечает прогоны старше порога терминальным статусом с именованной причиной; сессия снова генерируема. Требование контура: автономный прогон не должен спотыкаться о прошлый обрыв питания (окно рестарта гейта M14а выбиралось в обход этого дефекта — теперь обходить не нужно).
  - Acceptance Criteria: тест: строка `running` старше порога при загрузке → терминальный статус, следующий `generate` не отвергается; живой прогон не затрагивается (порог заведомо больше серверного бюджета цепочки).
  - _Dependencies: —_ · _Requirements: Backlog B-1; Р-3_ · _Touches: `src/**` (instrumentation, generation store)_ · _Complexity: Small_ · _Parallel-safe: yes_

- [x] 169\. Canonical task form + explicit dependencies in the tasks-generation instruction (сторона платформы; вердикт по §7.2 рапорта M14а)
  - Инструкция генерации tasks-документа получает названную каноническую форму записи задач (чекбокс-список с идентификаторами) и ЯВНУЮ нотацию зависимостей задачи (гейт M14а показал: фазовый документ без зависимостей даёт `dependsOn: []`, и планировщик контура ослепнет). Маппинг задачи 150 сохраняет все три распознаваемые формы как ТЕРПИМОСТЬ (уже сохранённые бандлы обязаны экспортироваться), выводит `dependsOn` из явной нотации, фазовый порядок — консервативный фолбэк (совпадает с фолбэком интейка 156).
  - Acceptance Criteria: свежесгенерированный tasks-документ (фикстура) даёт непустые `dependsOn` в экспорте; оба прежних golden-а зелёные без изменений; структурная валидация документов не ужесточена (форма — инструкция, не отказ).
  - _Dependencies: —_ · _Requirements: рапорт M14а §7.2; задача 150_ · _Touches: `src/modules/prompts/**` (tasks instruction), `src/modules/specs/export/**`_ · _Complexity: Small_ · _Parallel-safe: yes_

**Milestone 16а — Параллельность и «Красный CI» (бандл A0: M3).**

- [ ] 159\. Параллельный планировщик (до 10 исполнителей, коллизии по `filesToEdit`)
- [ ] 160\. Красный CI: hard stop, `docker pause` по имени `delivery-executor-${taskId}`, `POST /api/orchestrator/retry` + unpause
- [ ] 161\. Контроллеры (линтеры по стеку до тестов) и Исследователи (контекстные отчёты архитектору)
- [ ] 162\. Восстановление с диска (Шаг 0 против FK, вехи/задачи, автодетект утерянного techStack) + VRAM-аудит `nvidia-smi` (gate-only на машине заказчика; CI без GPU — именованное ограничение)
- [ ] 163\. M16а gate: небольшой настоящий продукт (например «текстовый квест» из примера бандла) собирается контуром end-to-end при ≥3 параллельных исполнителях; инсценированный красный CI замораживает конвейер и возобновляется через retry

**Milestone 17а — Telegram и голос (бандл A0: M4; ТГ — последним по А-7 §3).**

- [ ] 164\. TG-бот (long polling, только owner chat id) + русскоязычные алерты (блокировка, красный CI, успех)
- [ ] 165\. Голос: ogg→wav (ffmpeg) → локальный Whisper-совместимый API
- [ ] 166\. Фасад `generate-bundle`/`start-loop` поверх РЕАЛЬНЫХ поверхностей Spec Platform (создание проекта + автономный прогон + машинный экспорт задачи 150) — не новый генератор
- [ ] 167\. M17а gate: голосовая задумка → бандл → контур → готовый протестированный продукт без единого действия руками после голосового сообщения


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
