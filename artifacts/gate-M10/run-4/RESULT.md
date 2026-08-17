# M10п gate — RESULT

Walked 2026-08-17T09:07:22.183Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: RED** — 1 problem(s), 49 state(s) captured, 0 console error(s).

## Problems

- `448s` go-back: no revert card on a session whose document has two revisions

## Prompt truncation (round 4 — the new red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-17T08:59:53.626Z`, when this walk began. The same log holds **1** earlier record(s) from before it — the pre-flight sends one unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence rather than a defect (`preflight/RUN-2-STATE.md`).

## Structural rejections (M10п — the second red condition)

`generated document rejected on structure` records: **0**. The milestone asks for zero: a retry that succeeds hides the first sample, and the first sample is what says whether the local link can hold the contract.

_None._

## Context packing (А-8, point 4)

5 packing record(s): the web research was shrunk in **0** and dropped entirely in **0** of them.

- context packing constitution provider=google tokens=13151/1000000 fixed=388 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing constitution provider=google tokens=15626/1000000 fixed=470 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole feedback=whole
- context packing requirements provider=google tokens=22335/1000000 fixed=365 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing solution provider=google tokens=33083/1000000 fixed=400 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing tasks provider=google tokens=35234/1000000 fixed=340 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **constitution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **constitution** Rev 2 — needs_revision: 0 linter item(s), 2 model item(s)
- **requirements** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)
- **solution** Rev 1 — needs_revision: 0 linter item(s), 6 model item(s)
- **tasks** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)

## What happened

- `1s` — walking myspec-greenfield-v1 —
- `3s` myspec-greenfield-v1: badge «MySpec · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Requirements → 4 Solution → 5 Tasks → 6 Complete»
- `19s` myspec-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `19s` myspec-greenfield-v1: after a reload the header still reads «Interview»
- `31s` myspec-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `112s` myspec-greenfield-v1-constitution: the revision was re-reviewed against the points that were ticked
- `113s` myspec-greenfield-v1-constitution: 1 forward door(s) offered
- `126s` myspec-greenfield-v1-requirements: the answered round stayed in the feed, fixed
- `194s` myspec-greenfield-v1-requirements: 1 forward door(s) offered
- `206s` myspec-greenfield-v1-solution: the answered round stayed in the feed, fixed
- `284s` myspec-greenfield-v1-solution: 1 forward door(s) offered
- `301s` myspec-greenfield-v1-tasks: the answered round stayed in the feed, fixed
- `382s` myspec-greenfield-v1-tasks: 1 forward door(s) offered
- `384s` myspec-greenfield-v1: reached the terminal
- `384s` — the completion panel —
- `384s` completion: bundle «a-tool-that-tracks-which-of-a-small-charity-s-gr», 4
- `385s` completion: the prompt names 4 of 4 approved revisions (constitution=Rev 2, requirements=Rev 1, solution=Rev 1, tasks=Rev 1)
- `385s` completion: Download is offered from the panel
- `385s` — both themes —
- `387s` theme: «light» body lab(98.373 -0.443995 -1.43218)/lab(11.7208 -1.33529 -10.5855) → «dark» body lab(4.4075 -0.359535 -3.3158)/lab(94.1953 -0.662029 -2.14607)
- `387s` theme: the choice survives a reload
- `388s` — the diff and the go-back —

## Timings

