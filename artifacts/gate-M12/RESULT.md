# M12п gate — RESULT

Walked 2026-08-18T12:38:18.687Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: GREEN** — 0 problem(s), 26 state(s) captured, 0 console record(s) of which 0 unexpected.

## Problems

_None._

## The shell, measured

The customer reported a composer «сжатый в вертикальную полосу» and a surface that behaved like
a document. Both were measurable then — 46 px of text box on every monitor, the collapse control
420 px above the viewport — so both are measured now rather than declared fixed.

- **a new session** — viewport 1440×900, theme «light»: composer text box **894 px**, sidebar column 300 px (its panels 294 px), feed 896 px (scrolls inside itself: not yet — nothing to scroll); page-level scroll: none vertical, none horizontal
- **constitution mid-stream** — viewport 1440×900, theme «light»: composer text box **894 px**, sidebar column 300 px (its panels 294 px), feed 896 px (scrolls inside itself: not yet — nothing to scroll); page-level scroll: none vertical, none horizontal
- **the viewer header against the exported bytes** — header «111 lines» / «1333 words», file 111 lines / 1333 words
- **the floor, 1000×700** — viewport 1000×700, theme «light»: composer text box **666 px**, sidebar column 300 px (its panels 294 px), feed 700 px (scrolls inside itself: not yet — nothing to scroll); page-level scroll: none vertical, none horizontal
- **the collapsed sidebar after a reload** — restored, but only once the client had hydrated: the panel is painted expanded for ~269 ms first. Only the sidebar *width* is stamped before first paint (D-198); the collapse is not.
- **the finished shell, «light»** — viewport 1440×900, theme «light»: composer text box **894 px**, sidebar column 300 px (its panels 294 px), feed 896 px (scrolls inside itself: not yet — nothing to scroll); page-level scroll: none vertical, none horizontal
- **the finished shell, «dark»** — viewport 1440×900, theme «dark»: composer text box **894 px**, sidebar column 300 px (its panels 294 px), feed 896 px (scrolls inside itself: not yet — nothing to scroll); page-level scroll: none vertical, none horizontal

## Prompt truncation (round 4 — the red condition)

`truncating input prompt` records for the whole walk: **0**. One is a red run, whatever else went well: what a local runtime drops is the head of the prompt — the instruction and the required-section list (D-146; А-8).

_None._

Counted from `2026-08-18T12:36:29.268Z`, when this walk began. The same log holds **0** earlier record(s) from before it.

## Structural rejections (M10п — the second red condition)

`generated document rejected on structure` records: **0**. The milestone asks for zero: a retry that succeeds hides the first sample, and the first sample is what says whether the link can hold the contract.

_None._

## Context packing (А-8, point 4)

3 packing record(s): the web research was shrunk in **0** and dropped entirely in **0** of them.

- context packing interview-bridge provider=google tokens=622/1000000 fixed=374 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing interview-bridge provider=google tokens=669/1000000 fixed=374 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole
- context packing constitution provider=google tokens=16189/1000000 fixed=388 budget=120000ch rounds=1 prompt=whole answers=whole attachments=whole approved-specs=whole research=whole

## Review boards, and what the linters found on each

- **constitution** Rev 1 — needs_revision: 0 linter item(s), 4 model item(s)

## What happened

