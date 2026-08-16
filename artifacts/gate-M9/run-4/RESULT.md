# M9п gate — RESULT

Walked 2026-08-16T16:44:26.482Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: RED** — 2 problem(s), 61 state(s) captured, 3 console error(s).

## Problems

- `4960s` myspec-brownfield-v1: could not collect for requirements
- `5297s` edit: no proposal card arrived after three attempts

## Prompt truncation (round 4 — the new red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-16T15:16:05.626Z`, when this walk began. The same log holds **4** earlier record(s) from before it — the pre-flight sends one unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence rather than a defect (`preflight/RUN-2-STATE.md`).

## Context packing (А-8, point 4)

25 packing record(s): the web research was shrunk in **4** and dropped entirely in **0** of them.

- context packing constitution provider=google tokens=9174/1000000 fixed=1112 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=9174/1000000 fixed=1112 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=9174/1000000 fixed=1112 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=9174/1000000 fixed=1112 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=ollama tokens=9174/11059 fixed=1112 budget=31915ch rounds=2 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=22553/1000000 fixed=1777 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=22553/1000000 fixed=1777 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=22553/1000000 fixed=1777 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=22553/1000000 fixed=1777 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=ollama tokens=11012/11059 fixed=1777 budget=31249ch rounds=3 prompt=whole answers=whole attachments=whole approved-specs=whole research=27017(-39253)
- context packing solution provider=google tokens=23911/1000000 fixed=1531 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=23911/1000000 fixed=1531 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=23911/1000000 fixed=1531 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=23911/1000000 fixed=1531 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=ollama tokens=11010/11059 fixed=1531 budget=32099ch rounds=3 prompt=whole answers=whole attachments=whole approved-specs=whole research=22415(-43855)
- context packing tasks provider=google tokens=27018/1000000 fixed=3135 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=27018/1000000 fixed=3135 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=27018/1000000 fixed=3135 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=27018/1000000 fixed=3135 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=ollama tokens=11015/11059 fixed=3135 budget=26539ch rounds=3 prompt=whole answers=whole attachments=whole approved-specs=whole research=12730(-54410)
- context packing constitution provider=google tokens=20367/1000000 fixed=650 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=20367/1000000 fixed=650 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=20367/1000000 fixed=650 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=20367/1000000 fixed=650 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=ollama tokens=11004/11059 fixed=650 budget=35047ch rounds=3 prompt=whole answers=whole attachments=whole approved-specs=whole research=34420(-31850)

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **speckit constitution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **speckit requirements** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)
- **speckit solution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **speckit tasks** Rev 1 — needs_revision: 5 linter item(s), 5 model item(s)
- **brownfield constitution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)

## What happened

- `1s` — walking speckit-greenfield-v1 —
- `3s` speckit-greenfield-v1: badge «SpecKit · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Specify → 4 Plan → 5 Tasks → 6 Complete»
- `226s` speckit-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `227s` speckit-greenfield-v1: after a reload the header still reads «Interview»
- `339s` speckit-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `706s` speckit-greenfield-v1-constitution: 1 forward door(s) offered
- `822s` speckit-greenfield-v1-requirements: the answered round stayed in the feed, fixed
- `1196s` speckit-greenfield-v1-requirements: 1 forward door(s) offered
- `1506s` speckit-greenfield-v1-solution: the answered round stayed in the feed, fixed
- `1849s` speckit-greenfield-v1-solution: 1 forward door(s) offered
- `2113s` speckit-greenfield-v1-tasks: the answered round stayed in the feed, fixed
- `2534s` speckit-greenfield-v1-tasks: 1 forward door(s) offered
- `2536s` speckit-greenfield-v1: reached the terminal
- `2536s` — walking myspec-brownfield-v1 —
- `2537s` myspec-brownfield-v1: badge «MySpec · Brownfield · V1», steps «1 Interview → 2 Proposal → 3 Requirements → 4 Tasks → 5 Complete»
- `2738s` myspec-brownfield-v1-interview: the answered round stayed in the feed, fixed
- `2857s` myspec-brownfield-v1-constitution: the answered round stayed in the feed, fixed
- `3159s` myspec-brownfield-v1-constitution: 1 forward door(s) offered
- `4960s` myspec-brownfield-v1-requirements: no question card arrived after three asks
- `4960s` — the Edit chat —
- `4961s` the Reference step offers 4 approved document(s)
- `4963s` edit: steps «1 Reference → 2 Describe → 3 Review → 4 Complete»
- `4963s` edit: the Describe box opens on «I want to update spec constitution.md, spec.md, plan.md and tasks.md to »
- `5297s` — the model picker —
- `5297s` the picker offers: Auto, gemini-3.5-flash, qwen3:14b
- `5300s` the choice is persisted on the session: ollama
- `5300s` the choice survives a reload
- `5300s` the pinned model answered a chat message

## Timings

