# M6 gate walk — result

Journey: prompt → interview → four documents → ZIP, driven through a browser against the live
provider chain. Idea: _A web app that helps a small climbing gym schedule its instructors and take class bookings_

**Verdict: GREEN — no problems found**

Steps captured: 56 · wall clock: 46 min

## Problems

_None._

## Uncaught errors in the browser

- console: Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)

## Timings, per model call

- interview question round: 114.6 s
- interview question round: 533.5 s
- constitution question round: 539.6 s
- constitution generation: 147.3 s
- constitution review: 94.8 s
- requirements question round: 97.8 s
- requirements generation: 183.9 s
- requirements review: 109.4 s
- solution question round: 80 s
- solution generation: 178.7 s
- solution review: 96.3 s
- tasks question round: 113 s
- tasks generation: 140.5 s
- tasks review: 94.3 s

## Calls that had to be repeated

- interview: the ask produced nothing; asking again (2 of 3)
- constitution: the ask produced nothing; asking again (2 of 3)

## What happened, in order

- `4s` —— interview ——
- `119s` interview: pending question card survived a reload
- `745s` interview: pending question card survived a reload
- `812s` —— constitution ——
- `1352s` constitution: pending question card survived a reload
- `1473s` constitution: leaving the page mid-generation, on purpose
- `1480s` constitution: back on the session page after the disconnect
- `1480s` constitution: the returning page reattached to the run in flight — Stop offered, not Generate
- `1480s` constitution: exactly one generation run for the stage — no duplicate (M3 resume rule)
- `1500s` constitution: revision written and structurally valid (a spec card is the section schema passing)
- `1501s` constitution: pending approval survived a reload
- `1597s` constitution: pending review board survived a reload
- `1604s` —— requirements ——
- `1702s` requirements: pending question card survived a reload
- `1887s` requirements: revision written and structurally valid (a spec card is the section schema passing)
- `1888s` requirements: pending approval survived a reload
- `1998s` requirements: pending review board survived a reload
- `2005s` —— solution ——
- `2085s` solution: pending question card survived a reload
- `2265s` solution: revision written and structurally valid (a spec card is the section schema passing)
- `2265s` solution: pending approval survived a reload
- `2362s` solution: pending review board survived a reload
- `2369s` —— tasks ——
- `2483s` tasks: pending question card survived a reload
- `2624s` tasks: revision written and structurally valid (a spec card is the section schema passing)
- `2624s` tasks: pending approval survived a reload
- `2720s` tasks: pending review board survived a reload
- `2726s` export mode shown at the moment of download: "default" (constitution A6)
- `2728s` the archive holds: constitution.md, requirements.md, solution.md, tasks.md
- `2728s`   constitution.md: 3543 characters
- `2728s`   requirements.md: 4887 characters
- `2728s`   solution.md: 5880 characters
- `2728s`   tasks.md: 3927 characters
- `2728s` the archive is exactly the four parity files, with their exact names (P3)

## Controls at every state

The Д-1/Р-3 liveness invariant, observed live rather than against a stub: every state below
lists its controls and how many of the session-moving ones were usable.


### 01-projects-empty

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `prompt-input` 
- enabled  `create-project` Start a session

session-moving controls live: **0** (none)

### 02-session-created

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to constitution
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 03-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-user-roles-gym-owner` 
- enabled  `mcq-option-user-roles-front-desk-staff` 
- enabled  `mcq-option-user-roles-instructors` 
- enabled  `mcq-option-user-roles-clients-members` 
- enabled  `mcq-other-user-roles` 
- enabled  `mcq-option-current-problems-paper-system` 
- enabled  `mcq-option-current-problems-manual-updates` 
- enabled  `mcq-option-current-problems-communication-issues` 
- enabled  `mcq-option-current-problems-unsold-spots` 
- enabled  `mcq-other-current-problems` 
- enabled  `mcq-option-app-expectations-real-time-updates` 
- enabled  `mcq-option-app-expectations-booking-integrations` 
- enabled  `mcq-option-app-expectations-automated-communication` 
- enabled  `mcq-option-app-expectations-client-dashboard` 
- enabled  `mcq-other-app-expectations` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 04-interview-round-after-reload

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-user-roles-gym-owner` 
- enabled  `mcq-option-user-roles-front-desk-staff` 
- enabled  `mcq-option-user-roles-instructors` 
- enabled  `mcq-option-user-roles-clients-members` 
- enabled  `mcq-other-user-roles` 
- enabled  `mcq-option-current-problems-paper-system` 
- enabled  `mcq-option-current-problems-manual-updates` 
- enabled  `mcq-option-current-problems-communication-issues` 
- enabled  `mcq-option-current-problems-unsold-spots` 
- enabled  `mcq-other-current-problems` 
- enabled  `mcq-option-app-expectations-real-time-updates` 
- enabled  `mcq-option-app-expectations-booking-integrations` 
- enabled  `mcq-option-app-expectations-automated-communication` 
- enabled  `mcq-option-app-expectations-client-dashboard` 
- enabled  `mcq-other-app-expectations` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 05-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to constitution
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 06-interview-round

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-usage-patterns-daily-schedule-update` 
- enabled  `mcq-option-usage-patterns-weekly-overview-check` 
- enabled  `mcq-option-usage-patterns-hourly-slot-reservation` 
- enabled  `mcq-option-usage-patterns-monthly-payment-reminder` 
- enabled  `mcq-other-usage-patterns` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 07-interview-round-after-reload

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-usage-patterns-daily-schedule-update` 
- enabled  `mcq-option-usage-patterns-weekly-overview-check` 
- enabled  `mcq-option-usage-patterns-hourly-slot-reservation` 
- enabled  `mcq-option-usage-patterns-monthly-payment-reminder` 
- enabled  `mcq-other-usage-patterns` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 08-interview-round-answered

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to constitution
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 09-interview-complete

