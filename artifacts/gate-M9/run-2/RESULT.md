# M9п gate — RESULT

Walked 2026-08-15T19:16:31.935Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: RED** — 3 problem(s), 31 state(s) captured, 0 console error(s).

## Problems

- `568s` speckit-greenfield-v1-constitution: generation ended as "error" after three attempts, not a revision
- `1235s` myspec-brownfield-v1-constitution: generation ended as "error" after three attempts, not a revision
- `1266s` edit: start: could not click `start-edit-chat`

## Review boards, and what the linters found on each

The M8п open question, answered per board. Zero machine items is a valid count on a clean
document — the record is the evidence that the deterministic pass ran, not the number it found.

_None._

## What happened

- `1s` — walking speckit-greenfield-v1 —
- `2s` speckit-greenfield-v1: badge «SpecKit · Greenfield · V1», steps «1 Interview → 2 Constitution → 3 Specify → 4 Plan → 5 Tasks → 6 Complete»
- `194s` speckit-greenfield-v1-interview: the answered round stayed in the feed, fixed
- `194s` speckit-greenfield-v1: after a reload the header still reads «Interview»
- `289s` speckit-greenfield-v1-constitution: the answered round stayed in the feed, fixed
- `568s` — walking myspec-brownfield-v1 —
- `569s` myspec-brownfield-v1: badge «MySpec · Brownfield · V1», steps «1 Interview → 2 Proposal → 3 Requirements → 4 Tasks → 5 Complete»
- `733s` myspec-brownfield-v1-interview: the answered round stayed in the feed, fixed
- `922s` myspec-brownfield-v1-constitution: the answered round stayed in the feed, fixed
- `1235s` — the Edit chat —
- `1236s` the Reference step offers 0 approved document(s)
- `1266s` — the model picker —
- `1266s` the picker offers: Auto, gemini-3.5-flash, qwen2.5:14b-instruct-q4_K_M
- `1268s` the choice is persisted on the session: ollama
- `1268s` the choice survives a reload
- `1269s` the pinned model answered a chat message

## Timings

- speckit-greenfield-v1-interview question round: 111 s
- speckit-greenfield-v1-constitution question round: 92.4 s
- speckit-greenfield-v1-constitution generation: 98.6 s
- speckit-greenfield-v1-constitution-retry-1 generation: 82.1 s
- speckit-greenfield-v1-constitution-retry-2 generation: 98 s
- myspec-brownfield-v1-interview question round: 76.9 s
- myspec-brownfield-v1-constitution question round: 186.2 s
- myspec-brownfield-v1-constitution generation: 93.8 s
- myspec-brownfield-v1-constitution-retry-1 generation: 100.6 s
- myspec-brownfield-v1-constitution-retry-2 generation: 117.9 s
- local-model reply: 0.1 s

## Retries

- speckit-greenfield-v1-constitution: the draft was refused; pressing the page's own retry (2 of 3)
- speckit-greenfield-v1-constitution: the draft was refused; pressing the page's own retry (3 of 3)
- myspec-brownfield-v1-constitution: the draft was refused; pressing the page's own retry (2 of 3)
- myspec-brownfield-v1-constitution: the draft was refused; pressing the page's own retry (3 of 3)

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
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
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
- enabled  `mcq-option-Q1_usage_and_goals-CFO` 
- enabled  `mcq-option-Q1_usage_and_goals-ProgramManager` 
- enabled  `mcq-option-Q1_usage_and_goals-GrantCoordinator` 
- enabled  `mcq-other-Q1_usage_and_goals` 
- enabled  `mcq-option-Q2_current_workflow-ManualCalendarTracks` 
- enabled  `mcq-option-Q2_current_workflow-EmailRemindersManuallyDrafted` 
- enabled  `mcq-option-Q2_current_workflow-SpreadsheetTracking` 
- enabled  `mcq-other-Q2_current_workflow` 
- enabled  `mcq-option-Q3_desired_benefits-AutomaticRemindersAndTracking` 
- enabled  `mcq-option-Q3_desired_benefits-SavesTimeOnEmailDrafting` 
- enabled  `mcq-option-Q3_desired_benefits-SimplifiesSpreadsheetManagement` 
- enabled  `mcq-other-Q3_desired_benefits` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
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
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
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
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
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
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
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
- enabled  `mcq-option-q3-o7` 
- enabled  `mcq-option-q3-o8` 
- enabled  `mcq-option-q3-o9` 
- enabled  `mcq-other-q3` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
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
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
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
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (stop-generation, proceed)

