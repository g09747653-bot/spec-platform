# M8п gate walk — result

Journey: prompt → interview → a document → a needs-revision board → request changes with a
subset → the writer’s paragraph → Rev N+1 → a re-review of the new bytes → a decision typed as
a sentence. Walked through a browser against the live provider chain. Idea: _A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails_

**Verdict: GREEN — no problems found**

Steps captured: 22 · wall clock: 28 min

## Problems

_None._

## Uncaught errors in the browser

- console: Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)

## Timings, per model call

- interview question round: 185.1 s
- constitution question round: 707.9 s
- rev-1 generation: 98.9 s
- rev-1 review: 100.4 s
- rev-2 generation: 376.1 s
- rev-2 review: 98.3 s

## Calls that had to be repeated

- constitution: the ask produced nothing; asking again (2 of 3)

## What happened, in order

- `3s` —— interview ——
- `263s` interview: the answered round stayed in the feed, fixed
- `265s` —— constitution ——
- `973s` constitution: the answered round stayed in the feed, fixed
- `1175s` rev-1: the pending board survived a reload, ticks and all
- `1175s` Rev 1: 2 Must Fix (all ticked), 2 recommendation(s) (none ticked)
- `1175s` Rev 1: the board carries 0 deterministic linter finding(s) and 4 from the model (task 114)
- `1175s` —— cycle 1 ——
- `1175s` cycle 1: sending back 2 point(s): undefined-end-to-end-scenarios, undetailed-code-style-guidelines
- `1177s` cycle 1: the page offers to apply the points — “The review sent this document back with 2 points ticked. Rewriting applies exactly those and leaves the rest as it stands.”
- `1177s` cycle 1: the ticked subset is exactly what was recorded (FR-010 AC-7)
- `1652s` rev-2: the pending board survived a reload, ticks and all
- `1652s` cycle 1: the writer said what it folded in
- `1652s` cycle 1: the new board reviews revision 2, and the earlier board is still there, decided (task 111)
- `1652s` Rev 2: the reviewer raised nothing — a valid answer, and nothing to select
- `1652s` the board raised nothing — there is no subset to send back, so the cycle ends here
- `1652s` deciding the board by typing a sentence, not by pressing the button
- `1656s` the typed sentence decided the board: “You accepted this feedback and moved on with the document as it stands.” (position was · review)
- `1656s` the gate the decision opens is open — the typed path is the button’s equal
- `1664s` 2 board(s) in the file's history, 0 still undecided — every cycle appended (task 111)

## The boards, as they were rendered and as they were stored

The review contract of Эталон §1.3 in its readable form: a verdict, a summary, two groups with
their default tick state, a confidence score on every point, and — below — what the database
holds for each board, including which points travelled with the decision.


### Rev 1 — the first board

- verdict: **Needs Revision**
- summary: The constitution document includes several useful sections such as Vision, Core Principles, Technology Constraints, Architecture Constraints, Testing Approaches, Coding Standards, Security Constraints, Performance Targets, and Integration Points. However, some parts are either vague or leave gaps that could confuse the development process.
- Must Fix (2): ambiguous-transparency-updates, undefined-end-to-end-scenarios
- Recommendations (2): undetailed-code-style-guidelines, unclear-permission-granularity
- ticked on arrival: ambiguous-transparency-updates, undefined-end-to-end-scenarios
- confidence badges: Confidence score 8/10 · Confidence score 9/10 · Confidence score 7/10 · Confidence score 7/10
- suggestions rendered: 4
- items marked as automated checks: 0

### Rev 2 — the board after cycle 1

- verdict: **Pass**
- summary: The revised constitution addresses both the specified requirements for enumerated end-to-end testing scenarios and inclusion of a specific code style guide like ESLint. The document adheres to the technical instructions provided without introducing new issues.
- Must Fix (0): _none_
- Recommendations (0): _none_
- ticked on arrival: _none_
- confidence badges: _none_
- suggestions rendered: 0
- items marked as automated checks: 0

- revision 1: **needs_revision**, decision `request_changes`, selected ["undefined-end-to-end-scenarios","undetailed-code-style-guidelines"], linter items 0, model items 4, note 461 chars

- revision 2: **pass**, decision `accept`, selected null, linter items 0, model items 0, note none

## Controls at every state

