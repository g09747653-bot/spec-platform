# M9п gate — RESULT

Walked 2026-08-16T08:02:38.354Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: RED** — 7 problem(s), 66 state(s) captured, 0 console error(s).

## Problems

- `428s` ZERO live session-moving controls at 38-speckit-greenfield-v1-tasks-left
- `548s` speckit-greenfield-v1: the walk ended without a completion panel
- `549s` ZERO live session-moving controls at 39-speckit-greenfield-v1-complete
- `1969s` myspec-brownfield-v1-requirements: no review board arrived
- `2307s` edit: no proposal card arrived after three attempts
- `2310s` ZERO live session-moving controls at 65-model-picked
- `2311s` ZERO live session-moving controls at 66-model-answered

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **speckit constitution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **speckit requirements** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)
- **speckit solution** Rev 1 — needs_revision: 0 linter item(s), 3 model item(s)
- **speckit tasks** Rev 1 — needs_revision: 8 linter item(s), 5 model item(s)
- **brownfield constitution** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)

## What happened

- `2s` — walking speckit-greenfield-v1 —
- `5s` speckit-greenfield-v1: badge «SpecKit · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Specify → 4 Plan → 5 Tasks → 6 Complete»
- `45s` speckit-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `45s` speckit-greenfield-v1: after a reload the header still reads «Interview»
- `73s` speckit-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `122s` speckit-greenfield-v1-constitution: 1 forward door(s) offered
- `148s` speckit-greenfield-v1-requirements: the answered round stayed in the feed, fixed
- `214s` speckit-greenfield-v1-requirements: 1 forward door(s) offered
- `246s` speckit-greenfield-v1-solution: the answered round stayed in the feed, fixed
- `307s` speckit-greenfield-v1-solution: 1 forward door(s) offered
- `339s` speckit-greenfield-v1-tasks: the answered round stayed in the feed, fixed
- `426s` speckit-greenfield-v1-tasks: 1 forward door(s) offered
- `549s` — walking myspec-brownfield-v1 —
- `550s` myspec-brownfield-v1: badge «MySpec · Brownfield · V1», steps «1 Interview → 2 Proposal → 3 Requirements → 4 Tasks → 5 Complete»
- `582s` myspec-brownfield-v1-interview: the answered round stayed in the feed, fixed
- `611s` myspec-brownfield-v1-constitution: the answered round stayed in the feed, fixed
- `657s` myspec-brownfield-v1-constitution: 1 forward door(s) offered
- `1040s` myspec-brownfield-v1-requirements: the answered round stayed in the feed, fixed
- `1969s` — the Edit chat —
- `1970s` the Reference step offers 4 approved document(s)
- `1971s` edit: steps «1 Reference → 2 Describe → 3 Review → 4 Complete»
- `1972s` edit: the Describe box opens on «I want to update spec constitution.md, spec.md, plan.md and tasks.md to »
- `2307s` — the model picker —
- `2307s` the picker offers: Auto, gemini-3.5-flash, qwen3:14b
- `2310s` the choice is persisted on the session: ollama
- `2310s` the choice survives a reload
- `2310s` the pinned model answered a chat message

## Timings

- speckit-greenfield-v1-interview question round: 22.2 s
- speckit-greenfield-v1-constitution question round: 25.2 s
- speckit-greenfield-v1-constitution generation: 23.3 s
- speckit-greenfield-v1-constitution review: 22.2 s
- speckit-greenfield-v1-requirements question round: 24.2 s
- speckit-greenfield-v1-requirements generation: 39.2 s
- speckit-greenfield-v1-requirements review: 25.2 s
- speckit-greenfield-v1-solution question round: 29.4 s
- speckit-greenfield-v1-solution generation: 28.2 s
- speckit-greenfield-v1-solution review: 30.9 s
- speckit-greenfield-v1-tasks question round: 30.3 s
- speckit-greenfield-v1-tasks generation: 35.6 s
- speckit-greenfield-v1-tasks review: 48.9 s
- myspec-brownfield-v1-interview question round: 19.1 s
- myspec-brownfield-v1-constitution question round: 26.7 s
- myspec-brownfield-v1-constitution generation: 18 s
- myspec-brownfield-v1-constitution review: 27.2 s
- myspec-brownfield-v1-requirements question round: 380.8 s
- myspec-brownfield-v1-requirements generation: 27.8 s
- myspec-brownfield-v1-requirements review: 900 s
- edit proposal: 332.5 s
- edit proposal: 0.2 s
- edit proposal: 0.2 s
- local-model reply: 0.2 s

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

