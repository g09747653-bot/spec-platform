# Requirements — Spec Platform (MySpec-class SDD Tool)

> Governed by `constitution.md`. Where this document and the constitution disagree, the constitution wins.
> Acceptance criteria use EARS+ phrasing (`WHEN` / `IF` / `WHILE` … `THE system SHALL …`) and are written to be testable.

## Overview

### Purpose

A hosted web application that converts a plain-language prompt into a complete, agent-ready specification bundle through a guided, staged, multi-agent interview. The default output is the four-file parity bundle — `constitution.md`, `requirements.md`, `solution.md`, `tasks.md`. An optional Quality stage adds `quality.md` and enriches the four core files.

### Scope of v1

**In scope**

- Account creation and sign-in via OAuth (Google, GitHub).
- Project and session management: create, list, rename, delete, duplicate, resume.
- Prompt-driven session start, with document attachments as grounding context.
- A structured interview using single/multiple choice cards with a free-text escape hatch.
- Staged generation with per-stage collection, generation, per-file approval, and an automated review board.
- Conversational refinement of any generated spec, applied only after the owner accepts the proposed diff.
- Optional Quality stage, offered at the tasks review gate and re-selectable after completion.
- Export: full-bundle ZIP download and per-file copy to clipboard.
- Live web research during generation.
- Recovery from generation failure without loss of work.

**Out of scope for v1**

- CLI, IDE extension, mobile application, public API, MCP server.
- Collaboration: sharing, invited collaborators, comments, teams.
- Payments, subscriptions, usage-based billing.
- A dedicated revision-history browser or cross-project search UI. Revisions are persisted and diffs are shown during refinement, but there is no separate history-browsing screen.
- A recoverable trash bin. Deletion is permanent after confirmation.
- Reading a local codebase (brownfield analysis).
- Alternative output formats (OpenSpec, Spec-Kit).

### Primary Success Criteria

1. A generated bundle can be handed to a coding agent without rewriting.
2. The parity checklist against the reference bundle is met (enforced mechanically per constitution P3).

### Definitions

| Term | Meaning |
|---|---|
| **Project** | A named container owned by one user, holding one spec bundle and its session. |
| **Session** | The workflow run that produces a bundle; holds workflow state, question rounds, and answers. |
| **Stage** | One of `interview`, `constitution`, `requirements`, `solution`, `tasks`, `quality`, `complete`. |
| **Substage** | `collect`, `generate`, or `review` within a specification stage. |
| **Gate** | A code-evaluated predicate over persisted state that must be true for a forward transition. |
| **Information need** | A named unit of information a stage requires before it can generate; recorded against the round that satisfied it. |
| **Proposed change** | A computed but unpersisted modification to a spec file, awaiting the owner's diff decision. |
| **Parity bundle** | The four core files with no Quality content. |
| **Enrichment** | The Quality stage pass that rewrites the four core files with added depth. |
| **Stale enrichment** | Enriched artifacts whose source parity revision has been superseded. |
| **Re-entry** | Returning a `complete` session to an earlier stage in order to enable the Quality stage. |

## User Roles

v1 has a **single end-user role**. There is no admin, collaborator, viewer, or organisation role.

| Role | Description | Permissions |
|---|---|---|
| **Owner (authenticated user)** | Any signed-in user. Every project has exactly one owner, assigned at creation and immutable in v1. | Create, read, update, delete, duplicate, and export **only** their own projects, sessions, spec files, revisions, and attachments. |
| **Anonymous visitor** | An unauthenticated browser session. | May view public marketing/auth pages only. No access to any project data and no ability to start a session. |

Access rules:

- **AR-1:** Every data operation is authorised server-side against the authenticated owner (constitution S2). A client-supplied project, session, spec, or attachment identifier is never treated as proof of ownership.
- **AR-2:** A request for a resource owned by another user is indistinguishable from a request for a non-existent resource; both return "not found".
- **AR-3:** There is no role escalation path in v1, because no second role exists.

## Functional Requirements

### FR-001 — Authentication

The system SHALL allow users to sign in with a third-party OAuth identity provider and SHALL maintain an authenticated session.

**Acceptance criteria**

- AC-1: WHEN an anonymous visitor selects "Continue with Google" or "Continue with GitHub" THE system SHALL initiate the OAuth flow for that provider.
- AC-2: WHEN OAuth completes successfully for a first-time identity THE system SHALL create a user account and establish an authenticated session.
- AC-3: WHEN OAuth completes successfully for a returning identity THE system SHALL sign the user into the existing account without creating a duplicate.
- AC-4: IF OAuth fails or is cancelled THE system SHALL return the visitor to the sign-in screen with an explanatory message and SHALL NOT create an account.
- AC-5: WHEN an unauthenticated request targets any project route THE system SHALL redirect to sign-in and SHALL NOT disclose whether the requested resource exists.
- AC-6: WHEN a user signs out THE system SHALL invalidate the session such that a subsequent request with the prior session credential is unauthenticated.

