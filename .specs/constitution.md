# Project Constitution — Spec Platform (MySpec-class SDD Tool)

> This document defines the non-negotiable engineering ground rules for the project.
> Every requirement, design decision, and task in this bundle must comply with it.
> Conflicts are resolved in favour of this constitution.

## Project Vision

### Problem

Developers working with AI coding agents (Cursor, Claude Code, Codex, Lovable, Bolt, Replit) lose most of their productivity to **missing context**. A one-paragraph prompt is not enough for an agent to build correctly, and writing a full technical specification by hand is slow, unstructured, and starts from a blank page. Existing open tooling (e.g. GitHub Spec Kit) solves this as a CLI slash-command loop, which excludes non-CLI users and provides no guided interview, no persistence, and no review workflow.

### Target Users

- **Primary:** solo developers and indie hackers who drive AI coding agents daily.
- **Secondary:** small development teams and startup product squads, non-technical founders converting ideas into buildable plans, and agencies producing specifications for clients.

### Long-Term Outcome

A hosted web platform that converts a plain-language prompt into a complete, versioned, agent-ready specification bundle through a guided, staged, multi-agent interview:

`Interview → Constitution → Requirements → Solution → Tasks → (optional Quality) → Export`

The platform delivers **format parity** with the reference product's four-file bundle (`constitution.md`, `requirements.md`, `solution.md`, `tasks.md`) as its default behaviour, and differentiates through an **optional Quality stage**.

**Bundle contract.** With the Quality stage disabled, the exported bundle contains exactly the four parity files. When the Quality stage is enabled, the bundle additionally contains **`quality.md`**, emitted after `tasks.md`, and the four core files are enriched in place. `quality.md` is a fixed filename and is the only additional artifact the Quality stage may introduce.

The Quality stage contributes:

- a requirement→solution→task **traceability matrix**,
- **expanded EARS+ acceptance criteria** covering edge and negative cases,
- a **risk, assumption, and open-question log**.

Success means: a generated bundle can be handed to a coding agent **without rewriting**, and the feature-parity checklist against the reference product is met.

## Core Principles

### P1 — Determinism Over Model Discretion (non-negotiable)

Stage transitions, gate conditions, and workflow order are enforced by **application code**, never by model judgement. The LLM produces content; the state machine decides what happens next. Any prompt that asks a model to "decide the next stage" is a constitution violation. Every transition in the workflow — including leaving the interview — has a gate expressible as a boolean over persisted state.

### P2 — Human Approval Gate at Every Stage (non-negotiable)

No stage may advance without an explicit user decision. Every generated specification file is presented for approval/rejection, and every review board requires an accept/ignore/revise decision. Auto-advance through a gate is prohibited.

### P3 — Parity First, Enhancement Second (non-negotiable)

The default output is the classic four-file bundle. The Quality stage is strictly **opt-in and additive**: with it disabled, output must remain structurally identical to the parity baseline. Enhancements must never degrade or alter default behaviour.

**The parity baseline is defined, not asserted.** It consists of:

1. exactly four files — `constitution.md`, `requirements.md`, `solution.md`, `tasks.md`;
2. a required list of section headings for each file, in required order;
3. no additional files, and no Quality-stage content, in any default-mode export.

**The baseline lives in exactly one place.** The required-headings definition is a single machine-readable **section schema** module owned by the `specs` module (e.g. `specs/section-schema.ts`, exporting a typed, Zod-validated structure keyed by spec type). It is the sole source of truth and has exactly two consumers:

- **prompt assembly**, which derives the required section list it instructs the model to produce, and
- **the parity structural check** (Testing Approaches → mandatory item 4), which asserts generated output against it.

Duplicating the heading list anywhere else — inline in a prompt file, hard-coded in a test fixture, or restated in documentation — is a constitution violation. Changing the schema is an explicit, reviewed change to that one module.

**Parity is verified automatically.** The structural check asserts that every generated file in default mode contains its required headings in the required order and that the export contains no fifth file. A change that breaks this check breaks P3 and fails CI. Parity is therefore a testable contract, not a matter of opinion.

### P4 — The Bundle Is the Product

Specification quality is the primary success metric. Structure, traceability, and testability of generated markdown outrank UI polish, feature count, and delivery speed in every trade-off.

### P5 — Never Lose User Work

Interview answers, approved specs, and revision history are durable. A failed model call, provider outage, network drop, or page reload must never destroy user progress; the session resumes from the last persisted state.

### P6 — Explicit Boundaries