- speckit-greenfield-v1-interview question round: 121.2 s
- speckit-greenfield-v1-constitution question round: 110 s
- speckit-greenfield-v1-constitution generation: 216.3 s
- speckit-greenfield-v1-constitution review: 147.8 s
- speckit-greenfield-v1-requirements question round: 114 s
- speckit-greenfield-v1-requirements generation: 214.9 s
- speckit-greenfield-v1-requirements review: 157.6 s
- speckit-greenfield-v1-solution question round: 308 s
- speckit-greenfield-v1-solution generation: 218.8 s
- speckit-greenfield-v1-solution review: 122.8 s
- speckit-greenfield-v1-tasks question round: 261.3 s
- speckit-greenfield-v1-tasks generation: 265.7 s
- speckit-greenfield-v1-tasks review: 153.1 s
- myspec-brownfield-v1-interview question round: 111.8 s
- myspec-brownfield-v1-constitution question round: 116.1 s
- myspec-brownfield-v1-constitution generation: 182.5 s
- myspec-brownfield-v1-constitution review: 118.7 s
- myspec-brownfield-v1-requirements question round: 1800.1 s
- edit proposal: 331.8 s
- edit proposal: 0.1 s
- edit proposal: 0.1 s
- local-model reply: 0.1 s

## Retries

- myspec-brownfield-v1-requirements: the ask produced nothing; asking again (2 of 3)
- myspec-brownfield-v1-requirements: the ask produced nothing; asking again (3 of 3)
- edit: the proposal was refused; retrying (2 of 3)
- edit: the proposal was refused; retrying (3 of 3)

## Console errors