### FR-002 — Project Lifecycle

The system SHALL allow an owner to create, list, rename, delete, and duplicate projects.

**Acceptance criteria**

- AC-1: WHEN an owner opens the project list THE system SHALL display only projects owned by that user, each showing its name, current stage, and last-updated time.
- AC-2: WHEN an owner creates a project THE system SHALL persist it with the owner's identifier and an initial workflow state of `interview`.
- AC-3: WHEN an owner renames a project THE system SHALL persist the new name and SHALL leave all spec content, revisions, and workflow state unchanged.
- AC-4: WHEN an owner requests deletion THE system SHALL require an explicit confirmation before deleting, and the confirmation SHALL state that deletion is permanent.
- AC-5: WHEN deletion is confirmed THE system SHALL permanently remove the project, its session, spec files, revisions, and attachments, and the project SHALL NOT appear in any subsequent listing.
- AC-6: WHEN an owner duplicates a project THE system SHALL create a new project owned by the same user containing a copy of all spec files at their current revisions and the workflow state at the time of duplication.
- AC-7: WHEN a duplicated project is modified THE system SHALL NOT alter the source project, and vice versa.
- AC-8: IF an owner attempts any project operation on a project they do not own THE system SHALL reject it per AR-2.

### FR-003 — Session Start From a Prompt

The system SHALL start a specification session from a free-text prompt.

**Acceptance criteria**

- AC-1: WHEN an owner submits a non-empty prompt THE system SHALL persist it as the session's grounding input and SHALL enter the `interview` stage.
- AC-2: IF the submitted prompt is empty or whitespace-only THE system SHALL reject submission and SHALL prompt the user to describe their idea.
- AC-3: WHEN a session starts THE system SHALL make the prompt available as context to every subsequent stage without requiring the user to restate it.

### FR-004 — Document Attachments as Context

The system SHALL allow an owner to attach documents that agents may read as grounding context, both at session start and at any later point in the session, and SHALL make the effect of late attachments visible.

**Acceptance criteria**

- AC-1: WHEN an owner attaches a document at session start THE system SHALL associate it with the session and make its parsed content available to all stages.
- AC-2: WHEN an owner attaches a document at any later point in the session THE system SHALL associate it with the session and make its parsed content available to the current and all subsequent stages.
- AC-3: WHEN a supported document (PDF, DOCX, XLSX, plain text, Markdown, or image) is uploaded THE system SHALL parse or extract its content and SHALL record parse success or failure.
- AC-4: IF an uploaded file exceeds the configured size limit or uses an unsupported type THE system SHALL reject the upload with a message naming the limit or the supported types, and SHALL NOT partially store the file.
- AC-5: IF parsing fails THE system SHALL inform the owner that the document could not be read and SHALL continue the session without it.
- AC-6: WHEN an owner views a session THE system SHALL list its attachments with name, type, parse status, and the stage at which each was attached.
- AC-7: WHEN an owner removes an attachment THE system SHALL exclude its content from subsequent generations.
- AC-8: Attachment content SHALL be treated as untrusted input and SHALL NOT be interpreted as instructions that alter workflow gates or stage order.
- AC-9: WHEN a document is attached after one or more spec files already have an approved revision THE system SHALL identify those files and SHALL inform the owner, by file name, which approved specs were generated without this document as context.
- AC-10: THE notification in AC-9 SHALL offer the owner a direct action to refine each affected file per FR-011, and THE system SHALL NOT automatically modify any approved file in response to a late attachment.
- AC-11: THE system SHALL record, for each spec revision, the set of attachments that were available as context when it was generated, so AC-9 is computed from persisted state rather than inferred.

### FR-005 — Structured Interview

The system SHALL conduct the interview using structured choice cards that always permit a free-text alternative, and SHALL not repeat information needs already satisfied.

**Acceptance criteria**

- AC-1: WHEN the system needs input during any collection substage THE system SHALL present one or more questions as choice cards rather than as unstructured chat prompts.
- AC-2: Each question SHALL be either single-select or multi-select and SHALL offer between 2 and 8 predefined options.
- AC-3: Every question SHALL additionally offer exactly one free-text "other" entry through which the user may supply an answer not present in the options.
- AC-4: WHEN a question set is displayed THE system SHALL wait for the user's submission and SHALL NOT generate a spec file in the same interaction.
- AC-5: WHEN the user submits answers THE system SHALL persist them, associated with the session, stage, and question round.
- AC-6: IF the user replies with free text instead of submitting the card THE system SHALL treat that reply as context and SHALL either ask a narrower follow-up question set or proceed if the reply covers the information need.
- AC-7: THE system SHALL persist every presented question round with its stage identifier, its round number, and the set of named information needs that round was intended to satisfy.
- AC-8: WHEN a round is answered THE system SHALL mark each of that round's information needs as satisfied for that stage.
- AC-9: WHILE an information need is marked satisfied for a stage THE system SHALL NOT present a further question round declaring that same information need, unless the user has requested a revision of that stage.
- AC-10: THE system SHALL present at most 3 question rounds per stage; WHEN that bound is reached THE system SHALL either proceed to generation if the stage's gate is satisfied, or state which information need remains unmet.
- AC-11: WHEN a session is resumed THE system SHALL derive satisfied information needs from persisted rounds rather than from conversational memory.