session-moving controls live: **2** (ask-round, proceed)

### 03-speckit-greenfield-v1-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-user_profile-founder_director` 
- enabled  `mcq-option-user_profile-part_time_fundraiser` 
- enabled  `mcq-option-user_profile-multiple_team_members` 
- enabled  `mcq-other-user_profile` 
- enabled  `mcq-option-current_pain-spreadsheet_mess` 
- enabled  `mcq-option-current_pain-calendar_chaos` 
- enabled  `mcq-option-current_pain-mental_notes` 
- enabled  `mcq-other-current_pain` 
- enabled  `mcq-option-magic_moment-pre_written_emails` 
- enabled  `mcq-option-magic_moment-visual_dashboard` 
- enabled  `mcq-option-magic_moment-automatic_nagging` 
- enabled  `mcq-other-magic_moment` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:14b
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (ask-round, proceed)

### 07-speckit-greenfield-v1-constitution-round

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-never_do_guardrails-auto_send` 
- enabled  `mcq-option-never_do_guardrails-public_exposure` 
- enabled  `mcq-option-never_do_guardrails-lose_draft_edits` 
- enabled  `mcq-other-never_do_guardrails` 
- enabled  `mcq-option-out_of_scope_first-email_integration` 
- enabled  `mcq-option-out_of_scope_first-grant_discovery` 
- enabled  `mcq-option-out_of_scope_first-budget_tracking` 
- enabled  `mcq-other-out_of_scope_first` 
- enabled  `mcq-option-success_criteria-time_saved` 
- enabled  `mcq-option-success_criteria-zero_missed_deadlines` 
- enabled  `mcq-option-success_criteria-team_transparency` 
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

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (stop-generation, proceed)

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

session-moving controls live: **3** (approve-spec, request-changes, proceed)

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

session-moving controls live: **2** (generate-spec, proceed)

### 12-speckit-greenfield-v1-constitution-review-board

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `review-item-checkbox-approaching-deadline-threshold` 
- enabled  `review-item-checkbox-draft-template-structure` 
- enabled  `review-item-checkbox-status-tracking-states` 
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

session-moving controls live: **4** (review-accept, review-request-changes, review-ignore, proceed)

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

session-moving controls live: **1** (proceed)

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

session-moving controls live: **2** (ask-round, proceed)

### 15-speckit-greenfield-v1-requirements-round

position: **Specify· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-user_flow_input_output-form_and_copy` 
- enabled  `mcq-option-user_flow_input_output-forward_email` 
- enabled  `mcq-option-user_flow_input_output-spreadsheet_sync` 
- enabled  `mcq-other-user_flow_input_output` 
- enabled  `mcq-option-user_roles-single_user` 
- enabled  `mcq-option-user_roles-collaborative_team` 
- enabled  `mcq-option-user_roles-restricted_access` 
- enabled  `mcq-other-user_roles` 
- enabled  `mcq-option-automation_needs-monday_digest` 
- enabled  `mcq-option-automation_needs-calendar_sync` 
- enabled  `mcq-option-automation_needs-slack_discord_alerts` 
- enabled  `mcq-other-automation_needs` 
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

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (stop-generation, proceed)

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

session-moving controls live: **3** (approve-spec, request-changes, proceed)

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

session-moving controls live: **2** (generate-spec, proceed)

### 20-speckit-greenfield-v1-requirements-review-board