The Д-1/Р-3 liveness invariant, observed live rather than against a stub: every state below
lists its controls and how many of the session-moving ones were usable.


### 01-projects-empty

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `prompt-input` 
- enabled  `audience-non-technical` 
- enabled  `audience-technical` 
- enabled  `create-project` Start a session

session-moving controls live: **0** (none)

### 02-session-created

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 03-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `mcq-option-1-use-case-track-deadlines` 
- enabled  `mcq-option-1-use-case-compose-emails` 
- enabled  `mcq-option-1-use-case-manage-resources` 
- enabled  `mcq-other-1-use-case` 
- enabled  `mcq-option-2-current-pain-points-manual-tracking` 
- enabled  `mcq-option-2-current-pain-points-miss-deadlines` 
- enabled  `mcq-option-2-current-pain-points-poor-communication` 
- enabled  `mcq-other-2-current-pain-points` 
- enabled  `mcq-option-3-value-proposition-time-saver` 
- enabled  `mcq-option-3-value-proposition-increased-productivity` 
- enabled  `mcq-option-3-value-proposition-better-outcomes` 
- enabled  `mcq-other-3-value-proposition` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 04-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 05-interview-complete

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 06-constitution-collect

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 07-constitution-round

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `mcq-option-q1-constituent-prohibitions-o1-never-track-personal-information` 
- enabled  `mcq-option-q1-constituent-prohibitions-o2-never-autofill-emails-proposing-changes` 
- enabled  `mcq-other-q1-constituent-prohibitions` 
- enabled  `mcq-option-q2-data-sensitivity-level-o1-highly-sensitive` 
- enabled  `mcq-option-q2-data-sensitivity-level-o2-normal-business-data` 
- enabled  `mcq-other-q2-data-sensitivity-level` 
- enabled  `mcq-option-q3-initial-functionality-boundaries-o1-auto-file-reporting` 
- enabled  `mcq-option-q3-initial-functionality-boundaries-o2-integrating-with-accounting-software` 
- enabled  `mcq-other-q3-initial-functionality-boundaries` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 08-constitution-round-answered

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 09-constitution-generate

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (generate-spec, proceed, chat-message)

### 10-rev-1-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (stop-generation, proceed, chat-message)

### 11-rev-1-drafted

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **5** (approve-spec, request-changes, proceed, refine-instruction, chat-message)

### 12-rev-1-approved

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (generate-spec, proceed, refine-instruction, chat-message)

### 13-rev-1-review-board

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `review-item-checkbox-ambiguous-transparency-updates` 
- enabled  `review-item-checkbox-undefined-end-to-end-scenarios` 
- enabled  `review-item-checkbox-undetailed-code-style-guidelines` 
- enabled  `review-item-checkbox-unclear-permission-granularity` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **6** (review-accept, review-request-changes, review-ignore, proceed, refine-instruction, chat-message)

### 14-cycle-1-selection

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `review-item-checkbox-ambiguous-transparency-updates` 
- enabled  `review-item-checkbox-undefined-end-to-end-scenarios` 
- enabled  `review-item-checkbox-undetailed-code-style-guidelines` 
- enabled  `review-item-checkbox-unclear-permission-granularity` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **6** (review-accept, review-request-changes, review-ignore, proceed, refine-instruction, chat-message)

### 15-cycle-1-returned-to-generate

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `generate-spec` Apply the review points
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (generate-spec, proceed, refine-instruction, chat-message)

### 16-rev-2-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (stop-generation, proceed, refine-instruction, chat-message)

### 17-rev-2-drafted

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **5** (approve-spec, request-changes, proceed, refine-instruction, chat-message)

### 18-rev-2-approved

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (generate-spec, proceed, refine-instruction, chat-message)

### 19-rev-2-review-board

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `review-accept` Accept feedback
- **disabled** `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **5** (review-accept, review-ignore, proceed, refine-instruction, chat-message)

### 20-decided-by-typing

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (proceed, refine-instruction, chat-message)

### 21-stage-left

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 22-session-reopened

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-ambiguous-transparency-updates` 
- **disabled** `review-item-checkbox-undefined-end-to-end-scenarios` 
- **disabled** `review-item-checkbox-undetailed-code-style-guidelines` 
- **disabled** `review-item-checkbox-unclear-permission-granularity` 
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)