# M9п gate — RESULT

Walked 2026-08-16T19:35:43.188Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: RED** — 1 problem(s), 70 state(s) captured, 0 console error(s).

## Problems

- `1257s` edit: no proposal card arrived after three attempts

## Prompt truncation (round 4 — the new red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-16T19:14:32.079Z`, when this walk began. The same log holds **0** earlier record(s) from before it — the pre-flight sends one unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence rather than a defect (`preflight/RUN-2-STATE.md`).

## Context packing (А-8, point 4)

12 packing record(s): the web research was shrunk in **0** and dropped entirely in **0** of them.

- context packing constitution provider=google tokens=20848/1000000 fixed=1112 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=22989/1000000 fixed=1777 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=26298/1000000 fixed=1531 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=30083/1000000 fixed=3135 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=20383/1000000 fixed=650 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=22116/1000000 fixed=365 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=4417/1000000 fixed=367 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=8835/1000000 fixed=367 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=8835/1000000 fixed=367 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=14390/1000000 fixed=344 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing chat-answer provider=ollama tokens=10536/11059 fixed=269 budget=36269ch rounds=3 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing solution provider=google tokens=29073/1000000 fixed=379 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **speckit constitution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **speckit requirements** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)
- **speckit solution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **speckit tasks** Rev 1 — needs_revision: 9 linter item(s), 7 model item(s)
- **brownfield constitution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **brownfield requirements** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)

## What happened

- `1s` — walking speckit-greenfield-v1 —
- `2s` speckit-greenfield-v1: badge «SpecKit · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Specify → 4 Plan → 5 Tasks → 6 Complete»
- `22s` speckit-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `22s` speckit-greenfield-v1: after a reload the header still reads «Interview»
- `34s` speckit-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `72s` speckit-greenfield-v1-constitution: 1 forward door(s) offered
- `88s` speckit-greenfield-v1-requirements: the answered round stayed in the feed, fixed
- `145s` speckit-greenfield-v1-requirements: 1 forward door(s) offered
- `159s` speckit-greenfield-v1-solution: the answered round stayed in the feed, fixed
- `218s` speckit-greenfield-v1-solution: 1 forward door(s) offered
- `233s` speckit-greenfield-v1-tasks: the answered round stayed in the feed, fixed
- `296s` speckit-greenfield-v1-tasks: 1 forward door(s) offered
- `297s` speckit-greenfield-v1: reached the terminal
- `298s` — walking myspec-brownfield-v1 —
- `298s` myspec-brownfield-v1: badge «MySpec · Brownfield · V1», steps «1 Interview → 2 Proposal → 3 Requirements → 4 Tasks → 5 Complete»
- `312s` myspec-brownfield-v1-interview: the answered round stayed in the feed, fixed
- `328s` myspec-brownfield-v1-constitution: the answered round stayed in the feed, fixed
- `370s` myspec-brownfield-v1-constitution: 1 forward door(s) offered
- `386s` myspec-brownfield-v1-requirements: the answered round stayed in the feed, fixed
- `460s` myspec-brownfield-v1-requirements: 2 forward door(s) offered
- `460s` myspec-brownfield-v1-requirements: took the terminal door, skipping the optional stage
- `462s` myspec-brownfield-v1: reached the terminal
- `462s` — the Edit chat —
- `463s` the Reference step offers 4 approved document(s)
- `464s` edit: the proposal is pinned to the local model «ollama» — Р-4 lives here
- `466s` edit: steps «1 Reference → 2 Describe → 3 Review → 4 Complete»
- `467s` edit: the Describe box opens on «I want to update spec constitution.md, spec.md, plan.md and tasks.md to »
- `474s` edit: the page says it is waiting for the first words (Р-4, А-9 п.3)
- `743s` edit: the page says it is waiting for the first words (Р-4, А-9 п.3)
- `1002s` edit: the page says it is waiting for the first words (Р-4, А-9 п.3)
- `1257s` — the model picker —
- `1257s` the picker offers: Auto, gemini-3.5-flash, qwen3:14b
- `1260s` the choice is persisted on the session: ollama
- `1260s` the choice survives a reload
- `1270s` the pinned model answered a chat message in 10.1 s

## Timings

- speckit-greenfield-v1-interview question round: 15 s
- speckit-greenfield-v1-constitution question round: 9.4 s
- speckit-greenfield-v1-constitution generation: 17.7 s
- speckit-greenfield-v1-constitution review: 18.1 s
- speckit-greenfield-v1-requirements question round: 13.5 s
- speckit-greenfield-v1-requirements generation: 29.9 s
- speckit-greenfield-v1-requirements review: 25.8 s
- speckit-greenfield-v1-solution question round: 12 s
- speckit-greenfield-v1-solution generation: 28.7 s
- speckit-greenfield-v1-solution review: 28.8 s
- speckit-greenfield-v1-tasks question round: 13 s
- speckit-greenfield-v1-tasks generation: 31 s
- speckit-greenfield-v1-tasks review: 29.3 s
- myspec-brownfield-v1-interview question round: 9.5 s
- myspec-brownfield-v1-constitution question round: 14 s
- myspec-brownfield-v1-constitution generation: 23.5 s
- myspec-brownfield-v1-constitution review: 17.6 s
- myspec-brownfield-v1-requirements question round: 14 s
- myspec-brownfield-v1-requirements generation: 28.4 s
- myspec-brownfield-v1-requirements review: 43.9 s
- edit proposal: 269.5 s
- edit proposal: 258.6 s
- edit proposal: 259.6 s
- local-model reply: 10.1 s