position: **Interview**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to constitution
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 10-constitution-collect

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 11-constitution-round

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-1a0b2c3d4e5f6g7h8i9jklmn-essentialFunctionality` 
- enabled  `mcq-option-1a0b2c3d4e5f6g7h8i9jklmn-customerBookings` 
- enabled  `mcq-option-1a0b2c3d4e5f6g7h8i9jklmn-smoothCommunication` 
- enabled  `mcq-other-1a0b2c3d4e5f6g7h8i9jklmn` 
- enabled  `mcq-option-nopqrstuvwxyz1234567890abcde-explicitConsentNeeded` 
- enabled  `mcq-option-nopqrstuvwxyz1234567890abcde-privateContacts` 
- enabled  `mcq-option-nopqrstuvwxyz1234567890abcde-paymentDetails` 
- enabled  `mcq-other-nopqrstuvwxyz1234567890abcde` 
- enabled  `mcq-option-defghijklmnopqrstuvwx10zy234abcdcde-avoidComplexFeatures` 
- enabled  `mcq-option-defghijklmnopqrstuvwx10zy234abcdcde-skipEmailNotifications` 
- enabled  `mcq-option-defghijklmnopqrstuvwx10zy234abcdcde-stayAwayFromSocialMedia` 
- enabled  `mcq-other-defghijklmnopqrstuvwx10zy234abcdcde` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 12-constitution-round-after-reload

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-1a0b2c3d4e5f6g7h8i9jklmn-essentialFunctionality` 
- enabled  `mcq-option-1a0b2c3d4e5f6g7h8i9jklmn-customerBookings` 
- enabled  `mcq-option-1a0b2c3d4e5f6g7h8i9jklmn-smoothCommunication` 
- enabled  `mcq-other-1a0b2c3d4e5f6g7h8i9jklmn` 
- enabled  `mcq-option-nopqrstuvwxyz1234567890abcde-explicitConsentNeeded` 
- enabled  `mcq-option-nopqrstuvwxyz1234567890abcde-privateContacts` 
- enabled  `mcq-option-nopqrstuvwxyz1234567890abcde-paymentDetails` 
- enabled  `mcq-other-nopqrstuvwxyz1234567890abcde` 
- enabled  `mcq-option-defghijklmnopqrstuvwx10zy234abcdcde-avoidComplexFeatures` 
- enabled  `mcq-option-defghijklmnopqrstuvwx10zy234abcdcde-skipEmailNotifications` 
- enabled  `mcq-option-defghijklmnopqrstuvwx10zy234abcdcde-stayAwayFromSocialMedia` 
- enabled  `mcq-other-defghijklmnopqrstuvwx10zy234abcdcde` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 13-constitution-round-answered

position: **Constitution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 14-constitution-generate

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `generate-spec` Generate
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (generate-spec, chat-message)

### 15-constitution-generating

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `stop-generation` Stop
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (stop-generation, chat-message)

### 16-constitution-left-mid-generation

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `prompt-input` 
- enabled  `create-project` Start a session
- enabled  `project-row` A web app that helps a small climbing gy
- enabled  `rename-project` Rename
- enabled  `duplicate-project` Duplicate
- enabled  `delete-project` Delete

session-moving controls live: **0** (none)

### 17-constitution-returned-mid-generation

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `stop-generation` Stop
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (stop-generation, chat-message)

