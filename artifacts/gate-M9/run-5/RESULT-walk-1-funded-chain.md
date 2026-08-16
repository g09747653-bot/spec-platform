# M9п gate — RESULT

Walked 2026-08-16T19:09:24.068Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: GREEN** — 0 problem(s), 69 state(s) captured, 0 console error(s).

## Problems

_None._

## Prompt truncation (round 4 — the new red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-16T19:01:41.563Z`, when this walk began. The same log holds **0** earlier record(s) from before it — the pre-flight sends one unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence rather than a defect (`preflight/RUN-2-STATE.md`).

## Context packing (А-8, point 4)

6 packing record(s): the web research was shrunk in **0** and dropped entirely in **0** of them.

- context packing constitution provider=google tokens=20839/1000000 fixed=1112 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=23210/1000000 fixed=1777 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=27111/1000000 fixed=1531 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=30610/1000000 fixed=3135 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=20381/1000000 fixed=650 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=21898/1000000 fixed=365 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **speckit constitution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **speckit requirements** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)
- **speckit solution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **speckit tasks** Rev 1 — needs_revision: 11 linter item(s), 4 model item(s)
- **brownfield constitution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **brownfield requirements** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)

## What happened

- `0s` — walking speckit-greenfield-v1 —
- `3s` speckit-greenfield-v1: badge «SpecKit · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Specify → 4 Plan → 5 Tasks → 6 Complete»
- `17s` speckit-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `18s` speckit-greenfield-v1: after a reload the header still reads «Interview»
- `34s` speckit-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `75s` speckit-greenfield-v1-constitution: 1 forward door(s) offered
- `90s` speckit-greenfield-v1-requirements: the answered round stayed in the feed, fixed
- `141s` speckit-greenfield-v1-requirements: 1 forward door(s) offered
- `158s` speckit-greenfield-v1-solution: the answered round stayed in the feed, fixed
- `204s` speckit-greenfield-v1-solution: 1 forward door(s) offered
- `218s` speckit-greenfield-v1-tasks: the answered round stayed in the feed, fixed
- `274s` speckit-greenfield-v1-tasks: 1 forward door(s) offered
- `276s` speckit-greenfield-v1: reached the terminal
- `276s` — walking myspec-brownfield-v1 —
- `277s` myspec-brownfield-v1: badge «MySpec · Brownfield · V1», steps «1 Interview → 2 Proposal → 3 Requirements → 4 Tasks → 5 Complete»
- `291s` myspec-brownfield-v1-interview: the answered round stayed in the feed, fixed
- `306s` myspec-brownfield-v1-constitution: the answered round stayed in the feed, fixed
- `343s` myspec-brownfield-v1-constitution: 1 forward door(s) offered
- `358s` myspec-brownfield-v1-requirements: the answered round stayed in the feed, fixed
- `411s` myspec-brownfield-v1-requirements: 2 forward door(s) offered
- `411s` myspec-brownfield-v1-requirements: took the terminal door, skipping the optional stage
- `413s` myspec-brownfield-v1: reached the terminal
- `413s` — the Edit chat —
- `414s` the Reference step offers 4 approved document(s)
- `415s` edit: steps «1 Reference → 2 Describe → 3 Review → 4 Complete»
- `415s` edit: the Describe box opens on «I want to update spec constitution.md, spec.md, plan.md and tasks.md to »
- `458s` edit: the model proposed changes to constitution.md, requirements.md, solution.md, tasks.md
- `459s` edit: 4 file(s) gained a revision — constitution → Rev 2, requirements → Rev 2, solution → Rev 2, tasks → Rev 2
- `459s` edit: every applied revision names the edit chat as its source (AC-4)
- `459s` — the model picker —
- `459s` the picker offers: Auto, gemini-3.5-flash, qwen3:14b
- `462s` the choice is persisted on the session: ollama
- `462s` the choice survives a reload
- `462s` the pinned model answered a chat message

## Timings

