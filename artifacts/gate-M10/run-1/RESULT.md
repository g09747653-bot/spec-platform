# M10п gate — RESULT

Walked 2026-08-17T08:28:39.239Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: RED** — 1 problem(s), 43 state(s) captured, 0 console error(s).

## Problems

- `351s` completion: Generate AI Prompt produced nothing

## Prompt truncation (round 4 — the new red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-17T08:22:45.420Z`, when this walk began. The same log holds **1** earlier record(s) from before it — the pre-flight sends one unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence rather than a defect (`preflight/RUN-2-STATE.md`).

## Structural rejections (M10п — the second red condition)

`generated document rejected on structure` records: **0**. The milestone asks for zero: a retry that succeeds hides the first sample, and the first sample is what says whether the local link can hold the contract.

_None._

## Context packing (А-8, point 4)

4 packing record(s): the web research was shrunk in **1** and dropped entirely in **0** of them.

- context packing constitution provider=google tokens=20115/1000000 fixed=388 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing requirements provider=google tokens=22300/1000000 fixed=365 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=27777/1000000 fixed=400 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=35711/1000000 fixed=340 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=63242(-3898)

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **constitution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **requirements** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **solution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **tasks** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)

## What happened

- `1s` — walking myspec-greenfield-v1 —
- `3s` myspec-greenfield-v1: badge «MySpec · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Requirements → 4 Solution → 5 Tasks → 6 Complete»
- `18s` myspec-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `19s` myspec-greenfield-v1: after a reload the header still reads «Interview»
- `34s` myspec-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `85s` myspec-greenfield-v1-constitution: 1 forward door(s) offered
- `98s` myspec-greenfield-v1-requirements: the answered round stayed in the feed, fixed
- `157s` myspec-greenfield-v1-requirements: 1 forward door(s) offered
- `171s` myspec-greenfield-v1-solution: the answered round stayed in the feed, fixed
- `262s` myspec-greenfield-v1-solution: 1 forward door(s) offered
- `275s` myspec-greenfield-v1-tasks: the answered round stayed in the feed, fixed
- `349s` myspec-greenfield-v1-tasks: 1 forward door(s) offered
- `351s` myspec-greenfield-v1: reached the terminal
- `351s` — the completion panel —
- `351s` completion: bundle «a-tool-that-tracks-which-of-a-small-charity-s-gr», 4
- `351s` — both themes —
- `353s` theme: «light» body lab(98.373 -0.443995 -1.43218)/lab(11.7208 -1.33529 -10.5855) → «dark» body lab(4.4075 -0.359535 -3.3158)/lab(94.1953 -0.662029 -2.14607)
- `353s` theme: the choice survives a reload
- `354s` — the diff and the go-back —
- no document reached a second revision on this walk, so «go back» had nothing to undo; the behaviour is covered by `revert.spec.ts` on the double.

## Timings

- myspec-greenfield-v1-interview question round: 11 s
- myspec-greenfield-v1-constitution question round: 13.1 s
- myspec-greenfield-v1-constitution generation: 28 s
- myspec-greenfield-v1-constitution review: 19.6 s
- myspec-greenfield-v1-requirements question round: 10.5 s
- myspec-greenfield-v1-requirements generation: 35 s
- myspec-greenfield-v1-requirements review: 23.7 s
- myspec-greenfield-v1-solution question round: 11.5 s
- myspec-greenfield-v1-solution generation: 68.3 s
- myspec-greenfield-v1-solution review: 21.1 s
- myspec-greenfield-v1-tasks question round: 11 s
- myspec-greenfield-v1-tasks generation: 43.4 s
- myspec-greenfield-v1-tasks review: 28.2 s

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
- enabled  `mcq-option-user_role-overworked_founder` 
- enabled  `mcq-option-user_role-small_team` 
- enabled  `mcq-option-user_role-board_members` 
- enabled  `mcq-other-user_role` 
- enabled  `mcq-option-current_pain-shared_spreadsheet` 
- enabled  `mcq-option-current_pain-calendar_alerts` 
- enabled  `mcq-option-current_pain-mental_notes` 
- enabled  `mcq-other-current_pain` 
- enabled  `mcq-option-magic_moment-gmail_outlook_drafts` 
- enabled  `mcq-option-magic_moment-one_click_copy` 
- enabled  `mcq-option-magic_moment-auto_send` 
- enabled  `mcq-other-magic_moment` 
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
- enabled  `mcq-option-guardrails_and_boundaries-no_auto_send` 
- enabled  `mcq-option-guardrails_and_boundaries-no_reading_personal_inbox` 
- enabled  `mcq-option-guardrails_and_boundaries-no_handling_money` 
- enabled  `mcq-other-guardrails_and_boundaries` 
- enabled  `mcq-option-data_sensitivity-basic_public_info` 
- enabled  `mcq-option-data_sensitivity-contact_details` 
- enabled  `mcq-option-data_sensitivity-sensitive_internal_notes` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-success_vision-drafts_waiting` 
- enabled  `mcq-option-success_vision-zero_missed_deadlines` 
- enabled  `mcq-other-success_vision` 
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
- enabled  `review-item-checkbox-tech-stack-ambiguity` 
- enabled  `review-item-checkbox-ai-draft-generation-unspecified` 
- enabled  `review-item-checkbox-state-transition-triggers` 
- enabled  `review-item-checkbox-workspace-creation-flow` 
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

### 13-myspec-greenfield-v1-constitution-review-decided

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

session-moving controls live: **2** (proceed, download-export)

### 14-myspec-greenfield-v1-constitution-left

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 15-myspec-greenfield-v1-requirements-round

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-data_entry-manual_form` 
- enabled  `mcq-option-data_entry-spreadsheet_upload` 
- enabled  `mcq-option-data_entry-email_forwarding` 
- enabled  `mcq-other-data_entry` 
- enabled  `mcq-option-draft_trigger-automatic_countdown` 
- enabled  `mcq-option-draft_trigger-manual_click` 
- enabled  `mcq-option-draft_trigger-weekly_batch` 
- enabled  `mcq-other-draft_trigger` 
- enabled  `mcq-option-user_access-solo_director` 
- enabled  `mcq-option-user_access-writer_assistant` 
- enabled  `mcq-option-user_access-board_view` 
- enabled  `mcq-other-user_access` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 16-myspec-greenfield-v1-requirements-round-answered

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 17-myspec-greenfield-v1-requirements-generating

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
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