### 10-speckit-greenfield-v1-constitution-refused-1

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Try again
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)

### 11-speckit-greenfield-v1-constitution-retry-1-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (stop-generation, proceed)

### 12-speckit-greenfield-v1-constitution-refused-2

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Try again
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)

### 13-speckit-greenfield-v1-constitution-retry-2-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (stop-generation, proceed)

### 14-speckit-greenfield-v1-constitution-generation-failed

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Try again
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)

### 15-myspec-brownfield-v1-picker

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

### 16-myspec-brownfield-v1-seeded

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (ask-round, proceed)

### 17-myspec-brownfield-v1-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-use-case-character-grant-manager` 
- enabled  `mcq-option-use-case-character-volunteer-coordinator` 
- enabled  `mcq-other-use-case-character` 
- enabled  `mcq-option-current-approach-manual-calendar` 
- enabled  `mcq-option-current-approach-spreadsheet` 
- enabled  `mcq-other-current-approach` 
- enabled  `mcq-option-pain-points-frequent-errors` 
- enabled  `mcq-option-pain-points-time-consuming` 
- enabled  `mcq-other-pain-points` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (mcq-reply-toggle)

### 18-myspec-brownfield-v1-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to Constitution
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (ask-round, proceed)

### 19-myspec-brownfield-v1-after-interview

position: **Proposal· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (ask-round, proceed)

### 20-myspec-brownfield-v1-constitution-round

position: **Proposal· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `mcq-option-1-1a` 
- enabled  `mcq-option-1-1b` 
- enabled  `mcq-other-1` 
- enabled  `mcq-option-2-2a` 
- enabled  `mcq-option-2-2b` 
- enabled  `mcq-other-2` 
- enabled  `mcq-option-3-3a` 
- enabled  `mcq-option-3-3b` 
- enabled  `mcq-other-3` 
- **disabled** `mcq-submit` Submit Answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **1** (mcq-reply-toggle)

### 21-myspec-brownfield-v1-constitution-round-answered

position: **Proposal· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (ask-round, proceed)

### 22-myspec-brownfield-v1-constitution-generating

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (stop-generation, proceed)

### 23-myspec-brownfield-v1-constitution-refused-1

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Try again
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)

### 24-myspec-brownfield-v1-constitution-retry-1-generating

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (stop-generation, proceed)

### 25-myspec-brownfield-v1-constitution-refused-2

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Try again
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)

### 26-myspec-brownfield-v1-constitution-retry-2-generating

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `stop-generation` Stop
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (stop-generation, proceed)

### 27-myspec-brownfield-v1-constitution-generation-failed

position: **Proposal· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Try again
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)

### 28-edit-project-page

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
- **disabled** `mcp-add-server` Add server

session-moving controls live: **0** (none)

### 29-could-not-click-start-edit-chat

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
- **disabled** `mcp-add-server` Add server

session-moving controls live: **0** (none)

### 30-model-picked

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)

### 31-model-answered

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `back-to-project` All chats
- enabled  `generate-spec` Generate
- enabled  `proceed` Proceed to review
- enabled  `model-picker` Autogemini-3.5-flashqwen2.5:14b-instruct
- enabled  `chat-message` 
- **disabled** `chat-send` Sending…
- **disabled** `mount-folder` Mount folder
- enabled  `attachment-input` 
- enabled  `download-export` Download ZIP
- enabled  `sidebar-toggle` ›

session-moving controls live: **2** (generate-spec, proceed)