- speckit-greenfield-v1-interview question round: 9.5 s
- speckit-greenfield-v1-constitution question round: 13.7 s
- speckit-greenfield-v1-constitution generation: 24.6 s
- speckit-greenfield-v1-constitution review: 14.1 s
- speckit-greenfield-v1-requirements question round: 12.5 s
- speckit-greenfield-v1-requirements generation: 31.1 s
- speckit-greenfield-v1-requirements review: 19.1 s
- speckit-greenfield-v1-solution question round: 14 s
- speckit-greenfield-v1-solution generation: 28.7 s
- speckit-greenfield-v1-solution review: 16.1 s
- speckit-greenfield-v1-tasks question round: 12.5 s
- speckit-greenfield-v1-tasks generation: 31.1 s
- speckit-greenfield-v1-tasks review: 22.7 s
- myspec-brownfield-v1-interview question round: 9.4 s
- myspec-brownfield-v1-constitution question round: 13.5 s
- myspec-brownfield-v1-constitution generation: 19.5 s
- myspec-brownfield-v1-constitution review: 16.1 s
- myspec-brownfield-v1-requirements question round: 13 s
- myspec-brownfield-v1-requirements generation: 31.8 s
- myspec-brownfield-v1-requirements review: 20.1 s
- edit proposal: 40.6 s
- local-model reply: 0.1 s

## Retries

_None._

## Console errors

_None._

## Controls at every state (the liveness invariant)


### 01-speckit-greenfield-v1-picker

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
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

### 02-speckit-greenfield-v1-seeded

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 03-speckit-greenfield-v1-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-user_role-solo_director` 
- enabled  `mcq-option-user_role-part_time_fundraiser` 
- enabled  `mcq-option-user_role-small_team` 
- enabled  `mcq-other-user_role` 
- enabled  `mcq-option-current_pain_point-messy_spreadsheet` 
- enabled  `mcq-option-current_pain_point-calendar_clutter` 
- enabled  `mcq-option-current_pain_point-post_its_and_memory` 
- enabled  `mcq-other-current_pain_point` 
- enabled  `mcq-option-success_criteria-ready_to_send_drafts` 
- enabled  `mcq-option-success_criteria-automatic_weekly_digest` 
- enabled  `mcq-option-success_criteria-visual_countdown` 
- enabled  `mcq-other-success_criteria` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 04-speckit-greenfield-v1-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 05-speckit-greenfield-v1-resumed

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 06-speckit-greenfield-v1-after-interview

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 07-speckit-greenfield-v1-constitution-round

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-email_boundary-never_auto_send` 
- enabled  `mcq-option-email_boundary-approve_to_send` 
- enabled  `mcq-option-email_boundary-fully_automatic` 
- enabled  `mcq-other-email_boundary` 
- enabled  `mcq-option-data_sensitivity-basic_public_info` 
- enabled  `mcq-option-data_sensitivity-internal_strategy` 
- enabled  `mcq-option-data_sensitivity-confidential_attachments` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-initial_boundaries-no_grant_writing` 
- enabled  `mcq-option-initial_boundaries-no_budget_tracking` 
- enabled  `mcq-option-initial_boundaries-no_collaboration` 
- enabled  `mcq-other-initial_boundaries` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 08-speckit-greenfield-v1-constitution-round-answered

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 09-speckit-greenfield-v1-constitution-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 10-speckit-greenfield-v1-constitution-drafted

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 11-speckit-greenfield-v1-constitution-approved

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 12-speckit-greenfield-v1-constitution-review-board

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `review-item-checkbox-missing-urgency-thresholds` 
- enabled  `review-item-checkbox-unspecified-database-technology` 
- enabled  `review-item-checkbox-vague-visual-verification-gate` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 13-speckit-greenfield-v1-constitution-review-decided

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 14-speckit-greenfield-v1-constitution-left

position: **Specify· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 15-speckit-greenfield-v1-requirements-round

position: **Specify· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-input_output_method-simple_form` 
- enabled  `mcq-option-input_output_method-email_forwarding` 
- enabled  `mcq-option-input_output_method-document_upload` 
- enabled  `mcq-other-input_output_method` 
- enabled  `mcq-option-user_access-single_user` 
- enabled  `mcq-option-user_access-collaborative_team` 
- enabled  `mcq-option-user_access-shared_access` 
- enabled  `mcq-other-user_access` 
- enabled  `mcq-option-automation_style-monday_digest` 
- enabled  `mcq-option-automation_style-dashboard_only` 
- enabled  `mcq-option-automation_style-urgent_alerts` 
- enabled  `mcq-other-automation_style` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 16-speckit-greenfield-v1-requirements-round-answered

