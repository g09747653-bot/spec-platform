# M11п gate — RESULT

Walked 2026-08-17T12:51:56.771Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: GREEN** — 0 problem(s), 20 state(s) captured, 0 console error(s).

## Problems

_None._

## Prompt truncation (round 4 — the new red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-17T12:50:12.173Z`, when this walk began. The same log holds **0** earlier record(s) from before it — the pre-flight sends one unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence rather than a defect (`preflight/RUN-2-STATE.md`).

## Structural rejections (M10п — the second red condition)

`generated document rejected on structure` records: **0**. The milestone asks for zero: a retry that succeeds hides the first sample, and the first sample is what says whether the local link can hold the contract.

_None._

## Context packing (А-8, point 4)

8 packing record(s): the web research was shrunk in **0** and dropped entirely in **0** of them.

- context packing interview-bridge provider=google tokens=640/1000000 fixed=374 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing chat-answer provider=google tokens=417/1000000 fixed=269 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing interview-bridge provider=google tokens=687/1000000 fixed=374 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing constitution provider=google tokens=20134/1000000 fixed=388 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole
- context packing interview-bridge provider=google tokens=650/1000000 fixed=374 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing chat-answer provider=google tokens=416/1000000 fixed=269 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing interview-bridge provider=google tokens=669/1000000 fixed=374 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing constitution provider=google tokens=20132/1000000 fixed=388 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

- **constitution** Rev 1 — needs_revision: 0 linter item(s), 5 model item(s)

## What happened

- `2s` seed bubble: «I want to build: A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails»
- `28s` interview: the answered round stayed in the feed, fixed
- `28s` the bridge was written: «While you currently track deadlines in "A shared spreadsheet (Excel or Google Sheets)," you want a new "tool that tracks" them, which raises the question of whe…»
- `28s` the round budget on the card: «1 of 3 question rounds answered · 2 left · summary saved»
- `33s` the chat reply: 1 block(s) before the reload, 1 after — at interview/
- `33s` assistant chat turns after the reload: 1
- `33s` the crossing: «Project bundle created: a-tool-that-tracks-which-of-a-small-charity-s-gr — 4 spec files to write»
- `33s` the chip: «Interview ──▶ Constitution · Collecting»; the pill's substage: «· Collecting»
- `51s` constitution: the answered round stayed in the feed, fixed
- `102s` — the surfaces —
- `102s` composer: attach inside it 1, Send painted linear-gradient(to right, lab(38.7848 -3.70836 -54.6091) 0%, lab(44.1852 16.7828
- `102s` sidebar: «Attachments», 280px → 376px after six steps
- `102s` export panel: «Mode: default — this workflow's 4 spec files, each at its most recent pre-enrichment revision.»
- `102s` the project page describes the project: «A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder em»
- `102s` — both themes —
- `104s` theme: «light» body lab(98.373 -0.443995 -1.43218)/lab(11.7208 -1.33529 -10.5855) → «dark» body lab(4.4075 -0.359535 -3.3158)/lab(94.1953 -0.662029 -2.14607)
- `104s` theme: the choice survives a reload
- `104s` — the surfaces —
- `104s` composer: attach inside it 1, Send painted linear-gradient(to right, lab(64.785 -10.9665 -48.9041) 0%, lab(76.816 14.2787 5
- `104s` sidebar: «Attachments», 376px → 472px after six steps
- `104s` export panel: «Mode: default — this workflow's 4 spec files, each at its most recent pre-enrichment revision.»

## Timings

- interview question round: 12.5 s
- constitution question round: 11.6 s
- constitution generation: 29.6 s
- constitution review: 19.6 s

## Retries

_None._

## Console errors

_None._

## Controls at every state (the liveness invariant)


### 01-seeded

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 02-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `mcq-option-user_role-solo_director` 
- enabled  `mcq-option-user_role-part_time_volunteer` 
- enabled  `mcq-option-user_role-board_member` 
- enabled  `mcq-other-user_role` 
- enabled  `mcq-option-current_pain-messy_spreadsheet` 
- enabled  `mcq-option-current_pain-calendar_clutter` 
- enabled  `mcq-option-current_pain-mental_map` 
- enabled  `mcq-other-current_pain` 
- enabled  `mcq-option-reminder_recipient-internal_team` 
- enabled  `mcq-option-reminder_recipient-external_partner` 
- enabled  `mcq-option-reminder_recipient-grant_funder` 
- enabled  `mcq-other-reminder_recipient` 
- enabled  `mcq-option-magic_moment-email_integration` 
- enabled  `mcq-option-magic_moment-weekly_digest` 
- enabled  `mcq-option-magic_moment-clean_dashboard` 
- enabled  `mcq-other-magic_moment` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 03-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 04-bridge

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 05-chat-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- **disabled** `composer-attach` 
- **disabled** `chat-send` Sending…
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 06-chat-after-reload

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 07-crossed-into-constitution

position: **Constitution· Collecting**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 08-constitution-round

position: **Constitution· Collecting**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `mcq-option-never_do_guardrails-no_auto_send` 
- enabled  `mcq-option-never_do_guardrails-no_overwrite` 
- enabled  `mcq-other-never_do_guardrails` 
- enabled  `mcq-option-data_sensitivity-basic_metadata` 
- enabled  `mcq-option-data_sensitivity-financial_and_drafts` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-out_of_scope-no_grant_writing` 
- enabled  `mcq-option-out_of_scope-no_budget_tracking` 
- enabled  `mcq-option-out_of_scope-no_external_reminders` 
- enabled  `mcq-other-out_of_scope` 
- enabled  `mcq-option-success_criteria-time_saved` 
- enabled  `mcq-option-success_criteria-zero_missed_deadlines` 
- enabled  `mcq-other-success_criteria` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 09-constitution-round-answered

position: **Constitution· Collecting**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (ask-round, proceed, download-export)

### 10-constitution-generating

position: **Constitution· Generating**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 11-constitution-drafted

position: **Constitution· Generating**

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
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 12-constitution-approved

position: **Constitution· Generating**

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
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 13-constitution-review-board

position: **Constitution· Reviewing**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `review-item-checkbox-unspecified-tech-stack` 
- enabled  `review-item-checkbox-undefined-reminder-logic-and-templates` 
- enabled  `review-item-checkbox-single-vs-multi-user-auth` 
- enabled  `review-item-checkbox-ical-auth-mechanism` 
- enabled  `review-item-checkbox-microsoft-graph-scope` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 14-constitution-review-decided

position: **Constitution· Reviewing**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 15-surfaces

position: **Constitution· Reviewing**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 16-project-page

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
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
- enabled  `start-edit-chat` Start edit chat
- **disabled** `mcp-add-server` Add server

session-moving controls live: **0** (none)

### 17-theme-light

position: **Constitution· Reviewing**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 18-theme-dark

position: **Constitution· Reviewing**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 19-theme-after-reload

position: **Constitution· Reviewing**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)

### 20-surfaces

position: **Constitution· Reviewing**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- enabled  `chat-message` 
- enabled  `composer-attach` 
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (proceed, download-export)