- `3s` seed bubble: «I want to build: A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails»
- `26s` interview: the answered round stayed in the feed, fixed
- `26s` — the shortcuts —
- `26s` the shortcut list is on the page with 11 row(s)
- `49s` constitution: the answered round stayed in the feed, fixed
- `49s` constitution: the run is live — Stop is on the page
- `50s` constitution: the viewer opened over the live run as «live»
- `50s` still alive at constitution viewer open over a live run: stop-generation, proceed, viewer-stop-generation, download-export
- `68s` constitution: theme flipped to «dark» mid-stream; Stop still reachable: true
- `68s` constitution: theme restored to «light» mid-stream; Stop still reachable: true
- `68s` constitution: the stream kept its words across two theme switches (273 → 1365 characters)
- `69s` still alive at constitution reloaded mid-stream: stop-generation, proceed, download-export
- `69s` constitution: after a mid-stream reload the run reads still running (the reader resumed it)
- `81s` — the viewer —
- `82s` viewer header: «constitution.md» · Rev 1 · 111 lines · 1333 words
- `82s` viewer raw: 111 line(s) of text, the gutter numbers 111
- `83s` viewer closed: true; the panels came back: true
- `105s` — the small window —
- `105s` still alive at 1000×700: proceed, download-export
- `105s` still alive at collapsed at 1000×700: proceed
- `106s` the first paint after the reload reads data-collapsed=«false»
- `106s` the collapse survived a reload: yes, settled 269 ms after the reload returned
- `106s` and it expands again: yes
- `107s` — both themes —
- `108s` theme: «light» body lab(98.373 -0.443995 -1.43218)/lab(11.7208 -1.33529 -10.5855) → «dark» body lab(4.4075 -0.359535 -3.3158)/lab(94.1953 -0.662029 -2.14607)
- `108s` theme: the choice survives a reload

## Timings

- interview question round: 13.1 s
- constitution question round: 16.2 s
- constitution generation: 32 s
- constitution review: 19.2 s

## Retries

_None._

## Console records

Aborted requests are the harness reloading a page over its own in-flight fetch, and are
expected; anything else is a defect even when the pixels are right.

_None._

## Controls at every state (the liveness invariant)


### 01-seeded

position: **Interview**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, download-export)

### 02-interview-round

position: **Interview**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `mcq-option-user_role-director` 
- enabled  `mcq-option-user_role-grant_writer` 
- enabled  `mcq-option-user_role-general_volunteer` 
- enabled  `mcq-other-user_role` 
- enabled  `mcq-option-current_painpoint-spreadsheet` 
- enabled  `mcq-option-current_painpoint-calendar` 
- enabled  `mcq-option-current_painpoint-sticky_notes` 
- enabled  `mcq-option-current_painpoint-email_search` 
- enabled  `mcq-other-current_painpoint` 
- enabled  `mcq-option-reminder_recipients-external_funders` 
- enabled  `mcq-option-reminder_recipients-internal_team` 
- enabled  `mcq-option-reminder_recipients-both` 
- enabled  `mcq-other-reminder_recipients` 
- enabled  `mcq-option-key_value-one_click_draft` 
- enabled  `mcq-option-key_value-automatic_alerts` 
- enabled  `mcq-option-key_value-visual_timeline` 
- enabled  `mcq-other-key_value` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 03-interview-round-answered

position: **Interview**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, download-export)

### 04-shortcuts

position: **Interview**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `shortcuts-close` Close
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, download-export)

### 05-crossed-into-constitution

position: **Constitution· Collecting**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, download-export)

### 06-constitution-round

position: **Constitution· Collecting**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `mcq-option-absolute_no_gos-auto_send` 
- enabled  `mcq-option-absolute_no_gos-public_exposure` 
- enabled  `mcq-option-absolute_no_gos-data_loss` 
- enabled  `mcq-other-absolute_no_gos` 
- enabled  `mcq-option-data_sensitivity-low_sensitivity` 
- enabled  `mcq-option-data_sensitivity-medium_sensitivity` 
- enabled  `mcq-option-data_sensitivity-high_sensitivity` 
- enabled  `mcq-other-data_sensitivity` 
- enabled  `mcq-option-out_of_scope_boundaries-writing_proposals` 
- enabled  `mcq-option-out_of_scope_boundaries-financial_tracking` 
- enabled  `mcq-option-out_of_scope_boundaries-document_storage` 
- enabled  `mcq-other-out_of_scope_boundaries` 
- enabled  `mcq-option-success_criteria_three_months-time_saved` 
- enabled  `mcq-option-success_criteria_three_months-zero_missed_deadlines` 
- enabled  `mcq-option-success_criteria_three_months-team_alignment` 
- enabled  `mcq-other-success_criteria_three_months` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, download-export)

### 07-constitution-round-answered

position: **Constitution· Collecting**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, download-export)