position: **Specify· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 17-speckit-greenfield-v1-requirements-generating

position: **Specify· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 18-speckit-greenfield-v1-requirements-drafted

position: **Specify· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 19-speckit-greenfield-v1-requirements-approved

position: **Specify· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 20-speckit-greenfield-v1-requirements-review-board

position: **Specify· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-import-mechanism` 
- enabled  `review-item-checkbox-missing-director-name-field` 
- enabled  `review-item-checkbox-missing-milestone-management-flow` 
- enabled  `review-item-checkbox-unspecified-email-templates` 
- enabled  `review-item-checkbox-undefined-export-json-structure` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Solution
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 21-speckit-greenfield-v1-requirements-review-decided

position: **Specify· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Proceed to Solution
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 22-speckit-greenfield-v1-requirements-left

position: **Plan· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 23-speckit-greenfield-v1-solution-round

position: **Plan· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-device_and_connectivity-desktop_only` 
- enabled  `mcq-option-device_and_connectivity-mobile_and_desktop` 
- enabled  `mcq-option-device_and_connectivity-offline_access` 
- enabled  `mcq-other-device_and_connectivity` 
- enabled  `mcq-option-integrations-copy_paste_only` 
- enabled  `mcq-option-integrations-direct_email_send` 
- enabled  `mcq-option-integrations-calendar_sync` 
- enabled  `mcq-other-integrations` 
- enabled  `mcq-option-users_and_access-single_user` 
- enabled  `mcq-option-users_and_access-small_team` 
- enabled  `mcq-option-users_and_access-read_only_sharing` 
- enabled  `mcq-other-users_and_access` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 24-speckit-greenfield-v1-solution-round-answered

position: **Plan· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 25-speckit-greenfield-v1-solution-generating

position: **Plan· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 26-speckit-greenfield-v1-solution-drafted

position: **Plan· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 27-speckit-greenfield-v1-solution-approved

position: **Plan· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 28-speckit-greenfield-v1-solution-review-board