- `3403s` Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)
- `4038s` Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)
- `4645s` Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)

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
- enabled  `mcq-option-user-role-grants-officer` 
- enabled  `mcq-option-user-role-team-lead` 
- enabled  `mcq-option-user-role-volunteer-coordinator` 
- enabled  `mcq-option-user-role-external-partner` 
- enabled  `mcq-other-user-role` 
- enabled  `mcq-option-current-workflow-spreadsheet` 
- enabled  `mcq-option-current-workflow-shared-calendar` 
- enabled  `mcq-option-current-workflow-email-reminders` 
- enabled  `mcq-option-current-workflow-paper-logs` 
- enabled  `mcq-other-current-workflow` 
- enabled  `mcq-option-value-proposition-auto-reminders` 
- enabled  `mcq-option-value-proposition-visual-schedule` 
- enabled  `mcq-option-value-proposition-integration` 
- enabled  `mcq-option-value-proposition-collaboration` 
- enabled  `mcq-other-value-proposition` 
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
- enabled  `mcq-option-must-do-encrypt-data` 
- enabled  `mcq-option-must-do-send-reminders` 
- enabled  `mcq-option-must-do-track-deadlines` 
- enabled  `mcq-option-must-do-block-external-logs` 
- enabled  `mcq-other-must-do` 
- enabled  `mcq-option-data-sensitivity-applicant-contact` 
- enabled  `mcq-option-data-sensitivity-full-records` 
- enabled  `mcq-option-data-sensitivity-no-personal-data` 
- enabled  `mcq-option-data-sensitivity-share-data` 
- enabled  `mcq-other-data-sensitivity` 
- enabled  `mcq-option-stay-out-of-donor-history` 
- enabled  `mcq-option-stay-out-of-public-records` 
- enabled  `mcq-option-stay-out-of-ai-scoring` 
- enabled  `mcq-option-stay-out-of-email-templates` 
- enabled  `mcq-other-stay-out-of` 
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
- enabled  `review-item-checkbox-email-failure-mechanics` 
- enabled  `review-item-checkbox-automation-override-mechanics` 
- enabled  `review-item-checkbox-manual-testing-criteria` 
- enabled  `review-item-checkbox-basic-reporting-definition` 
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
- enabled  `mcq-option-main_tasks-add_grant` 
- enabled  `mcq-option-main_tasks-view_deadlines` 
- enabled  `mcq-option-main_tasks-send_email` 
- enabled  `mcq-option-main_tasks-track_progress` 
- enabled  `mcq-option-main_tasks-export_data` 
- enabled  `mcq-other-main_tasks` 
- enabled  `mcq-option-email_automation-auto_email` 
- enabled  `mcq-option-email_automation-auto_notify` 
- enabled  `mcq-option-email_automation-auto_alert` 
- enabled  `mcq-option-email_automation-auto_email_2` 
- enabled  `mcq-other-email_automation` 
- enabled  `mcq-option-user_views-manager_guest` 
- enabled  `mcq-option-user_views-no_diff` 
- enabled  `mcq-option-user_views-role_based` 
- enabled  `mcq-option-user_views-external_access` 
- enabled  `mcq-other-user_views` 
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
- enabled  `review-item-checkbox-missing-reminder-interval` 
- enabled  `review-item-checkbox-deadline-calculation-contradiction` 
- enabled  `review-item-checkbox-unaddressed-edge-case` 
- enabled  `review-item-checkbox-vague-encryption-details` 
- enabled  `review-item-checkbox-untestable-user-satisfaction` 
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
- enabled  `mcq-option-usage-location-phone` 
- enabled  `mcq-option-usage-location-laptop` 
- enabled  `mcq-option-usage-location-both` 
- enabled  `mcq-option-usage-location-other` 
- enabled  `mcq-other-usage-location` 
- enabled  `mcq-option-existing-tools-spreadsheet` 
- enabled  `mcq-option-existing-tools-email-client` 
- enabled  `mcq-option-existing-tools-calendar` 
- enabled  `mcq-option-existing-tools-project-management` 
- enabled  `mcq-option-existing-tools-other` 
- enabled  `mcq-other-existing-tools` 
- enabled  `mcq-option-user-count-1-2` 
- enabled  `mcq-option-user-count-3-5` 
- enabled  `mcq-option-user-count-more-than-5` 
- enabled  `mcq-option-user-count-variable` 
- enabled  `mcq-other-user-count` 
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
- enabled  `review-item-checkbox-frontend-contradiction` 
- enabled  `review-item-checkbox-interval-config-ambiguity` 
- enabled  `review-item-checkbox-encryption-implementation-gap` 
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
- enabled  `mcq-option-core-functionality-track-deadlines` 
- enabled  `mcq-option-core-functionality-email-drafts` 
- enabled  `mcq-option-core-functionality-auto-send-mails` 
- enabled  `mcq-option-core-functionality-calendar-sync` 
- enabled  `mcq-other-core-functionality` 
- enabled  `mcq-option-delayed-features-custom-templates` 
- enabled  `mcq-option-delayed-features-sms-reminders` 
- enabled  `mcq-option-delayed-features-multiple-users` 
- enabled  `mcq-option-delayed-features-reporting` 
- enabled  `mcq-other-delayed-features` 
- enabled  `mcq-option-time-bound-grant-deadline` 
- enabled  `mcq-option-time-bound-manager-free-up` 
- enabled  `mcq-option-time-bound-charity-event` 
- enabled  `mcq-option-time-bound-no-date` 
- enabled  `mcq-other-time-bound` 
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
- enabled  `review-item-checkbox-us1-reminder-intervals` 
- enabled  `review-item-checkbox-t005-auth-system` 
- enabled  `review-item-checkbox-t010-contract-test-details` 
- enabled  `review-item-checkbox-t014-deadline-calculator` 
- enabled  `review-item-checkbox-us2-personalization-fields` 
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
- enabled  `mcq-option-user-role-grants-officer` 
- enabled  `mcq-option-user-role-program-manager` 
- enabled  `mcq-option-user-role-admin-assistant` 
- enabled  `mcq-option-user-role-executive-director` 
- enabled  `mcq-other-user-role` 
- enabled  `mcq-option-current-workflow-spreadsheet` 
- enabled  `mcq-option-current-workflow-shared-calendar` 
- enabled  `mcq-option-current-workflow-email-folder` 
- enabled  `mcq-option-current-workflow-phone-reminder` 
- enabled  `mcq-other-current-workflow` 
- enabled  `mcq-option-value-proposition-auto-reminders` 
- enabled  `mcq-option-value-proposition-centralized-view` 
- enabled  `mcq-option-value-proposition-custom-templates` 
- enabled  `mcq-option-value-proposition-integration` 
- enabled  `mcq-other-value-proposition` 
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
- enabled  `mcq-option-must_do-confirm_before_email` 
- enabled  `mcq-option-must_do-auto_archive` 
- enabled  `mcq-option-must_do-integration` 
- enabled  `mcq-option-must_do-no_manual_entry` 
- enabled  `mcq-option-must_do-security` 
- enabled  `mcq-other-must_do` 
- enabled  `mcq-option-sensitive_data-personal_info` 
- enabled  `mcq-option-sensitive_data-internal_notes` 
- enabled  `mcq-option-sensitive_data-charity_budgets` 
- enabled  `mcq-option-sensitive_data-application_text` 
- enabled  `mcq-option-sensitive_data-none` 
- enabled  `mcq-other-sensitive_data` 
- enabled  `mcq-option-avoid_features-ai_drafting` 
- enabled  `mcq-option-avoid_features-public_portal` 
- enabled  `mcq-option-avoid_features-automatic_funding` 
- enabled  `mcq-option-avoid_features-sms_reminders` 
- enabled  `mcq-option-avoid_features-none` 
- enabled  `mcq-other-avoid_features` 
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
- enabled  `review-item-checkbox-data-security-specification` 
- enabled  `review-item-checkbox-failure-recovery-plan` 
- enabled  `review-item-checkbox-ui-requirements` 
- enabled  `review-item-checkbox-template-flexibility` 
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

### 53-edit-project-page

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

### 54-edit-reference

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

### 55-edit-describe

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

### 56-edit-proposing-1

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

### 57-edit-proposing-2

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

### 58-edit-proposing-3

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

### 59-edit-no-proposal

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

### 60-model-picked

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

### 61-model-answered

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