### 18-constitution-drafted

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- **disabled** `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (approve-spec, request-changes, chat-message)

### 19-constitution-approved

position: **Constitution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 20-constitution-review-board

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- **disabled** `proceed` Proceed to requirements
- enabled  `review-item-checkbox-vague_acceptance_criterion_01` 
- enabled  `review-accept` Accept
- enabled  `review-ignore` Ignore
- **disabled** `review-request-changes` Request changes
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (review-accept, review-ignore, chat-message)

### 21-constitution-review-decided

position: **Constitution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Proceed to requirements
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 22-constitution-left

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 23-requirements-round

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-1-view_schedule` 
- enabled  `mcq-option-1-update_schedule` 
- enabled  `mcq-option-1-swap_shifts` 
- enabled  `mcq-option-1-check_bookings` 
- enabled  `mcq-other-1` 
- enabled  `mcq-option-2-browse_classes` 
- enabled  `mcq-option-2-book_class` 
- enabled  `mcq-option-2-cancel_booking` 
- enabled  `mcq-option-2-check_availability` 
- enabled  `mcq-other-2` 
- enabled  `mcq-option-3-send_reminders` 
- enabled  `mcq-option-3-notify_bookings` 
- enabled  `mcq-option-3-update_attendance` 
- enabled  `mcq-other-3` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 24-requirements-round-after-reload

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-1-view_schedule` 
- enabled  `mcq-option-1-update_schedule` 
- enabled  `mcq-option-1-swap_shifts` 
- enabled  `mcq-option-1-check_bookings` 
- enabled  `mcq-other-1` 
- enabled  `mcq-option-2-browse_classes` 
- enabled  `mcq-option-2-book_class` 
- enabled  `mcq-option-2-cancel_booking` 
- enabled  `mcq-option-2-check_availability` 
- enabled  `mcq-other-2` 
- enabled  `mcq-option-3-send_reminders` 
- enabled  `mcq-option-3-notify_bookings` 
- enabled  `mcq-option-3-update_attendance` 
- enabled  `mcq-other-3` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 25-requirements-round-answered

position: **Requirements· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 26-requirements-generate

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `generate-spec` Generate
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (generate-spec, chat-message)

### 27-requirements-generating

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `stop-generation` Stop
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (stop-generation, chat-message)

### 28-requirements-drafted

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- **disabled** `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (approve-spec, request-changes, chat-message)

### 29-requirements-approved

position: **Requirements· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 30-requirements-review-board

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- **disabled** `proceed` Proceed to solution
- enabled  `review-item-checkbox-overlapping-features` 
- enabled  `review-item-checkbox-vague-performance` 
- enabled  `review-accept` Accept
- enabled  `review-ignore` Ignore
- **disabled** `review-request-changes` Request changes
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (review-accept, review-ignore, chat-message)

### 31-requirements-review-decided

position: **Requirements· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Proceed to solution
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 32-requirements-left

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 33-solution-round

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-1-1` 
- enabled  `mcq-option-1-2` 
- enabled  `mcq-option-1-3` 
- enabled  `mcq-other-1` 
- enabled  `mcq-option-2-1` 
- enabled  `mcq-option-2-2` 
- enabled  `mcq-other-2` 
- enabled  `mcq-option-3-1` 
- enabled  `mcq-option-3-2` 
- enabled  `mcq-option-3-3` 
- enabled  `mcq-other-3` 
- enabled  `mcq-option-4-1` 
- enabled  `mcq-option-4-2` 
- enabled  `mcq-other-4` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 34-solution-round-after-reload

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-1-1` 
- enabled  `mcq-option-1-2` 
- enabled  `mcq-option-1-3` 
- enabled  `mcq-other-1` 
- enabled  `mcq-option-2-1` 
- enabled  `mcq-option-2-2` 
- enabled  `mcq-other-2` 
- enabled  `mcq-option-3-1` 
- enabled  `mcq-option-3-2` 
- enabled  `mcq-option-3-3` 
- enabled  `mcq-other-3` 
- enabled  `mcq-option-4-1` 
- enabled  `mcq-option-4-2` 
- enabled  `mcq-other-4` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 35-solution-round-answered

position: **Solution· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 36-solution-generate

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `generate-spec` Generate
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (generate-spec, chat-message)

### 37-solution-generating

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `stop-generation` Stop
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (stop-generation, chat-message)