### FR-006 — Interview Exit Gate

The system SHALL permit the transition from `interview` to `constitution` only when the constitution's interview gate evaluates true.

**Acceptance criteria**

- AC-1: WHEN a transition out of `interview` is attempted THE system SHALL evaluate, in code, whether (a) grounding input is recorded, (b) at least one question round has been answered, and (c) a session summary is persisted.
- AC-2: IF any of those three conditions is false THE system SHALL refuse the transition and SHALL return a machine-readable reason naming the unmet condition.
- AC-3: WHEN all three conditions are true THE system SHALL permit the transition.
- AC-4: The gate SHALL be evaluated from persisted session state only, and an agent assertion that the interview is complete SHALL NOT by itself satisfy it.

### FR-007 — Staged Workflow Progression

The system SHALL advance through stages and substages only via code-enforced gates, in the order defined by the constitution.

**Acceptance criteria**

- AC-1: THE system SHALL maintain, for every session, a persisted current stage and substage.
- AC-2: WHEN a `collect → generate` transition is attempted THE system SHALL permit it only if that stage has at least one answered question round or accepted attachment-derived evidence.
- AC-3: WHEN a `generate → review` transition is attempted THE system SHALL permit it only if the stage's spec file has been approved by the user.
- AC-4: WHEN a transition to the next stage is attempted THE system SHALL permit it only if the current stage's review has been accepted or ignored by the user.
- AC-5: WHEN a backward transition within the same stage is requested THE system SHALL permit it unconditionally.
- AC-6: IF an out-of-order transition is attempted THE system SHALL reject it and SHALL return a reason identifying the unmet gate.
- AC-7: WHILE the Quality stage is disabled THE system SHALL transition `tasks → complete`; WHILE it is enabled THE system SHALL transition `tasks → quality → complete`.
- AC-8: THE transition `complete → quality` SHALL be a legal transition of the workflow, permitted only under the re-entry conditions defined in FR-020 AC-5, and SHALL be the only defined way to leave the `complete` state.
- AC-9: THE system SHALL display the current stage and remaining stages to the user at all times during a session.

### FR-008 — Spec Generation With Streaming

The system SHALL generate the stage's spec file and stream its content to the interface as it is produced.

**Acceptance criteria**

- AC-1: WHEN a stage enters `generate` THE system SHALL produce a markdown spec file for that stage.
- AC-2: WHILE generation is in progress THE system SHALL render output incrementally rather than only on completion.
- AC-3: WHEN generation completes THE system SHALL persist the content as a new revision of that stage's spec file and SHALL present it for approval.
- AC-4: Every generated file SHALL contain the section headings required for its spec type, in the required order, as defined by the section schema.
- AC-5: THE system SHALL generate exactly one spec file per stage per generation run.
- AC-6: WHEN generating any stage THE system SHALL use the session's prompt, all prior answers, attachment content, and all previously approved spec files as context.
- AC-7: IF generated output fails section-schema validation THE system SHALL treat the generation as failed and SHALL apply FR-018 rather than persisting a malformed spec as approved content.

### FR-009 — Per-File Approval

The system SHALL require an explicit user decision on every generated spec file before the workflow advances.

**Acceptance criteria**

- AC-1: WHEN a spec file is generated THE system SHALL present it with an approve action and a request-changes action.
- AC-2: WHILE no decision has been made THE system SHALL NOT advance to the review substage or any later stage.
- AC-3: WHEN the user approves THE system SHALL mark that revision approved and SHALL permit the `generate → review` transition.
- AC-4: WHEN the user requests changes THE system SHALL remain in `generate`, SHALL accept the user's change instruction, and SHALL produce a new unapproved revision which is itself presented for approval per AC-1.
- AC-5: A revision produced under AC-4 SHALL NOT be treated as approved content until the user approves it, and the prior revision SHALL remain in history.
- AC-6: WHEN the user asks an unrelated question while a decision is pending THE system SHALL answer it and SHALL keep the decision pending.
- AC-7: THE system SHALL accept the decision either from the file's action controls or from an equivalent instruction typed in chat.

### FR-010 — Automated Review Board

After a spec file is approved, the system SHALL produce an automated review of that spec and require a user decision on it.

**Acceptance criteria**

