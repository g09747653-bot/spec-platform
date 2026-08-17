# M10п gate — RESULT

Walked 2026-08-17T08:39:44.483Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: RED** — 1 problem(s), 45 state(s) captured, 0 console error(s).

## Problems

- `374s` the walk threw: column r.status does not exist

## Prompt truncation (round 4 — the new red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-17T08:33:30.405Z`, when this walk began. The same log holds **1** earlier record(s) from before it — the pre-flight sends one unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence rather than a defect (`preflight/RUN-2-STATE.md`).

## Structural rejections (M10п — the second red condition)

`generated document rejected on structure` records: **0**. The milestone asks for zero: a retry that succeeds hides the first sample, and the first sample is what says whether the local link can hold the contract.

_None._

## Context packing (А-8, point 4)

5 packing record(s): the web research was shrunk in **1** and dropped entirely in **0** of them.

- context packing constitution provider=google tokens=20115/1000000 fixed=388 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=23038/1000000 fixed=470 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole feedback=whole
- context packing requirements provider=google tokens=22740/1000000 fixed=365 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=28559/1000000 fixed=400 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=35709/1000000 fixed=340 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=64934(-2206)

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **constitution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **constitution** Rev 2 — pass: 0 linter item(s), 2 model item(s)
- **requirements** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **solution** Rev 1 — needs_revision: 0 linter item(s), 6 model item(s)
- **tasks** Rev 1 — needs_revision: 0 linter item(s), 2 model item(s)

## What happened

- `1s` — walking myspec-greenfield-v1 —
- `3s` myspec-greenfield-v1: badge «MySpec · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Requirements → 4 Solution → 5 Tasks → 6 Complete»
- `18s` myspec-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `19s` myspec-greenfield-v1: after a reload the header still reads «Interview»
- `34s` myspec-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `128s` myspec-greenfield-v1-constitution: the revision was re-reviewed against the points that were ticked
- `129s` myspec-greenfield-v1-constitution: 1 forward door(s) offered
- `142s` myspec-greenfield-v1-requirements: the answered round stayed in the feed, fixed
- `198s` myspec-greenfield-v1-requirements: 1 forward door(s) offered
- `209s` myspec-greenfield-v1-solution: the answered round stayed in the feed, fixed
- `291s` myspec-greenfield-v1-solution: 1 forward door(s) offered
- `306s` myspec-greenfield-v1-tasks: the answered round stayed in the feed, fixed
- `371s` myspec-greenfield-v1-tasks: 1 forward door(s) offered
- `373s` myspec-greenfield-v1: reached the terminal
- `373s` — the completion panel —
- `373s` completion: bundle «a-tool-that-tracks-which-of-a-small-charity-s-gr», 4

## Timings

- myspec-greenfield-v1-interview question round: 10 s
- myspec-greenfield-v1-constitution question round: 13.1 s
- myspec-greenfield-v1-constitution generation: 30.4 s
- myspec-greenfield-v1-constitution review: 19.2 s
- myspec-greenfield-v1-constitution-rev2 generation: 26.4 s
- myspec-greenfield-v1-requirements question round: 11 s
- myspec-greenfield-v1-requirements generation: 36.4 s
- myspec-greenfield-v1-requirements review: 18.1 s
- myspec-greenfield-v1-solution question round: 8 s
- myspec-greenfield-v1-solution generation: 51.8 s
- myspec-greenfield-v1-solution review: 28.3 s
- myspec-greenfield-v1-tasks question round: 12.5 s
- myspec-greenfield-v1-tasks generation: 48.1 s
- myspec-greenfield-v1-tasks review: 15.1 s

## Retries

_None._

## Console errors

_None._

## Controls at every state (the liveness invariant)


### 01-myspec-greenfield-v1-picker

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `prompt-input` A tool that tracks which of a small char
- enabled  `audience-non-technical` 
- enabled  `audience-technical` 
- enabled  `methodology-auto` 
- enabled  `methodology-myspec-greenfield-v1` 
- enabled  `methodology-myspec-brownfield-v1` 
- enabled  `methodology-speckit-greenfield-v1` 
- enabled  `methodology-openspec-brownfield-v1` 
- enabled  `create-project` Start a session

session-moving controls live: **0** (none)