position: **Specify· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-missing-contact-field` 
- enabled  `review-item-checkbox-status-contradiction-and-behavior` 
- enabled  `review-item-checkbox-template-source-unspecified` 
- enabled  `review-item-checkbox-grant-status-modification` 
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

session-moving controls live: **4** (review-accept, review-request-changes, review-ignore, proceed)

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

session-moving controls live: **1** (proceed)

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

session-moving controls live: **2** (ask-round, proceed)

### 23-speckit-greenfield-v1-solution-round

position: **Plan· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-working_environment-laptop_with_email_integration` 
- enabled  `mcq-option-working_environment-mobile_and_laptop` 
- enabled  `mcq-option-working_environment-spreadsheet_addon` 
- enabled  `mcq-other-working_environment` 
- enabled  `mcq-option-user_scale-solo_or_pair` 
- enabled  `mcq-option-user_scale-small_team` 
- enabled  `mcq-option-user_scale-rotating_volunteers` 
- enabled  `mcq-other-user_scale` 
- enabled  `mcq-option-offline_needs-always_online` 
- enabled  `mcq-option-offline_needs-offline_sync` 
- enabled  `mcq-other-offline_needs` 
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

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (stop-generation, proceed)

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

session-moving controls live: **3** (approve-spec, request-changes, proceed)

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

session-moving controls live: **2** (generate-spec, proceed)

### 28-speckit-greenfield-v1-solution-review-board

position: **Plan· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-timezone-responsibility` 
- enabled  `review-item-checkbox-weekly-digest-undefined` 
- enabled  `review-item-checkbox-optional-notes-field` 
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

session-moving controls live: **4** (review-accept, review-request-changes, review-ignore, proceed)

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

session-moving controls live: **1** (proceed)

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

session-moving controls live: **2** (ask-round, proceed)

### 31-speckit-greenfield-v1-tasks-round

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-mvp_scope-copy_drafts` 
- enabled  `mcq-option-mvp_scope-auto_send` 
- enabled  `mcq-option-mvp_scope-weekly_digest` 
- enabled  `mcq-other-mvp_scope` 
- enabled  `mcq-option-launch_timeline-upcoming_cycle` 
- enabled  `mcq-option-launch_timeline-next_few_weeks` 
- enabled  `mcq-option-launch_timeline-no_rush` 
- enabled  `mcq-other-launch_timeline` 
- enabled  `mcq-option-builder_profile-nocode_builder` 
- enabled  `mcq-option-builder_profile-web_developer` 
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

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (stop-generation, proceed)

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

session-moving controls live: **3** (approve-spec, request-changes, proceed)

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

session-moving controls live: **2** (generate-spec, proceed)

### 36-speckit-greenfield-v1-tasks-review-board

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `document-preview-toggle` Preview
- enabled  `review-item-checkbox-linter-traceability-FR-2` 
- enabled  `review-item-checkbox-linter-traceability-FR-3` 
- enabled  `review-item-checkbox-linter-traceability-FR-4` 
- enabled  `review-item-checkbox-linter-traceability-FR-5` 
- enabled  `review-item-checkbox-linter-traceability-FR-6` 
- enabled  `review-item-checkbox-linter-traceability-FR-7` 
- enabled  `review-item-checkbox-linter-traceability-FR-8` 
- enabled  `review-item-checkbox-linter-traceability-FR-9` 
- enabled  `review-item-checkbox-timezone-parameter-gap` 
- enabled  `review-item-checkbox-frontend-testing-library-missing` 
- enabled  `review-item-checkbox-draft-endpoint-http-method-missing` 
- enabled  `review-item-checkbox-test-database-isolation` 
- enabled  `review-item-checkbox-injectable-time-for-date-calculator` 
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

session-moving controls live: **4** (review-accept, review-request-changes, review-ignore, proceed)

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

session-moving controls live: **1** (proceed)

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

session-moving controls live: **0** (none)

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

session-moving controls live: **0** (none)

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

session-moving controls live: **2** (ask-round, proceed)