### 38-solution-drafted

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- **disabled** `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (approve-spec, request-changes, chat-message)

### 39-solution-approved

position: **Solution· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 40-solution-review-board

position: **Solution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- **disabled** `proceed` Proceed to tasks
- enabled  `review-item-checkbox-untestable-criteria` 
- enabled  `review-accept` Accept
- enabled  `review-ignore` Ignore
- **disabled** `review-request-changes` Request changes
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (review-accept, review-ignore, chat-message)

### 41-solution-review-decided

position: **Solution· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Proceed to tasks
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 42-solution-left

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 43-tasks-round

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-initial-feature-set-instructor-scheduling` 
- enabled  `mcq-option-initial-feature-set-class-booking` 
- enabled  `mcq-option-initial-feature-set-dashboard` 
- enabled  `mcq-option-initial-feature-set-reporting-tools` 
- enabled  `mcq-option-initial-feature-set-payment-integration` 
- enabled  `mcq-other-initial-feature-set` 
- enabled  `mcq-option-non-critical-items-social-media-login` 
- enabled  `mcq-option-non-critical-items-video-tutorials` 
- enabled  `mcq-option-non-critical-items-online-payment` 
- enabled  `mcq-option-non-critical-items-mobile-optimization` 
- enabled  `mcq-other-non-critical-items` 
- enabled  `mcq-option-fixed-dates-yes-fixed-date` 
- enabled  `mcq-option-fixed-dates-no-fixed-date` 
- enabled  `mcq-other-fixed-dates` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 44-tasks-round-after-reload

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `mcq-option-initial-feature-set-instructor-scheduling` 
- enabled  `mcq-option-initial-feature-set-class-booking` 
- enabled  `mcq-option-initial-feature-set-dashboard` 
- enabled  `mcq-option-initial-feature-set-reporting-tools` 
- enabled  `mcq-option-initial-feature-set-payment-integration` 
- enabled  `mcq-other-initial-feature-set` 
- enabled  `mcq-option-non-critical-items-social-media-login` 
- enabled  `mcq-option-non-critical-items-video-tutorials` 
- enabled  `mcq-option-non-critical-items-online-payment` 
- enabled  `mcq-option-non-critical-items-mobile-optimization` 
- enabled  `mcq-other-non-critical-items` 
- enabled  `mcq-option-fixed-dates-yes-fixed-date` 
- enabled  `mcq-option-fixed-dates-no-fixed-date` 
- enabled  `mcq-other-fixed-dates` 
- **disabled** `mcq-submit` Submit answers
- enabled  `mcq-reply-toggle` Answer in your own words instead
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (mcq-reply-toggle, chat-message)

### 45-tasks-round-answered

position: **Tasks· collect**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `ask-round` Ask questions
- enabled  `proceed` Proceed to drafting
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (ask-round, proceed, chat-message)

### 46-tasks-generate

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `generate-spec` Generate
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (generate-spec, chat-message)

### 47-tasks-generating

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `stop-generation` Stop
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (stop-generation, chat-message)

### 48-tasks-drafted

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `approve-spec` Approve
- enabled  `request-changes` Request changes
- **disabled** `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (approve-spec, request-changes, chat-message)

### 49-tasks-approved

position: **Tasks· generate**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Proceed to review
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 50-tasks-review-board

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- **disabled** `proceed` Finish and seal the session
- enabled  `review-item-checkbox-vague_overview_acceptance` 
- enabled  `review-item-checkbox-inconsistent_risks_sequencing` 
- enabled  `review-item-checkbox-clarify_security_mitigation` 
- enabled  `review-accept` Accept
- enabled  `review-ignore` Ignore
- **disabled** `review-request-changes` Request changes
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **3** (review-accept, review-ignore, chat-message)

### 51-tasks-review-decided

position: **Tasks· review**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `proceed` Finish and seal the session
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **2** (proceed, chat-message)

### 52-tasks-left

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **1** (chat-message)

### 53-session-complete

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **1** (chat-message)

### 54-exported

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **1** (chat-message)

### 55-projects-listing

_not a session page — the liveness invariant does not apply here._

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `prompt-input` 
- enabled  `create-project` Start a session
- enabled  `project-row` A web app that helps a small climbing gy
- enabled  `rename-project` Rename
- enabled  `duplicate-project` Duplicate
- enabled  `delete-project` Delete

session-moving controls live: **0** (none)

### 56-session-reopened

position: **Complete**

- enabled  `INPUT` 
- enabled  `sign-out` Sign out
- enabled  `attachment-input` 
- enabled  `refine-instruction` 
- **disabled** `submit-refinement` Propose change
- enabled  `chat-message` 
- **disabled** `chat-send` Send
- enabled  `copy-constitution.md` Copy
- enabled  `copy-requirements.md` Copy
- enabled  `copy-solution.md` Copy
- enabled  `copy-tasks.md` Copy
- enabled  `download-export` Download ZIP

session-moving controls live: **1** (chat-message)