position: **Plan· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-undefined-monday-digest` 
- enabled  `review-item-checkbox-mailto-limit-handling` 
- enabled  `review-item-checkbox-urgency-thresholds-missing` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 29-speckit-greenfield-v1-solution-review-decided

position: **Plan· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Proceed to Tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 30-speckit-greenfield-v1-solution-left

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 31-speckit-greenfield-v1-tasks-round

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-mvp_scope-manual_and_draft` 
- enabled  `mcq-option-mvp_scope-calendar_sync` 
- enabled  `mcq-option-mvp_scope-direct_send` 
- enabled  `mcq-other-mvp_scope` 
- enabled  `mcq-option-builder_profile-volunteer_coder` 
- enabled  `mcq-option-builder_profile-freelancer` 
- enabled  `mcq-option-builder_profile-nocode_maker` 
- enabled  `mcq-other-builder_profile` 
- enabled  `mcq-option-timeline_urgency-asap` 
- enabled  `mcq-option-timeline_urgency-next_cycle` 
- enabled  `mcq-option-timeline_urgency-no_rush` 
- enabled  `mcq-other-timeline_urgency` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 32-speckit-greenfield-v1-tasks-round-answered

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 33-speckit-greenfield-v1-tasks-generating

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 34-speckit-greenfield-v1-tasks-drafted

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 35-speckit-greenfield-v1-tasks-approved

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 36-speckit-greenfield-v1-tasks-review-board

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-linter-traceability-FR-1` 
- enabled  `review-item-checkbox-linter-traceability-FR-10` 
- enabled  `review-item-checkbox-linter-traceability-FR-11` 
- enabled  `review-item-checkbox-linter-traceability-FR-2` 
- enabled  `review-item-checkbox-linter-traceability-FR-3` 
- enabled  `review-item-checkbox-linter-traceability-FR-4` 
- enabled  `review-item-checkbox-linter-traceability-FR-5` 
- enabled  `review-item-checkbox-linter-traceability-FR-6` 
- enabled  `review-item-checkbox-linter-traceability-FR-7` 
- enabled  `review-item-checkbox-linter-traceability-FR-8` 
- enabled  `review-item-checkbox-linter-traceability-FR-9` 
- enabled  `review-item-checkbox-export-filename-date-format` 
- enabled  `review-item-checkbox-date-boundary-ambiguity` 
- enabled  `review-item-checkbox-untestable-performance-requirement` 
- enabled  `review-item-checkbox-mailto-safety-limits-ambiguity` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Finish and seal the session
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 37-speckit-greenfield-v1-tasks-review-decided

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Finish and seal the session
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 38-speckit-greenfield-v1-tasks-left

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 39-speckit-greenfield-v1-complete

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 40-myspec-brownfield-v1-picker

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `prompt-input` A tool that tracks which of a small char
- enabled  `audience-non-technical` 
- enabled  `audience-technical` 
- enabled  `methodology-auto` 
- enabled  `methodology-myspec-greenfield-v1` 
- enabled  `methodology-myspec-brownfield-v1` 
- enabled  `methodology-speckit-greenfield-v1` 
- enabled  `methodology-openspec-brownfield-v1` 
- enabled  `create-project` Start a session
- enabled  `project-row` A tool that tracks which of a small char
- enabled  `rename-project` Rename
- enabled  `duplicate-project` Duplicate
- enabled  `delete-project` Delete

session-moving controls live: **0** (none)

### 41-myspec-brownfield-v1-seeded

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 42-myspec-brownfield-v1-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-primary_user-volunteer` 
- enabled  `mcq-option-primary_user-director` 
- enabled  `mcq-option-primary_user-shared_team` 
- enabled  `mcq-other-primary_user` 
- enabled  `mcq-option-current_pain-spreadsheet` 
- enabled  `mcq-option-current_pain-calendar` 
- enabled  `mcq-option-current_pain-inbox` 
- enabled  `mcq-other-current_pain` 
- enabled  `mcq-option-killer_feature-email_drafts` 
- enabled  `mcq-option-killer_feature-visual_timeline` 
- enabled  `mcq-option-killer_feature-automatic_nagging` 
- enabled  `mcq-other-killer_feature` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 43-myspec-brownfield-v1-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 44-myspec-brownfield-v1-after-interview

position: **Proposal· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 45-myspec-brownfield-v1-constitution-round