### 02-myspec-greenfield-v1-seeded

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 03-myspec-greenfield-v1-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `mcq-option-user_role_and_goal-lone_fundraiser` 
- enabled  `mcq-option-user_role_and_goal-charity_director` 
- enabled  `mcq-option-user_role_and_goal-shared_team` 
- enabled  `mcq-other-user_role_and_goal` 
- enabled  `mcq-option-current_pain_points-spreadsheet_pain` 
- enabled  `mcq-option-current_pain_points-calendar_pain` 
- enabled  `mcq-option-current_pain_points-memory_pain` 
- enabled  `mcq-other-current_pain_points` 
- enabled  `mcq-option-value_proposition-one_click_drafting` 
- enabled  `mcq-option-value_proposition-email_digest` 
- enabled  `mcq-option-value_proposition-history_tracking` 
- enabled  `mcq-other-value_proposition` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 04-myspec-greenfield-v1-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 05-myspec-greenfield-v1-resumed

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 06-myspec-greenfield-v1-after-interview

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 07-myspec-greenfield-v1-constitution-round

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `mcq-option-data_sensitivity-public_only` 
- enabled  `mcq-option-data_sensitivity-draft_details` 
- enabled  `mcq-option-data_sensitivity-financial_private` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-boundaries_and_rules-auto_send` 
- enabled  `mcq-option-boundaries_and_rules-crm_bloat` 
- enabled  `mcq-option-boundaries_and_rules-no_external_scraping` 
- enabled  `mcq-other-boundaries_and_rules` 
- enabled  `mcq-option-success_definition-quick_review` 
- enabled  `mcq-option-success_definition-collaborative_hub` 
- enabled  `mcq-option-success_definition-perfect_history` 
- enabled  `mcq-other-success_definition` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 08-myspec-greenfield-v1-constitution-round-answered

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 09-myspec-greenfield-v1-constitution-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 10-myspec-greenfield-v1-constitution-drafted

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 11-myspec-greenfield-v1-constitution-approved

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 12-myspec-greenfield-v1-constitution-review-board

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `review-item-checkbox-auth-mechanism-gap` 
- enabled  `review-item-checkbox-calendar-feed-auth` 
- enabled  `review-item-checkbox-draft-log-used-tracking` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 13-myspec-greenfield-v1-constitution-changes-requested

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `review-item-checkbox-auth-mechanism-gap` 
- enabled  `review-item-checkbox-calendar-feed-auth` 
- enabled  `review-item-checkbox-draft-log-used-tracking` 
- enabled  `review-accept` Accept feedback
- **disabled** `review-request-changes` Sending…
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (review-accept, review-ignore, proceed, download-export)

### 14-myspec-greenfield-v1-constitution-rev2-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 15-myspec-greenfield-v1-constitution-rev2-approved

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `go-back` Go back to previous step
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 16-myspec-greenfield-v1-constitution-rev2-review-board

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `review-item-checkbox-draft-log-used-tracking` 
- enabled  `review-item-checkbox-diagram-cardinality-notation` 
- enabled  `review-accept` Accept feedback
- **disabled** `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `go-back` Go back to previous step
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (review-accept, review-ignore, proceed, download-export)

### 17-myspec-greenfield-v1-constitution-review-decided

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `go-back` Go back to previous step
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 18-myspec-greenfield-v1-constitution-left

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `go-back` Go back to previous step
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 19-myspec-greenfield-v1-requirements-round

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-core_workflow-manual_entry_and_copy` 
- enabled  `mcq-option-core_workflow-spreadsheet_import` 
- enabled  `mcq-option-core_workflow-direct_send` 
- enabled  `mcq-other-core_workflow` 
- enabled  `mcq-option-automation_and_alerts-no_background_automation` 
- enabled  `mcq-option-automation_and_alerts-weekly_email_digest` 
- enabled  `mcq-option-automation_and_alerts-automatic_funder_reminders` 
- enabled  `mcq-other-automation_and_alerts` 
- enabled  `mcq-option-user_collaboration-single_shared_view` 
- enabled  `mcq-option-user_collaboration-assigned_grants` 
- enabled  `mcq-option-user_collaboration-read_only_observers` 
- enabled  `mcq-other-user_collaboration` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `go-back` Go back to previous step
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 20-myspec-greenfield-v1-requirements-round-answered

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `go-back` Go back to previous step
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 21-myspec-greenfield-v1-requirements-generating

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `go-back` Go back to previous step
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 22-myspec-greenfield-v1-requirements-drafted

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 23-myspec-greenfield-v1-requirements-approved

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 24-myspec-greenfield-v1-requirements-review-board

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-funder-deletion-contradiction` 
- enabled  `review-item-checkbox-calendar-export-null-amount` 
- enabled  `review-item-checkbox-draft-log-api-endpoint` 
- enabled  `review-item-checkbox-closed-status-prompt` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Solution
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 25-myspec-greenfield-v1-requirements-review-decided

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Proceed to Solution
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 26-myspec-greenfield-v1-requirements-left

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 27-myspec-greenfield-v1-solution-round

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-device_and_internet-desktop_only` 
- enabled  `mcq-option-device_and_internet-mobile_friendly` 
- enabled  `mcq-other-device_and_internet` 
- enabled  `mcq-option-tool_connections-manual_copy` 
- enabled  `mcq-option-tool_connections-email_integration` 
- enabled  `mcq-option-tool_connections-calendar_sync` 
- enabled  `mcq-other-tool_connections` 
- enabled  `mcq-option-user_collaboration-single_user` 
- enabled  `mcq-option-user_collaboration-small_team` 
- enabled  `mcq-option-user_collaboration-rotating_volunteers` 
- enabled  `mcq-other-user_collaboration` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 28-myspec-greenfield-v1-solution-round-answered

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 29-myspec-greenfield-v1-solution-generating

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 30-myspec-greenfield-v1-solution-drafted

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 31-myspec-greenfield-v1-solution-approved

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 32-myspec-greenfield-v1-solution-review-board

position: **Solution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-status-code-typo` 
- enabled  `review-item-checkbox-prompt-status-mapping` 
- enabled  `review-item-checkbox-sequential-status-validation` 
- enabled  `review-item-checkbox-funder-notes-schema-mismatch` 
- enabled  `review-item-checkbox-password-hashing-discrepancy` 
- enabled  `review-item-checkbox-sqlite-recursive-trigger-loop` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 33-myspec-greenfield-v1-solution-review-decided