- AC-1: WHEN a stage enters `review` THE system SHALL generate review feedback for the approved spec file.
- AC-2: THE system SHALL classify each feedback item as either blocking ("must fix") or advisory ("recommendation"), and SHALL attach to each item a section reference, a description of the problem, and a concrete suggested change.
- AC-3: THE system SHALL state an overall outcome of either "pass" or "needs revision".
- AC-4: THE system SHALL present the user with accept, ignore, and request-changes actions and SHALL wait for one of them.
- AC-5: WHEN the user accepts or ignores THE system SHALL permit the transition to the next stage.
- AC-6: WHEN the user requests changes THE system SHALL return the stage to `generate` and SHALL revise the spec incorporating the selected feedback items.
- AC-7: WHEN the user selects a subset of feedback items THE system SHALL apply only the selected items and SHALL NOT apply unselected ones.
- AC-8: WHEN a revised spec is subsequently approved THE system SHALL produce a fresh review of the revised content.

### FR-011 — Conversational Refinement With Diff Approval

The system SHALL allow an owner to refine any existing spec file by giving a plain-language instruction, and SHALL persist the result only after the owner accepts the presented diff.

**Acceptance criteria**

- AC-1: WHEN an owner submits a plain-language change instruction targeting a spec file THE system SHALL compute the proposed new content for that file.
- AC-2: WHEN a proposed change is computed THE system SHALL present the difference between the current revision and the proposed content as a readable diff, and SHALL NOT persist a revision at this point.
- AC-3: THE system SHALL present the proposed change with an accept action and a reject action, and SHALL wait for one of them.
- AC-4: WHEN the owner accepts the proposed change THE system SHALL persist it as a new revision and SHALL leave prior revisions unmodified.
- AC-5: WHEN the owner rejects the proposed change THE system SHALL discard the proposal, SHALL create no revision, and the file's current content SHALL be byte-for-byte unchanged.
- AC-6: WHILE a proposed change is pending for a file THE system SHALL NOT apply another change to that same file and SHALL NOT advance the workflow.
- AC-7: THE system SHALL confine each proposed change to the file the instruction targets and SHALL NOT include modifications to other files in the bundle.
- AC-8: IF an instruction would remove a section required by the section schema THE system SHALL refuse to propose the change and SHALL explain which required section it would remove.
- AC-9: IF an instruction is ambiguous THE system SHALL ask a clarifying question rather than propose a guessed change.
- AC-10: WHEN an accepted refinement creates a new parity revision of a core file after enrichment has run THE system SHALL mark the enriched artifacts stale per FR-014.

### FR-012 — Spec Revision Persistence

The system SHALL persist every accepted version of every spec file as an immutable revision.

**Acceptance criteria**

- AC-1: WHEN spec content is written THE system SHALL append a new revision and SHALL NOT modify or delete an existing revision.
- AC-2: Each revision SHALL record its revision number, creation time, approval status, and whether it was produced by the parity path or by the Quality enrichment pass.
- AC-3: Each enrichment-produced revision SHALL record the parity revision it was derived from.
- AC-4: THE system SHALL be able to resolve, for any core file, its most recent pre-enrichment revision.
- AC-5: Revisions SHALL be retained for the life of the project and SHALL be deleted only when the project is deleted.
- AC-6: A rejected proposed change SHALL NOT produce a revision record.

### FR-013 — Optional Quality Stage

The system SHALL offer the Quality stage at the tasks review gate, disabled by default, and SHALL NOT offer it elsewhere during the forward workflow.

**Acceptance criteria**

- AC-1: WHEN the tasks review decision is accepted THE system SHALL present the user with an explicit choice to enable or skip the Quality stage.
- AC-2: THE default selection SHALL be "skip"; taking no action SHALL NOT enable the Quality stage.
- AC-3: THE system SHALL NOT present the Quality option at session start, in project settings, or on the export screen.
- AC-4: WHEN the user skips THE system SHALL transition `tasks → complete`.
- AC-5: WHEN the user enables THE system SHALL transition `tasks → quality`.
- AC-6: WHEN an owner re-enters a completed session THE system SHALL allow the Quality selection to be changed without restarting the session and without discarding existing content, and the resulting state transitions SHALL be those defined in FR-020 AC-5 through AC-9.

### FR-014 — Quality Stage Generation and Staleness

When enabled, the Quality stage SHALL produce `quality.md` and enrich the four core files, and SHALL never export stale enriched content.

**Acceptance criteria**