position: **Proposal· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-email_safety_and_privacy-review_and_send_manually` 
- enabled  `mcq-option-email_safety_and_privacy-auto_send` 
- enabled  `mcq-option-email_safety_and_privacy-copy_to_clipboard` 
- enabled  `mcq-other-email_safety_and_privacy` 
- enabled  `mcq-option-out_of_scope_boundaries-avoid_proposal_writing` 
- enabled  `mcq-option-out_of_scope_boundaries-avoid_financial_tracking` 
- enabled  `mcq-option-out_of_scope_boundaries-avoid_donor_crm` 
- enabled  `mcq-other-out_of_scope_boundaries` 
- enabled  `mcq-option-success_criteria-zero_missed_deadlines` 
- enabled  `mcq-option-success_criteria-time_saved_on_admin` 
- enabled  `mcq-option-success_criteria-clean_overview` 
- enabled  `mcq-other-success_criteria` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 46-myspec-brownfield-v1-constitution-round-answered

position: **Proposal· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 47-myspec-brownfield-v1-constitution-generating

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 48-myspec-brownfield-v1-constitution-drafted

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 49-myspec-brownfield-v1-constitution-approved

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 50-myspec-brownfield-v1-constitution-review-board

position: **Proposal· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `review-item-checkbox-email-generation-mechanism` 
- enabled  `review-item-checkbox-ical-integration-scope` 
- enabled  `review-item-checkbox-database-schema-ambiguity` 
- enabled  `review-item-checkbox-draft-trigger-rules` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 51-myspec-brownfield-v1-constitution-review-decided

position: **Proposal· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 52-myspec-brownfield-v1-constitution-left

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 53-myspec-brownfield-v1-requirements-round

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-workflow_and_inputs-manual_entry_copy_paste` 
- enabled  `mcq-option-workflow_and_inputs-forward_emails` 
- enabled  `mcq-option-workflow_and_inputs-spreadsheet_upload` 
- enabled  `mcq-other-workflow_and_inputs` 
- enabled  `mcq-option-automation_trigger-automatic_draft_notification` 
- enabled  `mcq-option-automation_trigger-manual_trigger` 
- enabled  `mcq-option-automation_trigger-fully_automatic_sending` 
- enabled  `mcq-other-automation_trigger` 
- enabled  `mcq-option-user_permissions-shared_access` 
- enabled  `mcq-option-user_permissions-editor_vs_viewer` 
- enabled  `mcq-option-user_permissions-assigned_grants_only` 
- enabled  `mcq-other-user_permissions` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 54-myspec-brownfield-v1-requirements-round-answered

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 55-myspec-brownfield-v1-requirements-generating

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 56-myspec-brownfield-v1-requirements-drafted

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 57-myspec-brownfield-v1-requirements-approved

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 58-myspec-brownfield-v1-requirements-review-board

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-status-timestamp` 
- enabled  `review-item-checkbox-missing-email-templates` 
- enabled  `review-item-checkbox-missing-program-fields` 
- enabled  `review-item-checkbox-ambiguous-pending-items` 
- enabled  `review-item-checkbox-deadline-update-logic` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed-alternate-complete` Complete
- enabled  `proceed` Proceed to Tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 59-myspec-brownfield-v1-requirements-review-decided

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `proceed-alternate-complete` Complete
- enabled  `proceed` Proceed to Tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 60-myspec-brownfield-v1-requirements-left

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 61-myspec-brownfield-v1-complete

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` proposal.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-proposal.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 62-edit-project-page

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `tab-generate` Generate
- enabled  `tab-edit` Edit
- enabled  `filter-active` Active
- enabled  `filter-archived` Archived
- enabled  `filter-all` All
- enabled  `INPUT` 
- enabled  `INPUT` 
- enabled  `chat-search` 
- enabled  `chat-search-submit` Search
- enabled  `chat-row` A tool that tracks which of a small char
- enabled  `archive-chat` Archive
- enabled  `reference-constitution.md` 
- enabled  `reference-spec.md` 
- enabled  `reference-plan.md` 
- enabled  `reference-tasks.md` 
- enabled  `start-edit-chat` Start edit chat
- **disabled** `mcp-add-server` Add server

session-moving controls live: **0** (none)

### 63-edit-reference

position: **Reference**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 64-edit-describe

position: **Describe· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-q-edit-describe-describe-add` 
- enabled  `mcq-option-q-edit-describe-describe-change` 
- enabled  `mcq-other-q-edit-describe` 
- enabled  `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (mcq-submit, mcq-reply-toggle, download-export)

### 65-edit-proposing-1

position: **Review· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 66-edit-proposal

position: **Review· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `accept-diff` Approve and apply
- enabled  `reject-diff` Request changes
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (accept-diff, reject-diff, generate-spec, proceed, download-export)

### 67-edit-applied

position: **Review· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 68-model-picked

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)

### 69-model-answered

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Sending…
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` spec.md
- enabled  `specs-panel-open` plan.md
- enabled  `specs-panel-open` tasks.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-spec.md` Copy
- enabled  `copy-plan.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (download-export)