### 42-myspec-brownfield-v1-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-user_role-busy_founder` 
- enabled  `mcq-option-user_role-part_time_volunteer` 
- enabled  `mcq-option-user_role-board_member` 
- enabled  `mcq-other-user_role` 
- enabled  `mcq-option-current_pain-messy_spreadsheet` 
- enabled  `mcq-option-current_pain-email_search` 
- enabled  `mcq-option-current_pain-sticky_notes` 
- enabled  `mcq-other-current_pain` 
- enabled  `mcq-option-success_criteria-ready_to_send_drafts` 
- enabled  `mcq-option-success_criteria-dead_simple_dashboard` 
- enabled  `mcq-option-success_criteria-automatic_nagging` 
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

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (ask-round, proceed)

### 45-myspec-brownfield-v1-constitution-round

position: **Proposal· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-boundaries_and_out_of_scope-no_auto_send` 
- enabled  `mcq-option-boundaries_and_out_of_scope-no_financial_tracking` 
- enabled  `mcq-option-boundaries_and_out_of_scope-no_full_proposals` 
- enabled  `mcq-other-boundaries_and_out_of_scope` 
- enabled  `mcq-option-data_and_sensitivity-basic_and_semi_private` 
- enabled  `mcq-option-data_and_sensitivity-highly_sensitive_beneficiaries` 
- enabled  `mcq-other-data_and_sensitivity` 
- enabled  `mcq-option-success_criteria-zero_missed_deadlines` 
- enabled  `mcq-option-success_criteria-saved_hours_on_writing` 
- enabled  `mcq-option-success_criteria-team_alignment` 
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

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (stop-generation, proceed)

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

session-moving controls live: **3** (approve-spec, request-changes, proceed)

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

session-moving controls live: **2** (generate-spec, proceed)

### 50-myspec-brownfield-v1-constitution-review-board

position: **Proposal· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `review-item-checkbox-missing-urgency-thresholds` 
- enabled  `review-item-checkbox-undefined-grant-contact-relationship` 
- enabled  `review-item-checkbox-unclear-user-isolation` 
- enabled  `review-item-checkbox-template-engine-mechanism-and-variables` 
- enabled  `review-item-checkbox-one-click-copy-ambiguity` 
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

session-moving controls live: **4** (review-accept, review-request-changes, review-ignore, proceed)

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

session-moving controls live: **1** (proceed)

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

session-moving controls live: **2** (ask-round, proceed)

### 53-myspec-brownfield-v1-requirements-round

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `document-preview-toggle` Preview
- enabled  `mcq-option-core_workflow-manual_entry_copy_paste` 
- enabled  `mcq-option-core_workflow-forward_email` 
- enabled  `mcq-option-core_workflow-pdf_upload` 
- enabled  `mcq-other-core_workflow` 
- enabled  `mcq-option-automation-on_demand_only` 
- enabled  `mcq-option-automation-weekly_digest_email` 
- enabled  `mcq-option-automation-direct_email_alert` 
- enabled  `mcq-other-automation` 
- enabled  `mcq-option-user_roles-single_user` 
- enabled  `mcq-option-user_roles-shared_team` 
- enabled  `mcq-option-user_roles-owner_and_volunteer` 
- enabled  `mcq-other-user_roles` 
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

session-moving controls live: **1** (mcq-reply-toggle)

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

session-moving controls live: **2** (ask-round, proceed)

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

session-moving controls live: **2** (stop-generation, proceed)

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

session-moving controls live: **3** (approve-spec, request-changes, proceed)

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

session-moving controls live: **2** (generate-spec, proceed)

### 58-edit-project-page

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

### 59-edit-reference

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

session-moving controls live: **1** (proceed)

### 60-edit-describe

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

session-moving controls live: **2** (mcq-submit, mcq-reply-toggle)

### 61-edit-proposing-1

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

session-moving controls live: **2** (stop-generation, proceed)

### 62-edit-proposing-2

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

session-moving controls live: **2** (generate-spec, proceed)

### 63-edit-proposing-3

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

session-moving controls live: **2** (generate-spec, proceed)

### 64-edit-no-proposal

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

session-moving controls live: **2** (generate-spec, proceed)

### 65-model-picked

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

session-moving controls live: **0** (none)

### 66-model-answered

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

session-moving controls live: **0** (none)