- AC-1: WHEN the Quality stage runs THE system SHALL produce a file named exactly `quality.md`.
- AC-2: `quality.md` SHALL contain a requirement→solution→task traceability matrix, expanded EARS+ acceptance criteria covering edge and negative cases, and a risk/assumption/open-question log.
- AC-3: THE traceability matrix SHALL reference only requirement, solution, and task identifiers that exist in the current bundle.
- AC-4: WHEN the Quality stage runs THE system SHALL write enriched revisions of the four core files and SHALL preserve their pre-enrichment revisions.
- AC-5: WHEN a core file gains a new parity revision after enrichment THE system SHALL mark the enriched artifacts and `quality.md` stale.
- AC-6: WHILE enriched artifacts are stale THE system SHALL refuse a Quality-mode export and SHALL offer to re-run enrichment.
- AC-7: WHEN the Quality stage is re-enabled and no core file has a newer parity revision THE system SHALL reuse the retained enriched artifacts without regenerating them.
- AC-8: Stale revisions SHALL remain in history and SHALL be excluded from every export path.

### FR-015 — Bundle Export as ZIP

The system SHALL allow an owner to download the bundle as a ZIP archive, and SHALL never block the download on an incomplete bundle.

**Acceptance criteria**

- AC-1: WHEN an owner requests a bundle download THE system SHALL produce a ZIP archive containing the bundle's markdown files.
- AC-2: WHILE the Quality stage is disabled and all four core files have an approved revision THE archive SHALL contain exactly `constitution.md`, `requirements.md`, `solution.md`, and `tasks.md`, each resolved to its most recent pre-enrichment revision.
- AC-3: WHILE the Quality stage is enabled and enrichment is current THE archive SHALL additionally contain `quality.md`, and the four core files SHALL be resolved to their enriched revisions.
- AC-4: THE system SHALL indicate, at the moment of download, which export mode was used.
- AC-5: THE archive SHALL contain no files other than those defined in AC-2 and AC-3.
- AC-6: IF one or more required spec files have no approved revision THE system SHALL still produce the archive, containing every file that does have an approved revision, and SHALL NOT refuse the export.
- AC-7: WHEN an archive is produced under AC-6 THE system SHALL display, in the interface at the moment of download, a manifest naming every file omitted for lack of an approved revision.
- AC-8: THE manifest in AC-7 SHALL be presented in the interface only and SHALL NOT be added as a file inside the archive, so that AC-5 continues to hold.
- AC-9: THE system SHALL NOT emit an empty or placeholder markdown file for a missing spec.
- AC-10: File names inside the archive SHALL match the fixed names above exactly, so that extraction into a `.specs/` directory requires no renaming.

### FR-016 — Copy a File to Clipboard

The system SHALL allow an owner to copy the full content of any single spec file to the clipboard.

**Acceptance criteria**

- AC-1: WHEN an owner triggers copy on a spec file THE system SHALL place that file's complete markdown content on the clipboard.
- AC-2: THE copied content SHALL be raw markdown, without UI decoration, truncation, or surrounding code fences.
- AC-3: WHEN the copy succeeds THE system SHALL confirm it visually.
- AC-4: IF the clipboard operation fails THE system SHALL inform the user and SHALL offer the raw content for manual selection.
- AC-5: THE copied content SHALL be the revision that the current export mode resolves to.

### FR-017 — Session Resume

The system SHALL allow an owner to resume an unfinished session at the exact point it stopped.

**Acceptance criteria**

- AC-1: WHEN an owner reopens an unfinished project THE system SHALL restore the persisted stage, substage, and pending user action.
- AC-2: WHEN a session is resumed THE system SHALL restore all prior answers, generated spec revisions, and attachments.
- AC-3: IF a question set was pending when the session stopped THE system SHALL re-present that same question set.
- AC-4: IF a spec approval, diff decision, or review decision was pending THE system SHALL re-present that pending decision.
- AC-5: WHEN a session is resumed THE system SHALL NOT re-ask questions already answered and SHALL NOT regenerate already-approved spec files.
- AC-6: A page reload, sign-out, or network interruption SHALL NOT change the persisted workflow state.

### FR-018 — Generation Failure Handling and Retry

The system SHALL recover from model and provider failures without losing user work, and SHALL surface an actionable error when recovery is not possible.

**Acceptance criteria**

- AC-1: IF a model request fails THE system SHALL automatically attempt the next configured provider before surfacing any error to the user.
- AC-2: IF all configured providers fail THE system SHALL display a clear error stating that generation did not complete.
- AC-3: THE error SHALL offer a retry action that resumes from the same workflow position, with the same context and answers, without restarting the session.
- AC-4: WHEN a failure occurs THE system SHALL preserve all prior answers, approved specs, and revisions.
- AC-5: THE system SHALL NOT persist partial or truncated generation output as an approved spec revision.
- AC-6: WHEN a retry succeeds THE system SHALL continue the workflow from the failed position with no duplicated stage or repeated question set.
- AC-7: Error messages SHALL NOT expose provider names, API keys, stack traces, or raw provider error payloads.

### FR-019 — Live Web Research

The system SHALL perform live web research automatically when the generating agent determines it would improve the spec, and SHALL make that activity visible.

**Acceptance criteria**