position: **Solution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Proceed to Tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 34-myspec-greenfield-v1-solution-left

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 35-myspec-greenfield-v1-tasks-round

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-v1_features-view_deadlines` 
- enabled  `mcq-option-v1_features-one_click_copy` 
- enabled  `mcq-option-v1_features-add_edit_deadlines` 
- enabled  `mcq-option-v1_features-automatic_sending` 
- enabled  `mcq-other-v1_features` 
- enabled  `mcq-option-builder_profile-no_code_volunteer` 
- enabled  `mcq-option-builder_profile-junior_coder` 
- enabled  `mcq-option-builder_profile-pro_coder` 
- enabled  `mcq-option-builder_profile-nobody_yet` 
- enabled  `mcq-other-builder_profile` 
- enabled  `mcq-option-launch_timeline-upcoming_grant_cycle` 
- enabled  `mcq-option-launch_timeline-flexible_timeline` 
- enabled  `mcq-option-launch_timeline-immediate_need` 
- enabled  `mcq-other-launch_timeline` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 36-myspec-greenfield-v1-tasks-round-answered

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 37-myspec-greenfield-v1-tasks-generating

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 38-myspec-greenfield-v1-tasks-drafted

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 39-myspec-greenfield-v1-tasks-approved

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 40-myspec-greenfield-v1-tasks-review-board

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-patch-drafts-endpoint` 
- enabled  `review-item-checkbox-missing-application-deletion` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Finish and seal the session
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 41-myspec-greenfield-v1-tasks-review-decided

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Finish and seal the session
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 42-myspec-greenfield-v1-tasks-left

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `completion-edit` Edit
- enabled  `completion-download` Download
- enabled  `generate-ai-prompt` Generate AI Prompt
- enabled  `build-with-lovable` Copy & open Lovable
- enabled  `build-with-bolt` Copy & open Bolt
- enabled  `build-with-replit` Copy & open Replit
- enabled  `proceed-alternate-quality` Quality
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 43-myspec-greenfield-v1-complete

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `completion-edit` Edit
- enabled  `completion-download` Download
- enabled  `generate-ai-prompt` Generate AI Prompt
- enabled  `build-with-lovable` Copy & open Lovable
- enabled  `build-with-bolt` Copy & open Bolt
- enabled  `build-with-replit` Copy & open Replit
- enabled  `proceed-alternate-quality` Quality
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 44-completion-panel

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `completion-edit` Edit
- enabled  `completion-download` Download
- enabled  `generate-ai-prompt` Generate AI Prompt
- enabled  `build-with-lovable` Copy & open Lovable
- enabled  `build-with-bolt` Copy & open Bolt
- enabled  `build-with-replit` Copy & open Replit
- enabled  `proceed-alternate-quality` Quality
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 45-handoff-prompt

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-auth-mechanism-gap` 
- **disabled** `review-item-checkbox-calendar-feed-auth` 
- **disabled** `review-item-checkbox-draft-log-used-tracking` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `completion-edit` Edit
- enabled  `completion-download` Download
- enabled  `generate-ai-prompt` Generate AI Prompt
- enabled  `build-with-lovable` Copy & open Lovable
- enabled  `build-with-bolt` Copy & open Bolt
- enabled  `build-with-replit` Copy & open Replit
- enabled  `handoff-prompt` Build the project specified by the bundl
- enabled  `copy-handoff-prompt` Copy prompt
- enabled  `proceed-alternate-quality` Quality
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-diff` Diff
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)