## Retries

- edit: the proposal was refused; retrying (2 of 3)
- edit: the proposal was refused; retrying (3 of 3)

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
- enabled  `mcq-option-primary_user-part_time_fundraiser` 
- enabled  `mcq-option-primary_user-busy_director` 
- enabled  `mcq-option-primary_user-board_member` 
- enabled  `mcq-other-primary_user` 
- enabled  `mcq-option-current_workflow_pain-spreadsheet_manual_emails` 
- enabled  `mcq-option-current_workflow_pain-calendar_scrambled_info` 
- enabled  `mcq-option-current_workflow_pain-mental_sticky_notes` 
- enabled  `mcq-other-current_workflow_pain` 
- enabled  `mcq-option-core_value_win-auto_draft_email` 
- enabled  `mcq-option-core_value_win-visual_pipeline` 
- enabled  `mcq-option-core_value_win-template_library` 
- enabled  `mcq-other-core_value_win` 
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
- enabled  `mcq-option-boundaries_and_out_of_scope-no_auto_sending` 
- enabled  `mcq-option-boundaries_and_out_of_scope-no_grant_writing` 
- enabled  `mcq-option-boundaries_and_out_of_scope-no_financial_tracking` 
- enabled  `mcq-other-boundaries_and_out_of_scope` 
- enabled  `mcq-option-data_sensitivity-basic_public_info` 
- enabled  `mcq-option-data_sensitivity-internal_strategy` 
- enabled  `mcq-option-data_sensitivity-highly_confidential` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-success_metric-zero_missed_deadlines` 
- enabled  `mcq-option-success_metric-time_saved_mondays` 
- enabled  `mcq-option-success_metric-easy_volunteer_handover` 
- enabled  `mcq-other-success_metric` 
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
- enabled  `review-item-checkbox-schema-template-contradiction` 
- enabled  `review-item-checkbox-state-machine-definition` 
- enabled  `review-item-checkbox-untestable-ux-gate` 
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
- enabled  `mcq-option-input_method-simple_form` 
- enabled  `mcq-option-input_method-forward_email` 
- enabled  `mcq-option-input_method-upload_spreadsheet` 
- enabled  `mcq-other-input_method` 
- enabled  `mcq-option-user_access-shared_access` 
- enabled  `mcq-option-user_access-admin_and_volunteer` 
- enabled  `mcq-other-user_access` 
- enabled  `mcq-option-draft_delivery-email_to_user` 
- enabled  `mcq-option-draft_delivery-web_dashboard` 
- enabled  `mcq-option-draft_delivery-drafts_folder` 
- enabled  `mcq-other-draft_delivery` 
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
- enabled  `review-item-checkbox-missing-timezone-attributes` 
- enabled  `review-item-checkbox-undefined-pipeline-order` 
- enabled  `review-item-checkbox-funder-intake-ambiguity` 
- enabled  `review-item-checkbox-undefined-email-templates` 
- enabled  `review-item-checkbox-grant-notes-exclusion` 
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
- enabled  `mcq-option-device_preference-desktop_heavy` 
- enabled  `mcq-option-device_preference-mobile_heavy` 
- enabled  `mcq-option-device_preference-both_equally` 
- enabled  `mcq-other-device_preference` 
- enabled  `mcq-option-integrations-email_integration` 
- enabled  `mcq-option-integrations-calendar_integration` 
- enabled  `mcq-option-integrations-stand_alone` 
- enabled  `mcq-other-integrations` 
- enabled  `mcq-option-user_count-solo_or_couple` 
- enabled  `mcq-option-user_count-small_team` 
- enabled  `mcq-option-user_count-fluid_volunteers` 
- enabled  `mcq-other-user_count` 
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
- enabled  `review-item-checkbox-smtp-mailto-contradiction` 
- enabled  `review-item-checkbox-smtp-recipient-boundary-vague` 
- enabled  `review-item-checkbox-sqlite-postgres-datetime-discrepancy` 
- enabled  `review-item-checkbox-use-zoneinfo-instead-of-pytz` 
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
- enabled  `mcq-option-mvp_scope-email_digest` 
- enabled  `mcq-option-mvp_scope-simple_dashboard` 
- enabled  `mcq-option-mvp_scope-auto_drafts` 
- enabled  `mcq-other-mvp_scope` 
- enabled  `mcq-option-timeline_constraints-upcoming_grant_cycle` 
- enabled  `mcq-option-timeline_constraints-standard_timeline` 
- enabled  `mcq-option-timeline_constraints-flexible_future` 
- enabled  `mcq-other-timeline_constraints` 
- enabled  `mcq-option-builder_profile-no_code_creator` 
- enabled  `mcq-option-builder_profile-hobbyist_coder` 
- enabled  `mcq-option-builder_profile-professional_developer` 
- enabled  `mcq-other-builder_profile` 
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
- enabled  `review-item-checkbox-linter-traceability-FR-2` 
- enabled  `review-item-checkbox-linter-traceability-FR-3` 
- enabled  `review-item-checkbox-linter-traceability-FR-4` 
- enabled  `review-item-checkbox-linter-traceability-FR-5` 
- enabled  `review-item-checkbox-linter-traceability-FR-6` 
- enabled  `review-item-checkbox-linter-traceability-FR-7` 
- enabled  `review-item-checkbox-linter-traceability-FR-8` 
- enabled  `review-item-checkbox-linter-traceability-FR-9` 
- enabled  `review-item-checkbox-integration-test-file-conflict` 
- enabled  `review-item-checkbox-missing-filename-t014` 
- enabled  `review-item-checkbox-missing-file-path-t017` 
- enabled  `review-item-checkbox-docker-setup-missing-creation` 
- enabled  `review-item-checkbox-untestable-performance-sla` 
- enabled  `review-item-checkbox-untestable-ui-click-validation` 
- enabled  `review-item-checkbox-main-file-concurrency-conflict` 
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
- enabled  `mcq-option-user_role_and_goal-sole_operator` 
- enabled  `mcq-option-user_role_and_goal-small_team` 
- enabled  `mcq-option-user_role_and_goal-board_members` 
- enabled  `mcq-other-user_role_and_goal` 
- enabled  `mcq-option-current_pain_points-spreadsheet_chaos` 
- enabled  `mcq-option-current_pain_points-calendar_clutter` 
- enabled  `mcq-option-current_pain_points-inbox_digging` 
- enabled  `mcq-other-current_pain_points` 
- enabled  `mcq-option-email_drafting_expectations-copy_paste_drafts` 
- enabled  `mcq-option-email_drafting_expectations-one_click_send` 
- enabled  `mcq-option-email_drafting_expectations-internal_reminders` 
- enabled  `mcq-other-email_drafting_expectations` 
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
- enabled  `mcq-option-boundaries_and_nogos-no_auto_sending` 
- enabled  `mcq-option-boundaries_and_nogos-no_grant_writing` 
- enabled  `mcq-option-boundaries_and_nogos-no_external_logins` 
- enabled  `mcq-other-boundaries_and_nogos` 
- enabled  `mcq-option-data_sensitivity-public_only` 
- enabled  `mcq-option-data_sensitivity-internal_contacts_and_notes` 
- enabled  `mcq-option-data_sensitivity-highly_sensitive_financials` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-success_metrics-zero_missed_deadlines` 
- enabled  `mcq-option-success_metrics-saved_volunteer_time` 
- enabled  `mcq-option-success_metrics-peace_of_mind` 
- enabled  `mcq-other-success_metrics` 
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
- enabled  `review-item-checkbox-unresolved-storage-architecture` 
- enabled  `review-item-checkbox-missing-email-templates` 
- enabled  `review-item-checkbox-vague-color-coding-rules` 
- enabled  `review-item-checkbox-ambiguous-optional-features` 
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
- enabled  `mcq-option-input_method-manual_entry` 
- enabled  `mcq-option-input_method-email_forward` 
- enabled  `mcq-option-input_method-spreadsheet_import` 
- enabled  `mcq-other-input_method` 
- enabled  `mcq-option-user_roles-flat_access` 
- enabled  `mcq-option-user_roles-owner_volunteer_split` 
- enabled  `mcq-option-user_roles-assigned_only` 
- enabled  `mcq-other-user_roles` 
- enabled  `mcq-option-background_actions-weekly_digest` 
- enabled  `mcq-option-background_actions-direct_alerts` 
- enabled  `mcq-option-background_actions-no_automation` 
- enabled  `mcq-other-background_actions` 
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
- enabled  `review-item-checkbox-missing-template-patterns` 
- enabled  `review-item-checkbox-vague-weekly-digest-urgency` 
- enabled  `review-item-checkbox-ics-generation-parameters` 
- enabled  `review-item-checkbox-funder-email-naming-mismatch` 
- enabled  `review-item-checkbox-weekly-digest-tracking-state` 
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

### 66-edit-proposing-2

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

### 67-edit-proposing-3

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

### 68-edit-no-proposal

position: **Review· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Try again
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

### 69-model-picked

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

### 70-model-answered

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