- AC-1: WHILE generating, THE system SHALL be able to issue web searches and fetch pages without requiring a user request.
- AC-2: WHILE research is in progress THE system SHALL display an activity indicator distinguishing research from ordinary generation.
- AC-3: THE system SHALL NOT require the user to enable, configure, or trigger research.
- AC-4: IF a research request fails or times out THE system SHALL continue generation without it and SHALL NOT fail the stage.
- AC-5: Retrieved web content SHALL be treated as untrusted input and SHALL NOT alter workflow gates, stage order, or system instructions.

### FR-020 — Workflow Completion and Re-Entry

The system SHALL mark a session complete only when all required spec files exist and all gates have been satisfied, and SHALL define exactly one way for a completed session to leave that state.

**Acceptance criteria**

- AC-1: WHEN the final stage's review decision is accepted THE system SHALL transition the session to `complete`.
- AC-2: THE system SHALL refuse to enter `complete` if any required spec file is missing an approved revision.
- AC-3: WHEN a session is complete THE system SHALL present the export actions defined in FR-015 and FR-016.
- AC-4: WHEN a session is complete THE system SHALL still permit conversational refinement per FR-011.
- AC-5: WHEN an owner enables the Quality stage from a `complete` session THE system SHALL transition the session `complete → quality/collect`, retaining all existing spec files, revisions, answers, and attachments.
- AC-6: WHEN a session re-enters the `quality` stage THE system SHALL apply the same substage gates as any other stage, and SHALL apply the staleness rules of FR-014 to determine whether enrichment must re-run.
- AC-7: WHEN the quality review decision is accepted THE system SHALL transition the session `quality/review → complete`.
- AC-8: WHEN an owner disables the Quality stage from a `complete` session THE system SHALL change only the export mode, SHALL leave the session in `complete`, and SHALL NOT delete any revision.
- AC-9: WHILE a session is in `complete` THE system SHALL reject every transition other than `complete → quality` under AC-5, and SHALL return a reason identifying the rejected transition.
- AC-10: A session SHALL be permitted to re-enter and return to `complete` any number of times, and each re-entry SHALL leave prior revisions intact.

## Non-Functional Requirements

### NFR-001 — Time to First Streamed Token

- **Target:** ≤ 3 seconds at the 95th percentile, measured from generation request to first rendered token.
- AC-1: WHEN a generation request is issued THE system SHALL render its first token within 3 seconds in at least 95% of measured requests.
- AC-2: IF the first token has not arrived within 3 seconds THE system SHALL display a progress state indicating work is ongoing.

### NFR-002 — Perceived Responsiveness

- **Target:** no user-visible operation exceeds 500 ms without feedback.
- AC-1: WHEN any user action takes longer than 500 ms THE system SHALL display progress, streaming output, or a skeleton state within that window.
- AC-2: WHILE generation is in progress THE interface SHALL remain interactive for navigation and reading.
- AC-3: THE interface SHALL never present a state in which no progress indication is visible while work is pending.

### NFR-003 — Durability of User Work

- **Target:** zero loss of answers, approved specs, or revisions across failure and reload.
- AC-1: WHEN a question round is answered THE system SHALL persist the answers before rendering the next step.
- AC-2: WHEN a spec revision is created THE system SHALL persist it before presenting it for approval.
- AC-3: WHEN a page reload, network interruption, provider failure, or sign-out occurs THE system SHALL retain 100% of previously persisted answers, revisions, and workflow state.

### NFR-004 — Generation Availability Through Failover

- **Target:** a single provider outage does not prevent generation.
- AC-1: WHEN the primary provider is unavailable THE system SHALL complete the request via a configured alternate provider without user intervention.
- AC-2: THE system SHALL surface a generation failure to the user only after every configured provider has been attempted.

### NFR-005 — Tenant Isolation

- **Target:** zero cross-user data access.
- AC-1: WHEN any project, session, spec, revision, or attachment is read or written THE system SHALL scope the operation to the authenticated owner at the query level.
- AC-2: WHEN a resource owned by another user is requested THE system SHALL respond as if it does not exist.
- AC-3: Ownership SHALL be verified server-side on every request, independent of any client-supplied identifier.

### NFR-006 — Secret Confidentiality

- **Target:** zero exposure of provider credentials to clients.
- AC-1: Provider API keys SHALL exist only in server-side runtime configuration.
- AC-2: THE system SHALL NOT include provider credentials in client bundles, network responses, logs, or error messages.
- AC-3: All model requests SHALL originate server-side.

### NFR-007 — Structural Conformance of Output

- **Target:** 100% of generated files conform to the section schema.
- AC-1: Every generated spec file SHALL contain its required section headings in the required order.
- AC-2: A default-mode export SHALL contain no Quality content and no file beyond the four core files, including on sessions where enrichment has already run.
- AC-3: Conformance SHALL be verified by an automated check that fails the build on violation.