### 18-myspec-greenfield-v1-requirements-drafted

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 19-myspec-greenfield-v1-requirements-approved

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 20-myspec-greenfield-v1-requirements-review-board

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-drafting-rules-and-templates` 
- enabled  `review-item-checkbox-undefined-funder-search-api` 
- enabled  `review-item-checkbox-mismatched-draft-status-names` 
- enabled  `review-item-checkbox-missing-endpoint-draft-status-update` 
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
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 21-myspec-greenfield-v1-requirements-review-decided

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Proceed to Solution
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 22-myspec-greenfield-v1-requirements-left

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 23-myspec-greenfield-v1-solution-round

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-devices_and_connection-desk_only_online` 
- enabled  `mcq-option-devices_and_connection-hybrid_on_the_go` 
- enabled  `mcq-option-devices_and_connection-offline_capabilities` 
- enabled  `mcq-other-devices_and_connection` 
- enabled  `mcq-option-team_size_and_growth-just_me` 
- enabled  `mcq-option-team_size_and_growth-small_static_team` 
- enabled  `mcq-option-team_size_and_growth-growing_team` 
- enabled  `mcq-other-team_size_and_growth` 
- enabled  `mcq-option-existing_tools_integration-replace_spreadsheets` 
- enabled  `mcq-option-existing_tools_integration-keep_spreadsheets_in_sync` 
- enabled  `mcq-option-existing_tools_integration-calendar_sync` 
- enabled  `mcq-other-existing_tools_integration` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 24-myspec-greenfield-v1-solution-round-answered

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 25-myspec-greenfield-v1-solution-generating

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- enabled  `specs-panel-open` requirements.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 26-myspec-greenfield-v1-solution-drafted

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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
- enabled  `specs-panel-open` requirements.md
- enabled  `specs-panel-open` solution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 27-myspec-greenfield-v1-solution-approved

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 28-myspec-greenfield-v1-solution-review-board

position: **Solution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-stack-ambiguity` 
- enabled  `review-item-checkbox-undefined-templates` 
- enabled  `review-item-checkbox-inconsistent-draft-status` 
- enabled  `review-item-checkbox-exact-deadline-logic` 
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

### 29-myspec-greenfield-v1-solution-review-decided

position: **Solution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `proceed` Proceed to Tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
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

### 30-myspec-greenfield-v1-solution-left

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
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

### 31-myspec-greenfield-v1-tasks-round

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-mvp_scope-manual_entry_drafts` 
- enabled  `mcq-option-mvp_scope-auto_import_drafts` 
- enabled  `mcq-option-mvp_scope-dashboard_only` 
- enabled  `mcq-other-mvp_scope` 
- enabled  `mcq-option-project_timeline-no_hard_deadline` 
- enabled  `mcq-option-project_timeline-next_grant_cycle` 
- enabled  `mcq-option-project_timeline-immediate_need` 
- enabled  `mcq-other-project_timeline` 
- enabled  `mcq-option-builder_profile-nocode_volunteer` 
- enabled  `mcq-option-builder_profile-professional_developer` 
- enabled  `mcq-option-builder_profile-unassigned` 
- enabled  `mcq-other-builder_profile` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
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

### 32-myspec-greenfield-v1-tasks-round-answered

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
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

### 33-myspec-greenfield-v1-tasks-generating

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
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

### 34-myspec-greenfield-v1-tasks-drafted

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 35-myspec-greenfield-v1-tasks-approved

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 36-myspec-greenfield-v1-tasks-review-board

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-draft-provider-resolution` 
- enabled  `review-item-checkbox-unspecified-email-templates` 
- enabled  `review-item-checkbox-undefined-tech-stack` 
- enabled  `review-item-checkbox-triggered-by-field-mapping` 
- enabled  `review-item-checkbox-status-enum-inconsistency` 
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

### 37-myspec-greenfield-v1-tasks-review-decided

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 38-myspec-greenfield-v1-tasks-left

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 39-myspec-greenfield-v1-complete

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 40-completion-panel

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 41-theme-light

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 42-theme-dark

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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

### 43-theme-after-reload

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
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