Business logic, LLM orchestration, prompt content, persistence, and presentation are separated by explicit interfaces. No layer reaches across a boundary it does not own.

### P7 — Provider Neutrality

No business logic may depend on a specific LLM vendor's SDK, response shape, or capability. Provider-specific behaviour lives only inside adapters.

## Technology Constraints

### Mandated

| Concern | Technology | Notes |
|---|---|---|
| Application framework | **Next.js (App Router)** | Full-stack; server actions / route handlers for backend logic |
| Language | **TypeScript (strict mode)** | Front-end and back-end |
| UI | **React** | Component-based; streaming-capable |
| Database | **PostgreSQL** | Self-managed or managed (Neon / Supabase Postgres) |
| Data access | **Type-safe ORM** (Drizzle or Prisma) | Migrations version-controlled in-repo |
| Validation | **Zod** | All external and LLM boundaries |
| LLM providers | **Anthropic + OpenAI + Google** | Accessed exclusively through an internal abstraction |

### Delivery Surface

- **Web application only** for v1. No CLI, IDE extension, mobile app, or public API is in scope.

### Disallowed

- Direct calls to any provider SDK from React components or business logic modules.
- Provider API keys, secrets, or model credentials in client-side code or public environment variables.
- A single hard-coded LLM vendor as an unavoidable dependency.
- Alternative primary datastores (MongoDB, document stores) for core spec and project data.
- `any` types, unchecked casts, and unvalidated JSON parsing at system boundaries.

## Architecture Constraints

### A1 — Modular Monolith

The system is a **single deployable** organised into clearly bounded internal modules. Module boundaries are enforced by directory structure and lint-level import rules. Microservices, separate agent workers, and distributed queues are explicitly out of scope for v1.

Required module boundaries (names indicative, boundaries binding):

- `workflow` — stage/substage state machine, gates, transitions.
- `agents` — per-stage agent definitions and orchestration.
- `prompts` — versioned prompt assets.
- `llm` — provider adapters and the unified model interface.
- `specs` — spec file domain model, section schema, revisions, diffing, export.
- `projects` — user projects, sessions, attachments.
- `web` — UI, routes, presentation.

Cross-module access occurs only through each module's public interface.

### A2 — Agent Orchestration as an Explicit State Machine (non-negotiable)

The workflow is modelled as a formal, testable state machine.

**States:** `interview`, `constitution`, `requirements`, `solution`, `tasks`, `quality` (optional), `complete`.

**Ordering rule (binding):**

- Quality stage **disabled** → `… → tasks → complete`
- Quality stage **enabled** → `… → tasks → quality → complete`

`quality` is the only optional state; no other state may be skipped. `quality` may never precede `tasks`, because its traceability matrix and enrichment pass consume the completed four-file bundle as input.

**Interview stage and its exit gate.** The `interview` state has no `collect/generate/review` substages, because it produces no spec file. It is nonetheless gated in code like every other transition (see P1). Leaving `interview` for `constitution` requires **all** of the following to be true of persisted session state:

1. an initial user prompt or equivalent grounding input is recorded on the session;
2. at least one question round has been answered by the user;
3. a session summary has been persisted.

The gate is a pure function of stored session data. The model may propose that the interview is complete, but the transition is permitted only when the conditions above evaluate true; "the agent judged it had enough information" is never a sufficient condition. How many rounds beyond the first to ask, and how the questions are chosen, are model decisions and are deliberately left unconstrained here.

**When the Quality choice is made.** The Quality stage is **off by default**. The user is offered the choice at the **tasks review gate** — the point at which the four-file bundle is complete and the cost/benefit is concrete. The selection is persisted on the session and may be changed by re-entering the stage; enabling Quality after a default-mode export must not require restarting the session. Whether the option is *additionally* surfaced at session start is a UI decision delegated to the Requirements stage; the tasks-review-gate offer is mandatory regardless.

**Substages.** Each specification stage has substages `collect → generate → review`.

- Forward transitions require their gate to be satisfied (collect→generate requires collected answers or accepted evidence; generate→review requires an approved spec; stage→next-stage requires an accepted review decision).
- Backward transitions within a stage are always permitted (re-ask, revise).
- The state machine is pure and unit-testable in isolation from any LLM call.
- Illegal transitions are rejected with a machine-readable reason, never silently coerced.

### A3 — Provider Adapters Behind One Interface

All model interaction passes through a single internal interface (send messages, stream tokens, invoke tools). Each provider has an adapter implementing it. Automatic **failover** to the next configured provider on failure is a property of the abstraction layer, not of calling code.