### NFR-008 — Upload Limits and Isolation

- **Target:** enforced size and type limits; owner-only access.
- AC-1: THE system SHALL enforce a configured maximum file size and an allowed-type list on every upload.
- AC-2: Uploaded files SHALL be stored privately and SHALL be retrievable only by their owner.
- AC-3: IF a file violates a limit THE system SHALL reject it before storage.

### NFR-009 — Untrusted Content Handling

- **Target:** no injected content alters workflow control.
- AC-1: Content originating from attachments, web research, or model output SHALL NOT modify stage order, gate evaluation, or ownership checks.
- AC-2: Model-derived and externally-fetched content SHALL be validated against an expected schema before entering the domain layer.
- AC-3: Rendered untrusted content SHALL be escaped such that it cannot execute script in the browser.

### NFR-010 — Failure Observability

- **Target:** every unrecoverable failure is captured.
- AC-1: WHEN a generation fails after all providers are exhausted THE system SHALL record the event with enough context to diagnose it.
- AC-2: WHEN an unhandled application error occurs THE system SHALL record it.
- AC-3: Recorded diagnostics SHALL NOT contain provider credentials.

### NFR-011 — Browser Support

- **Target:** current desktop browsers.
- AC-1: THE system SHALL function correctly on the current and immediately previous major versions of Chrome, Firefox, Safari, and Edge on desktop.
- AC-2: Streaming generation, ZIP download, and clipboard copy SHALL work on all supported browsers.

### NFR-012 — Workflow Verifiability

- **Target:** 100% of stage/substage transitions — legal and illegal — covered by automated tests; zero I/O inside gate evaluation; zero live model calls in the automated suite.
- AC-1: Every workflow gate SHALL be implemented as a pure function of persisted workflow state, performing no network, database, filesystem, or model I/O at evaluation time.
- AC-2: THE workflow engine SHALL be executable in an automated test without instantiating the user interface, a real datastore, or any model provider client.
- AC-3: THE complete transition matrix SHALL be covered by automated tests, including every illegal transition, both the Quality-enabled and Quality-disabled orderings, and the `complete → quality → complete` re-entry cycle defined in FR-020.
- AC-4: WHEN a transition is rejected THE system SHALL return a machine-readable reason identifying the unmet gate, and that reason SHALL be assertable in a test.
- AC-5: No automated test SHALL require a live model provider call; provider behaviour SHALL be exercised through stubbed or recorded responses.
- AC-6: THE tests satisfying AC-3 through AC-5 SHALL be part of the build-blocking suite, such that a violation prevents merge.
- AC-7: Gate logic SHALL NOT be expressed in prompt text, and no gate outcome SHALL depend on model output.

## Data Requirements

### Entities

| Entity | Purpose | Key attributes |
|---|---|---|
| **User** | Account identity | id, external provider identity, email, display name, created-at |
| **Project** | Owned container for one bundle | id, owner id, name, created-at, updated-at |
| **Session** | Workflow run for a project | id, project id, initial prompt, summary, quality-enabled flag, completion count, created-at |
| **WorkflowState** | Current position and gates | session id, stage, substage, pending action, updated-at |
| **QuestionRound** | One presented question set | id, session id, stage, round number, questions, declared information needs, presented-at |
| **Answer** | User response to a round | id, question round id, selected option ids, free-text value, answered-at |
| **InformationNeed** | Named unit of required input | id, session id, stage, name, satisfied-by round id |
| **SpecFile** | A logical file in the bundle | id, project id, spec type, file name, current revision number |
| **SpecRevision** | Immutable content version | id, spec file id, revision number, content, approval status, origin (`parity`/`enrichment`), derived-from revision, context attachment ids, created-at |
| **ProposedChange** | Unpersisted refinement awaiting decision | id, spec file id, base revision number, proposed content, instruction, status (`pending`/`accepted`/`rejected`), created-at |
| **ReviewFeedback** | Automated review of a revision | id, spec revision id, outcome, items (severity, section, description, suggestion), decision, decided-at |
| **Attachment** | Uploaded grounding document | id, session id, file name, mime type, size, storage key, parse status, extracted text, attached-at-stage, uploaded-at |
| **ExportRecord** | A performed export | id, project id, mode (`default`/`quality`), file list, omitted file list, created-at |

### Relationships

- A User owns many Projects; a Project has exactly one owner (immutable in v1).
- A Project has exactly one Session and many SpecFiles.
- A Session has one WorkflowState, many QuestionRounds, many InformationNeeds, and many Attachments.
- A QuestionRound declares many InformationNeeds and has many Answers.
- A SpecFile has many SpecRevisions and at most one pending ProposedChange.
- Each SpecRevision may have one ReviewFeedback.
- An enrichment SpecRevision references exactly one parity SpecRevision as its derivation source.

### Data Rules