### 08-constitution-live-generating

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer-live` Open
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 09-constitution-viewer-over-live-stream

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer-live` Open
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `viewer-stop-generation` Stop
- enabled  `viewer-pane-close` 
- enabled  `viewer-pane-tab-outline` outline
- enabled  `viewer-pane-tab-preview` preview
- enabled  `viewer-pane-tab-raw` raw
- enabled  `viewer-pane-tab-diff` diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (stop-generation, proceed, viewer-stop-generation, download-export)

### 10-constitution-live-stream-theme-dark

position: **Constitution· Generating**, theme «dark»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer-live` Open
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `viewer-stop-generation` Stop
- enabled  `viewer-pane-close` 
- enabled  `viewer-pane-tab-outline` outline
- enabled  `viewer-pane-tab-preview` preview
- enabled  `viewer-pane-tab-raw` raw
- enabled  `viewer-pane-tab-diff` diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (stop-generation, proceed, viewer-stop-generation, download-export)

### 11-constitution-live-stream-theme-light

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer-live` Open
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `viewer-stop-generation` Stop
- enabled  `viewer-pane-close` 
- enabled  `viewer-pane-tab-outline` outline
- enabled  `viewer-pane-tab-preview` preview
- enabled  `viewer-pane-tab-raw` raw
- enabled  `viewer-pane-tab-diff` diff
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (stop-generation, proceed, viewer-stop-generation, download-export)

### 12-constitution-after-mid-stream-reload

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer-live` Open
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 13-constitution-generating

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer-live` Open
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (stop-generation, proceed, download-export)

### 14-viewer-outline

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `viewer-pane-full` Full page
- enabled  `viewer-pane-close` 
- enabled  `viewer-pane-tab-outline` outline
- enabled  `viewer-pane-tab-preview` preview
- enabled  `viewer-pane-tab-raw` raw
- enabled  `viewer-pane-tab-diff` diff
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 15-viewer-raw

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `viewer-pane-full` Full page
- enabled  `viewer-pane-close` 
- enabled  `viewer-pane-tab-outline` outline
- enabled  `viewer-pane-tab-preview` preview
- enabled  `viewer-pane-tab-raw` raw
- enabled  `viewer-pane-tab-diff` diff
- enabled  `viewer-copy` Copy markdown
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 16-constitution-drafted

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP

session-moving controls live: **4** (approve-spec, request-changes, proceed, download-export)

### 17-constitution-approved

position: **Constitution· Generating**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `open-viewer-live` Open
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (generate-spec, proceed, download-export)

### 18-constitution-review-board

position: **Constitution· Reviewing**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `review-item-checkbox-auth-smtp-contradiction` 
- enabled  `review-item-checkbox-calendar-feed-security` 
- enabled  `review-item-checkbox-mailto-character-limits` 
- enabled  `review-item-checkbox-database-dialect-ambiguity` 
- enabled  `review-accept` Accept feedback
- enabled  `review-request-changes` Request changes
- enabled  `review-ignore` Ignore
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **5** (review-accept, review-request-changes, review-ignore, proceed, download-export)

### 19-constitution-review-decided

position: **Constitution· Reviewing**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, download-export)

### 20-small-window

position: **Constitution· Reviewing**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, download-export)

### 21-small-window-collapsed

position: **Constitution· Reviewing**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `jump-to-end` 
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send

session-moving controls live: **1** (proceed)

### 22-small-window-expanded-again

position: **Constitution· Reviewing**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, download-export)

### 23-shell-theme-light

position: **Constitution· Reviewing**, theme «light»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, download-export)

### 24-shell-theme-dark

position: **Constitution· Reviewing**, theme «dark»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, download-export)

### 25-shell-theme-after-reload

position: **Constitution· Reviewing**, theme «dark»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
- enabled  `theme-toggle` 
- enabled  `back-to-project` All chats
- enabled  `sidebar-toggle` 
- enabled  `open-viewer` Open
- enabled  `proceed` Proceed to Requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- enabled  `composer-attach` 
- enabled  `model-picker` Autogemini-3.5-flashqwen3:8b
- **disabled** `chat-send` Send
- enabled  `specs-panel-open` constitution.md
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-add` Add
- enabled  `attachment-input` 
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, download-export)

### 26-project-page

_not a session page — the liveness invariant does not apply here._ theme «dark»

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `shortcuts-open` ?
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