### A4 — Versioned, Additive Spec Storage

Spec file content is persisted as **revisions**. Updates append a new revision rather than destroying history. Diffing and rollback operate on this revision chain. The Quality stage's enrichment pass writes new revisions of the four core files; it never overwrites the parity-mode revisions, so a default-mode bundle remains recoverable.

**Enrichment marking.** Every revision records whether it was produced by the parity path or by the Quality enrichment pass, along with the parity revision it was derived from. The last revision of each core file produced *before* enrichment is therefore always identifiable — this marking is what makes the export rule in A6 mechanically decidable rather than a matter of inference, and it is also what makes enrichment staleness detectable.

### A5 — Streaming-Capable Generation Path

Generation must support incremental delivery of model output to the UI. No blocking, spinner-only request/response cycle is acceptable for spec generation.

### A6 — Quality Stage as an Optional, Isolated Extension

The Quality stage is a distinct module that (a) emits `quality.md` and (b) applies an enrichment pass over the four core files. It must be removable/disable-able without touching the parity generation path, and the parity structural check must pass with the module disabled.

**Export mode is explicit and non-destructive (binding).** Export always resolves against a declared mode, never against "whatever the latest revisions happen to be":

- **Default-mode export** always resolves each of the four core files to its **last pre-enrichment revision** (per the A4 marking) and always omits `quality.md`. It therefore satisfies the P3 baseline byte-for-byte in structure, even if enrichment has already run on the session.
- **Quality-mode export** resolves each core file to its latest enriched revision and includes `quality.md`.
- Disabling the Quality stage after enrichment is **reversible and non-destructive**: it changes the export mode only. No revision is deleted.
- The user is shown which mode an export used at the moment of download, so the contents of a ZIP are never ambiguous.

**Enrichment staleness (binding).** Enriched revisions and `quality.md` are valid only against the parity content they were derived from. Re-enabling the Quality stage reuses retained enriched revisions **only when no core file has gained a newer parity revision since enrichment** (determined via the derivation link recorded in A4). If any core file has been changed since — for example through conversational refinement while Quality was disabled — the enriched artifacts are marked **stale** and the enrichment pass must re-run before a Quality-mode export is permitted.

Stale enriched artifacts are never exported and never silently reused: a traceability matrix that references requirements which no longer exist is a correctness defect, not a cosmetic one. Staleness is surfaced to the user with the option to re-run enrichment; retained stale revisions remain in history for diffing but are excluded from every export path.

## Testing Approaches

### Mandatory

1. **Unit tests for core logic** — workflow state machine, gate evaluation (including the interview exit gate), spec revision/diff logic, export mode resolution, enrichment staleness detection, export/ZIP assembly, prompt assembly. The state machine must reach high branch coverage, including every illegal-transition path and both Quality-enabled and Quality-disabled orderings.
2. **End-to-end test of the critical journey** — `prompt → interview → four stages with approvals → ZIP download`. This journey must be covered by an automated E2E test and must pass before any release.
3. **Deterministic state-machine tests with mocked LLM responses** — no test in CI may depend on a live model call. Provider adapters are exercised against recorded/stubbed responses.
4. **Structural assertion of generated specs (parity check)** — an automated test asserts, against the section schema defined in P3, that every generated spec file contains its required section headings in the required order, and that a default-mode export contains exactly the four parity files and no Quality content. Coverage must include a default-mode export taken from a session where enrichment has already run (the A6 export rule), and a Quality-mode export blocked by stale enrichment (the A6 staleness rule). This test is the enforcement mechanism for P3 and must run in CI on every change to prompts, generation logic, the section schema, or export logic.

### Rules

- CI is red-blocking: all four mandatory suites must pass before merge.
- Non-determinism from the model is isolated at the adapter boundary so all orchestration logic is deterministically testable.
- The section schema backing test 4 is versioned in-repo as the single artifact described in P3; changing it is an explicit, reviewed decision, never an incidental side effect of a prompt edit.
- Bug fixes land with a regression test.

### Not required in v1

- Full TDD with an enforced global coverage percentage.
- Load/stress testing.
- Semantic quality scoring of generated prose (structure is asserted; wording is not).

## Coding Standards