- myspec-greenfield-v1-interview question round: 11.1 s
- myspec-greenfield-v1-constitution question round: 9.5 s
- myspec-greenfield-v1-constitution generation: 27 s
- myspec-greenfield-v1-constitution review: 16.2 s
- myspec-greenfield-v1-constitution-rev2 generation: 21.1 s
- myspec-greenfield-v1-requirements question round: 11.1 s
- myspec-greenfield-v1-requirements generation: 36.6 s
- myspec-greenfield-v1-requirements review: 29.9 s
- myspec-greenfield-v1-solution question round: 9.5 s
- myspec-greenfield-v1-solution generation: 51.7 s
- myspec-greenfield-v1-solution review: 24.8 s
- myspec-greenfield-v1-tasks question round: 14 s
- myspec-greenfield-v1-tasks generation: 55.7 s
- myspec-greenfield-v1-tasks review: 23.3 s

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
- enabled  `mcq-option-user_role_and_goal-sole_fundraiser` 
- enabled  `mcq-option-user_role_and_goal-small_team` 
- enabled  `mcq-option-user_role_and_goal-board_member` 
- enabled  `mcq-other-user_role_and_goal` 
- enabled  `mcq-option-current_pain_point-spreadsheet_hell` 
- enabled  `mcq-option-current_pain_point-calendar_scramble` 
- enabled  `mcq-option-current_pain_point-mental_tracking` 
- enabled  `mcq-other-current_pain_point` 
- enabled  `mcq-option-success_moment-one_click_drafts` 
- enabled  `mcq-option-success_moment-automatic_weekly_digest` 
- enabled  `mcq-option-success_moment-hands_off_automation` 
- enabled  `mcq-other-success_moment` 
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
- enabled  `mcq-option-boundaries_and_safety-never_send_automatically` 
- enabled  `mcq-option-boundaries_and_safety-never_import_without_asking` 
- enabled  `mcq-option-boundaries_and_safety-never_search_web` 
- enabled  `mcq-other-boundaries_and_safety` 
- enabled  `mcq-option-data_sensitivity-basic_public_info` 
- enabled  `mcq-option-data_sensitivity-internal_drafts` 
- enabled  `mcq-option-data_sensitivity-funder_contacts` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-success_vision-five_minute_routine` 
- enabled  `mcq-option-success_vision-no_missed_deadlines` 
- enabled  `mcq-option-success_vision-pipeline_clarity` 
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
- enabled  `review-item-checkbox-backend-language-contradiction` 
- enabled  `review-item-checkbox-csv-import-schema-missing` 
- enabled  `review-item-checkbox-draft-queue-ambiguity` 
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
- enabled  `review-item-checkbox-backend-language-contradiction` 
- enabled  `review-item-checkbox-csv-import-schema-missing` 
- enabled  `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
- enabled  `review-item-checkbox-csv-import-schema-undefined` 
- enabled  `review-item-checkbox-draft-queue-streaming-ambiguity` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
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

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 17-myspec-greenfield-v1-constitution-review-decided

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-grant_input_method-spreadsheet_sync` 
- enabled  `mcq-option-grant_input_method-manual_entry` 
- enabled  `mcq-option-grant_input_method-email_forward` 
- enabled  `mcq-other-grant_input_method` 
- enabled  `mcq-option-user_access_levels-single_user` 
- enabled  `mcq-option-user_access_levels-collaborative_team` 
- enabled  `mcq-option-user_access_levels-review_workflow` 
- enabled  `mcq-other-user_access_levels` 
- enabled  `mcq-option-reminder_trigger-weekly_digest` 
- enabled  `mcq-option-reminder_trigger-dashboard_only` 
- enabled  `mcq-option-reminder_trigger-individual_alerts` 
- enabled  `mcq-other-reminder_trigger` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-user-provisioning` 
- enabled  `review-item-checkbox-status-enum-case-discrepancy` 
- enabled  `review-item-checkbox-undefined-fallback-template` 
- enabled  `review-item-checkbox-weekly-digest-actions-ambiguity` 
- enabled  `review-item-checkbox-untestable-keyboard-accessibility` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-device_context-desktop_only` 
- enabled  `mcq-option-device_context-mobile_first` 
- enabled  `mcq-option-device_context-both_seamless` 
- enabled  `mcq-other-device_context` 
- enabled  `mcq-option-integrations-email_client_click` 
- enabled  `mcq-option-integrations-clipboard_copy` 
- enabled  `mcq-option-integrations-calendar_sync` 
- enabled  `mcq-other-integrations` 
- enabled  `mcq-option-user_scale-single_user` 
- enabled  `mcq-option-user_scale-few_collaborators` 
- enabled  `mcq-option-user_scale-read_only_viewers` 
- enabled  `mcq-other-user_scale` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-user-registration` 
- enabled  `review-item-checkbox-missing-draft-retrieval-endpoint` 
- enabled  `review-item-checkbox-undefined-active-grants-and-urgency` 
- enabled  `review-item-checkbox-vague-csv-date-parsing` 
- enabled  `review-item-checkbox-missing-llm-prompt-guidelines` 
- enabled  `review-item-checkbox-incomplete-crud-capabilities` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-v1_essential_features-draft_in_client` 
- enabled  `mcq-option-v1_essential_features-auto_send` 
- enabled  `mcq-option-v1_essential_features-clean_list_only` 
- enabled  `mcq-other-v1_essential_features` 
- enabled  `mcq-option-builder_profile-casual_coder` 
- enabled  `mcq-option-builder_profile-no_code_builder` 
- enabled  `mcq-option-builder_profile-pro_developer` 
- enabled  `mcq-option-builder_profile-no_builder_yet` 
- enabled  `mcq-other-builder_profile` 
- enabled  `mcq-option-project_deadline-flexible_quarter` 
- enabled  `mcq-option-project_deadline-urgent_grant_cycle` 
- enabled  `mcq-option-project_deadline-no_rush` 
- enabled  `mcq-other-project_deadline` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-auth-registration-gap` 
- enabled  `review-item-checkbox-auth-method-contradiction` 
- enabled  `review-item-checkbox-llm-provider-ambiguity` 
- enabled  `review-item-checkbox-fallback-template-unspecified` 
- enabled  `review-item-checkbox-streaming-vs-blocking-contradiction` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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

### 46-theme-light

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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

### 47-theme-dark

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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

### 48-theme-after-reload

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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

### 49-go-back-no-card

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- **disabled** `review-item-checkbox-backend-language-contradiction` 
- **disabled** `review-item-checkbox-csv-import-schema-missing` 
- **disabled** `review-item-checkbox-draft-queue-ambiguity` 
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