- **DR-1:** Every Project, Session, SpecFile, SpecRevision, ProposedChange, and Attachment SHALL carry an ownership path resolvable to exactly one User.
- **DR-2:** SpecRevision records SHALL be immutable after creation; corrections create a new revision.
- **DR-3:** Revision numbers SHALL be monotonically increasing per SpecFile, with no gaps or reuse.
- **DR-4:** Spec file names SHALL be constrained to `constitution.md`, `requirements.md`, `solution.md`, `tasks.md`, and `quality.md`.
- **DR-5:** Answers SHALL retain both the selected option identifiers and any free-text value, so the interview record remains reconstructable.
- **DR-6:** Deleting a Project SHALL cascade to its Session, WorkflowState, QuestionRounds, Answers, InformationNeeds, SpecFiles, SpecRevisions, ProposedChanges, ReviewFeedback, Attachments, and stored attachment objects.
- **DR-7:** Deletion SHALL be permanent; v1 provides no recovery mechanism, and the confirmation dialog SHALL state this.
- **DR-8:** Extracted attachment text SHALL be stored so that re-parsing is not required on every generation.
- **DR-9:** The stale flag on enrichment revisions SHALL be derivable from revision metadata rather than stored as an independent source of truth.
- **DR-10:** A ProposedChange SHALL never be readable as spec content; only accepted changes become SpecRevisions.
- **DR-11:** At most one ProposedChange per SpecFile SHALL be in `pending` status at any time.
- **DR-12:** Each SpecRevision SHALL record the attachment identifiers available as context at generation time, so late-attachment impact (FR-004 AC-9) is computed from stored data.
- **DR-13:** An InformationNeed SHALL be uniquely identified within its session and stage, so satisfaction is checkable without natural-language comparison.
- **DR-14:** Re-entry from `complete` SHALL NOT delete or supersede any existing revision; the workflow state changes but the revision history is append-only across re-entries.
- **DR-15:** No user-identifying data SHALL be required beyond what the OAuth provider returns.

## Integration Requirements

### IR-001 — LLM Providers (Anthropic, OpenAI, Google)

- The system SHALL access all three providers exclusively through one internal interface supporting message exchange, token streaming, and tool invocation.
- IR-001-AC-1: WHEN a generation is requested THE system SHALL select a configured provider and stream its output.
- IR-001-AC-2: IF the selected provider returns an error or times out THE system SHALL retry with the next configured provider automatically.
- IR-001-AC-3: THE system SHALL NOT expose provider-specific response shapes outside the adapter layer.
- IR-001-AC-4: Provider selection and ordering SHALL be configuration-driven, changeable without code modification.
- IR-001-AC-5: THE adapter interface SHALL be substitutable with a test double that requires no network access.

### IR-002 — OAuth Identity Providers (Google, GitHub)

- IR-002-AC-1: THE system SHALL support sign-in through both Google and GitHub.
- IR-002-AC-2: WHEN an identity provider is unavailable THE system SHALL display an error and SHALL keep the alternative provider usable.
- IR-002-AC-3: THE system SHALL match returning identities to existing accounts rather than creating duplicates.

### IR-003 — Web Search and Fetch

- IR-003-AC-1: THE system SHALL be able to issue search queries and fetch page content during generation.
- IR-003-AC-2: IF the research service fails or times out THE system SHALL continue generation without it.
- IR-003-AC-3: Fetched content SHALL be size-bounded before being passed to a model.

### IR-004 — Document Parsing

- IR-004-AC-1: THE system SHALL extract text from PDF, DOCX, XLSX, plain text, and Markdown uploads.
- IR-004-AC-2: THE system SHALL accept image uploads and make them available to vision-capable models.
- IR-004-AC-3: IF extraction fails THE system SHALL record the failure against the attachment and SHALL notify the owner.

### IR-005 — Object Storage

- IR-005-AC-1: THE system SHALL store uploaded files in private object storage.
- IR-005-AC-2: Stored objects SHALL NOT be publicly addressable.
- IR-005-AC-3: WHEN a project is deleted THE system SHALL delete its stored objects.

### IR-006 — Error Monitoring

- IR-006-AC-1: THE system SHALL report unhandled errors and exhausted-failover generation failures to an error monitoring service.
- IR-006-AC-2: Reports SHALL exclude credentials and SHALL avoid transmitting full spec content.
- IR-006-AC-3: IF the monitoring service is unavailable THE system SHALL continue operating normally.

### Cross-Cutting Integration Rules

- **IR-X1:** Every integration SHALL sit behind an internal interface with a defined failure mode; an outage SHALL degrade a feature rather than break the workflow.
- **IR-X2:** All integration credentials and endpoints SHALL be supplied through validated environment configuration.
- **IR-X3:** No integration SHALL be invoked directly from presentation-layer code.
- **IR-X4:** Every integration interface SHALL be replaceable by a test double, so that no automated test depends on a live third-party call.