- **Strict TypeScript.** `strict: true`, no `any`, no non-null assertion abuse, no unchecked casts. Violations fail the build.
- **Lint and format enforced in CI.** ESLint + Prettier; formatting is not a review topic.
- **Runtime validation at every boundary.** All LLM outputs, HTTP payloads, uploaded file metadata, and environment variables are parsed through Zod schemas before use. Unvalidated data may not enter the domain layer.
- **Feature-based folder structure with enforced import boundaries.** Code is organised by feature/module, not by technical layer. Forbidden cross-module imports are blocked by lint rules, not convention.
- **Conventional commits and mandatory PR review.** Every change lands via pull request with at least one review; commit messages follow the Conventional Commits specification.
- **Prompts are assets, not string literals.** Prompt text lives in versioned prompt files under the `prompts` module and is referenced by identifier from logic.
- **No duplicated structural truth.** Required spec section names are imported from the section schema, never restated inline.
- **Gates are code, not prose.** Every workflow gate is implemented as a pure predicate over persisted state in the `workflow` module and is unit-tested; no gate condition is evaluated inside a prompt.
- Functions and modules are small and single-purpose; behaviour, not implementation detail, is what tests assert.

## Security Constraints

### S1 — Server-Side Secrets Only (non-negotiable)

Provider API keys and all credentials exist exclusively in server-side runtime configuration. They are never sent to the browser, embedded in client bundles, exposed via public environment variables, or logged. All model calls originate server-side.

### S2 — Strict Per-User Data Isolation (non-negotiable)

Every read and write of a project, session, spec file, revision, or attachment is scoped to the authenticated owner at the query level. Ownership is enforced server-side on every request; a client-supplied identifier is never trusted as authorisation. Cross-tenant access is treated as a critical defect.

### S3 — Baseline Hygiene

- Authentication handled by a vetted library/provider; no hand-rolled password or session cryptography.
- Uploaded files are size-limited and stored privately, accessible only to their owner.
- Secrets managed via environment configuration, never committed to the repository.
- Third-party and model-derived content is treated as untrusted input and is escaped/validated before rendering or persistence.

### Deferred (not v1 blockers)

Cost/rate-limit abuse controls, formal prompt-injection hardening, encryption-at-rest beyond platform defaults, and audit logging of spec changes are acknowledged risks scheduled for a later release.

## Performance Targets

| Target | Threshold | Scope |
|---|---|---|
| **Time to first streamed token** | ≤ 3 seconds (p95) | Every generation request |
| **Perceived responsiveness** | UI must never appear frozen | All generation and navigation states must render progress, streaming output, or skeleton feedback |

Rules:

- Any operation exceeding 500 ms without visible feedback is a defect.
- Long-running generation must stream; it may not block the interface.
- Total stage-generation wall-clock time, end-to-end session duration, and sub-200 ms interaction latency are **not** hard v1 targets, but must not regress perceived responsiveness.

## Integration Points

| Integration | Purpose | v1 Status |
|---|---|---|
| **Anthropic API** | Spec generation and interview agents | Required |
| **OpenAI API** | Alternate provider / failover | Required |
| **Google (Gemini) API** | Alternate provider / failover | Required |
| **OAuth — Google** | User sign-in | Required |
| **OAuth — GitHub** | User sign-in | Required |
| **Web search/fetch service** | Live research during generation so specs reflect current libraries and practices | Required |
| **Document parsing** (PDF, DOCX, XLSX, images) | Ingest user-supplied documents as grounding context | Required |
| **Object storage** | Uploaded documents and generated exports | As needed to support uploads/exports |
| **Error monitoring** | Crash and failed-generation visibility only | Required (minimal scope) |
| **Payments (Stripe)** | Monetisation | Out of scope for v1 |
| **Product analytics** | Funnel and behavioural telemetry | Out of scope for v1 |

### Measuring Success Without Full Analytics

Product analytics are deliberately out of scope, so the two stated success criteria are measured as follows:

- **"No dead end from prompt to ZIP"** — observed through minimal error monitoring: every failed generation, provider failover exhaustion, and unrecoverable session error is captured and reviewed. A dead end is a monitored event, not a guess.
- **"Specs need no rewriting" and "parity checklist met"** — measured manually during the beta: a hand-scored parity checklist against the reference bundle, plus structured interviews with beta users who fed a generated bundle to a coding agent.

If either criterion proves unmeasurable by these means, adding product analytics is reconsidered before scaling the beta.

### Integration Rules

- Every external integration sits behind an internal interface with a defined failure mode; an outage degrades a feature, it never breaks the workflow (see P5).
- Web-fetched and document-derived content is untrusted input (see S3).
- All integrations are configured through validated environment configuration.
