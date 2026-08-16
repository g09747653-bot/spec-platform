# M9п gate — what the models said

### speckit-greenfield-v1-interview — the round asked

```
Who is going to open this tool on a Monday morning to check on these grant deadlines?*
Select one
A single founder or director(Recommended)
One busy person who manages fundraising alongside all other charity operations.
A part-time fundraiser or volunteer
Someone specifically tasked with securing grants, working a few hours a week.
A small team of 2-3 people
Multiple staff members or trustees who need to share the workload and see who is doing what.
Other — your own answer
How do you keep track of these deadlines right now, and what is the biggest headache with that?*
Select one
A spreadsheet that gets out of date(Recommended)
We use Excel or Google Sheets, but we forget to update it and it doesn't remind us of anything.
Calendar events that get buried
We put deadlines on a Google/Outlook calendar, but they blend in with meetings and we still have to write emails from scratch.
Notebooks, sticky notes, or mental notes
We mostly rely on memory and physical notes, which makes it easy for a deadline to slip through the cracks entirely.
Other — your own answer
What would make this tool an instant lifesaver for you?*
Select one
A fully written email draft ready to copy and paste(Recommended)
The tool writes the reminder email for me, matching our tone, so I just have to review and hit send.
An automatic weekly email summary
Receiving a single email every Monday morning showing exactly what is due in the next two weeks.
A simple, color-coded countdown dashboard
A clean page where approaching deadlines turn yellow and overdue ones turn bright red.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the round asked

```
When it comes to sending these reminder emails, what is the golden rule this tool must never break?*
Select one
Show me the draft, but never send it yourself(Recommended)
The tool only writes the text; you always copy-paste or click send yourself so you are always in control.
Let me click a 'Send' button inside the tool
The tool connects to your email account and sends the email directly once you click an approval button.
Send them completely automatically on a schedule
The tool sends the reminders on the due date without making you log in to check them first.
Other — your own answer
What level of private information will you be typing into this tracker?*
Select one
Just basic dates and names(Recommended)
Funder names, deadline dates, and public contact email addresses. Nothing highly confidential.
Funding amounts and personal relationship notes
How much money you are asking for, and private notes about your conversations with the funder.
Uploading draft proposals and tax documents
Highly sensitive financial documents and draft proposals that the AI needs to read to understand your charity.
Other — your own answer
To make sure we get this built quickly, what should we completely stay out of at first?*
Select all that apply
Writing the actual grant applications(Recommended)
We won't try to help you write the massive 10-page proposals, just the short follow-ups and deadline reminders.
Tracking bank accounts and charity budgets
We will not connect to your bank accounts or track how the grant money is spent once you receive it.
Shared team boards and task assignments
This is built just for you, the founder; we won't build features to assign tasks to other volunteers or board members.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the document

```
# GrantReminder Constitution

## Core Principles

### I. Absolute Email Air Gap (NON-NEGOTIABLE)
The application must never send emails automatically under any circumstances. There must be no direct SMTP configuration, background queue workers, or automated APIs capable of transmitting messages to funders. All generated emails must be presented solely as raw draft text inside the user interface, with standard copy-to-clipboard or "mailto:" actions. This ensures the solo director retains absolute manual control over the final message copy, preventing accidental, unverified, or incomplete communications from reaching external foundations.

### II. Strictly Bounded Scope (No Grant Writing)
The system is explicitly restricted to tracking deadlines and drafting administrative/follow-up reminders. It must never attempt to write the actual content of grant proposals, summarize impact studies, or generate funding pitches. By focusing purely on operational logistics and basic template-based reminders, the platform remains highly reliable, predictable, and free from the hallucinations or complexities associated with automated generative prose.

### III. Spreadsheet-Simple Utility
The interface and data structures must directly address the pain point of migrating away from a messy spreadsheet. Avoid the bloat of traditional Customer Relationship Management (CRM) or heavyweight grant management software. Data entry, search, and status updates must feel instantaneous, clean, and transparent, presenting a clear timeline view of upcoming deadlines on a single dashboard with minimal navigational layers.

### IV. Low Data Sensitivity & Privacy-First Architecture
Because the system stores basic, publicly available information (such as foundation names, standard deadlines, and public contact emails), it should avoid over-engineered security architecture in favor of clean, robust data safety defaults. The data footprint must be kept local and simple, ensuring the solo director owns and can export their tracking database at any time, with zero tracking scripts or unnecessary third-party analytic platforms.

### V. Solo-Director Focused Ergonomics
The application is designed specifically for a time-constrained, solo charity director who handles administrative tasks in quick blocks of time. Workflows must optimize for speed and clarity: one-click copy buttons for drafts, color-coded urgency indicators for deadlines, and a layout that allows the user to see exactly what requires 
```

### speckit-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The GrantReminder Constitution establishes strong, clear architectural guardrails—particularly the absolute email air gap and the ban on generative AI. However, it lacks critical operational details needed for a coding agent to build and test the application without guessing. Specifically, the urgency thresholds for the color-coded deadline indicators are undefined, the target database engine is left unspecified, and the nature of the visual verification gate is ambiguous.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Undefined Urgency Tiers and Color Codes
Confidence score 9/10
Core Principles — V. Solo-Director Focused Ergonomics
The specification requires 'color-coded urgency indicators for deadlines' and automated unit testing for 'visual urgency calculations', but fails to define the specific time thresholds (e.g., under 3 days, under 7 days) or the corresponding colors/states (e.g., Red, Yellow, Green) for these indicators. A coding agent would have to invent these thresholds, making the unit tests arbitrary and untestable against a strict standard.
Suggestion: Define the precise time windows and color mappings for each urgency state (e.g., 'Overdue: Red, Imminent (0-3 days): Orange, Pending (4-14 days): Yellow, Safe (>14 days): Green').
Recommendations (2)
Unspecified Primary Database Technology
Confidence score 8/10
Operational and Technical Boundaries — Data Storage & Flat-File Portability
The document mentions keeping the 'data footprint local and simple' and using a 'highly readable schema' with JSON/CSV exports, but does not specify the target database technology (e.g., SQLite, PostgreSQL, or client-side IndexedDB/localStorage). Without this, the agent might choose an inappropriate or overly complex database engine that contradicts the 'spreadsheet-simple' philosophy.
Suggestion: Explicitly state the preferred database engine (e.g., 'The application must use a local SQLite database' or 'The application must use client-side IndexedDB').
Ambiguous 'Visual Verification Gate'
Confidence score 8/10
Quality Gates and Verification — Visual Guardrails Audit
The requirement states that every draft page must 'pass a visual verification gate' to ensure no layout flow mimics an 'instant send' action, but does not specify whether this gate is a manual design review checklist or an automated visual regression test suite.
Suggestion: Clarify if this is a manual review
```

### speckit-greenfield-v1-requirements — the round asked

```
How would you prefer to enter the grant details, and how should the tool hand over the drafted emails to you?*
Select one
Fill out a quick online form(Recommended)
You type the funder's name and due date into a simple form, and the tool displays the draft email on your screen to copy and paste.
Forward an email to the tool
You forward the funder's original email to a special address, and the tool automatically extracts the dates and drafts a reply.
Upload a guideline document or link
You upload a PDF of the grant guidelines or paste a website link, and the tool reads it to find the dates and draft the email.
Other — your own answer
Will anyone else need to log in to this tool, or is it just for you?*
Select one
Just me(Recommended)
A private, secure login just for you. No need to manage other accounts or permissions.
Me and a small team
A few team members or volunteers can log in, but only you (the director) can approve and export the draft emails.
Shared login for anyone helping
A simple shared password where anyone on the team can log in, edit deadlines, and see the drafts with equal access.
Other — your own answer
How do you want the tool to remind you about upcoming deadlines?*
Select one
A weekly Monday morning email(Recommended)
The tool automatically sends you an email every Monday morning with your upcoming deadlines and the pre-written drafts ready to copy.
No automatic emails—just show me when I log in
You log into a clean web dashboard on your own time to see your deadlines on a calendar and generate drafts manually.
Instant alerts as deadlines get close
The tool sends you an email or text alert exactly 7 days, 3 days, and 24 hours before a grant is due.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-requirements — the document

```
# Feature Specification: GrantReminder Core Tracker & Draft Engine

**Feature Branch**: `101-grantreminder-tracker-draft-engine`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails"

## User Scenarios & Testing

### User Story 1 - Simple Grant Dashboard & Quick Deadline Visualization (Priority: P1)

The solo charity director logs into their dashboard to see an immediate, clear overview of their grant applications. Because they are time-constrained and moving away from a messy, disorganized spreadsheet, they need to quickly understand which deadlines are critical without navigating complex menus.

**Why this priority**: Delivering an immediate, prioritized view of upcoming deadlines addresses the core pain point of spreadsheet fatigue. It provides instant operational value as a tracking tool even before draft generation features are used.

**Independent Test**: Can be fully tested by loading a mock database with three grant milestones (due in 3 days, 15 days, and 45 days) and confirming that the dashboard displays them with correct days-remaining counts and color-coded urgency alerts.

**Acceptance Scenarios**:

1. **Given** a database with three active grant milestones:
   - "Community Chest LOI" due in 3 days
   - "Youth Development Proposal" due in 15 days
   - "Green Trust Report" due in 45 days
   **When** the user loads the dashboard
   **Then** they see all three milestones ordered chronologically, with the 3-day milestone highlighted in red, the 15-day milestone highlighted in yellow, and the 45-day milestone highlighted in green.
2. **Given** the dashboard is loaded with multiple items
   **When** the user checks the total time to view key details
   **Then** they must be able to read the foundation name, milestone title, due date, and days remaining for all active entries on a single screen with no scrolling required for up to 10 entries.

---

### User Story 2 - Adding and Editing Grants via Simple Form (Priority: P2)

The solo director needs to quickly log a new grant opportunity or update an existing milestone's status when a funder responds. The process must feel fast, with minimal required fields and clear validation.

**Why this priority**: To replace a spreadsheet, the tool must capture and modify tracking data reliably without forcing the user to navigate bloated CRM workflows.

**Independent Test**: Can be fully 
```

### speckit-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The Feature Specification for the GrantReminder Core Tracker & Draft Engine details a clean, local-first application designed to track grant milestones and draft follow-up emails securely. While the core dashboard layout and the air-gap constraints are well-defined, the document contains several significant gaps that would leave a coding agent guessing. Specifically, the success criteria reference a database import mechanism that is otherwise completely absent from the functional requirements and user stories, the required 'director_name' template variable has no matching database or settings field, and there is no UI workflow specified for creating or managing nested Milestones. Resolving these issues is necessary to make the specification fully actionable and testable.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Undefined Import Mechanism Referenced in Success Criteria
Confidence score 10/10
Success Criteria — Measurable Outcomes
Success criterion SC-003 states that '100% of exported database files are parsed cleanly by the system’s import mechanism, leaving no fields empty or mismatched.' However, there is no corresponding functional requirement or User Story describing this import mechanism, its interface, or how it should handle existing local storage data.
Suggestion: Add a new Functional Requirement (e.g., FR-012) and an acceptance scenario in User Story 4 specifying the import mechanism, including its user interface triggers, format validation, and database overwrite/merge behavior.
Template Key 'director_name' Missing from Schema and Inputs
Confidence score 10/10
Requirements — Functional Requirements
FR-005 states that text templates must assemble drafts using the keys: 'funder_name', 'milestone_title', 'due_date', and 'director_name'. However, 'director_name' is not a property of either the 'Grant' or 'Milestone' entities, nor is there any mention of a global profile or settings screen where the user would input this name.
Suggestion: Either add a global application settings configuration that stores a 'director_name' value, add it as a field in the Grant entity schema, or define a fallback hardcoded value to prevent runtime template errors.
Lack of Form and UI Specification for Milestone Creation
Confidence score 9/10
User Scenarios & Testing — User Story 2
FR-008 requires the system to allow users to add, edit, and delete Grant records and nested Mil
```

### speckit-greenfield-v1-solution — the round asked

```
When you are checking these deadlines or grabbing these email drafts, what device are you using and where are you sitting?*
Select one
At my desk on a laptop or computer(Recommended)
We will build a clean web page designed for large screens, assuming you always have a working internet connection.
On both my phone on-the-go and my computer at my desk
The tool will adapt smoothly to phone screens so you can review deadlines while traveling.
Sometimes offline (like on a plane or train with no Wi-Fi)
We will build it to save data on your device so you can still read deadlines and drafts without internet.
Other — your own answer
How do you want this tool to connect with the email and calendar accounts you already use?*
Select all that apply
Just show me the text so I can copy-paste it myself(Recommended)
Simple and secure; you manually copy the draft and paste it into Gmail, Outlook, or whatever you use.
Send the emails directly from the tool using my Gmail/Outlook account
You click 'Send' inside the tool and it sends the email through your real address (requires linking your account).
Put the grant deadlines directly onto my Google or Outlook calendar
Deadlines will automatically appear on your personal calendar alongside your other meetings.
Other — your own answer
Who is actually going to log in and use this tool on a regular basis?*
Select one
Just me (the founder or director)(Recommended)
One login, keeping things incredibly simple and focused on your personal workflow.
Me and a couple of volunteers or co-founders
We will set up shared access so 2 to 5 people can see, edit, and check off the same deadlines.
Mainly me, but I need to easily share reports with my board of trustees
You manage the work, but you can export a quick list or PDF to show others what's coming up.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-solution — the document

```
# Implementation Plan: GrantReminder Core Tracker & Draft Engine

**Branch**: `101-grantreminder-tracker-draft-engine` | **Date**: 2026-07-24 | **Spec**: `/specs/101-grantreminder-tracker-draft-engine/requirements.md`

## Summary

The GrantReminder Core Tracker & Draft Engine is a secure, local-first web utility built to help a solo charity director manage upcoming grant milestones and draft administrative reminder emails. To address the core pain point of navigating a messy, unorganized spreadsheet, the tool organizes tracking records on a highly visual chronological timeline dashboard. 

To satisfy the non-negotiable email air-gap principle, the application features a purely deterministic template engine that structures copy-ready reminders locally in the client’s browser. Outbound emails are never sent automatically; instead, the application generates clear text drafts and constructs formatted client-side `mailto:` links to hand off communication smoothly to the director’s default desktop mail program.

## Technical Context

**Language/Version**: TypeScript 5.3, HTML5

**Primary Dependencies**: React 18, TailwindCSS 3.4, Vite 5, Lucide React (UI Icons)

**Storage**: Web LocalStorage API (flat-file persistence model with JSON import/export capability)

**Testing**: Vitest, React Testing Library (configured to execute mock date validation and data import/export parser verifications)

**Target Platform**: Modern Desktop Web Browsers (Chrome 110+, Safari 16+, Firefox 115+, Edge 110+)

**Project Type**: Local-First Client-Side Single Page Web Application (SPA)

**Performance Goals**: Dashboard render time under 100ms, instantaneous filter/search transitions, and zero network latency for status changes and local record persistence.

**Constraints**: 
* Absolute client-side execution block (no outbound API network connections, no SMTP libraries, no database servers).
* Hard-coded limit of 1,200 characters on constructed `mailto:` bodies to guarantee reliable browser URI handling without truncation.
* Explicit user-directed copy/clipboard and mail browser triggers only.

**Scale/Scope**: Single-user workspace optimized for managing up to 100 active grants and 500 total deadlines smoothly within local browser memory.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

* **Air Gap Verification Gate**: The project configuration contains absolutely no Node mailers, SMTP utilities, SendGrid, Mailgun, or related server-s
```

### speckit-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The Implementation Plan for the GrantReminder Core Tracker & Draft Engine outlines a well-structured, local-first architecture that conforms closely to the provided air-gap and local custody constraints. However, the document introduces a major visual component ('Monday Digest' layout controls) without any functional explanation, leaves the handling of the critical 1,200-character mailto limit unspecified, and fails to define the countdown thresholds for the color-coded urgency badges.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Undefined 'Monday Digest' Feature
Confidence score 9/10
Project Structure — Source Code
The project structure lists a component 'DigestFilter.tsx' described as 'Monday Digest layout controls', but the document contains no prior description, rules, or requirements detailing what the 'Monday Digest' is or how it should filter and organize milestone data.
Suggestion: Add a dedicated sub-section under 'Technical Context' or 'Constraints' defining the functional requirements of the 'Monday Digest', including the exact date ranges and sorting logic it uses to filter milestones.
Recommendations (2)
Unspecified Behavior for Mailto Character Limit Violation
Confidence score 8/10
Technical Context — Constraints
The document specifies a hard-coded limit of 1,200 characters on constructed mailto bodies to prevent truncation, but it does not specify how the system should handle draft templates that exceed this threshold (e.g., whether to truncate, display a validation warning, or disable the mailto trigger).
Suggestion: Specify that if the draft body exceeds 1,200 characters, the interface should display a visual warning banner, disable the mailto trigger button, and instruct the user to use the manual clipboard copy option.
Missing Color-Coded Urgency Threshold Rules
Confidence score 8/10
Project Structure — Source Code
The source structure lists 'UrgencyBadge.tsx' (a color-coded deadline visual component) and 'useMilestones.ts' (which computes countdown arithmetic), but the document does not define the numerical ranges or thresholds that determine each urgency level.
Suggestion: Define the day-range thresholds for the urgency states (e.g., Overdue: < 0 days, Critical: 0-3 days, Warning: 4-7 days, Normal: 8+ days) and specify their corresponding visual treatments.
Accept feedback
Request changes
Ignore
```

### speckit-greenfield-v1-tasks — the round asked

```
When you first open this tool on a Monday morning, what is the absolute bare minimum it needs to do to be helpful?*
Select one
Let me type in deadlines manually and copy the generated emails(Recommended)
Keep it simple: I type the funder name and date, and it gives me a draft to copy-paste.
Automatically pull deadlines from my Google or Outlook calendar
Saves me from typing, but requires connecting the tool directly to my work calendar.
Send the emails directly from the tool with one click
Instead of copy-pasting, the tool connects to my inbox and sends them for me.
Other — your own answer
Who is going to actually build this tool for you?*
Select one
A volunteer or friend who knows how to code
Someone is donating their technical skills, so we should keep the tech stack friendly for a solo developer.
A hired freelance developer or agency(Recommended)
We are paying a professional, meaning we can build a more custom dashboard.
Myself or another non-technical team member using 'no-code' tools
We will build it using visual drag-and-drop tools like Airtable, Zapier, or Softr.
Other — your own answer
Is there a specific date or upcoming grant deadline by which this tool must be ready?*
Select one
Within the next 2 to 4 weeks(Recommended)
We are drowning in spreadsheets right now and need a quick lifesaver.
In time for our next big funding season
We have a few months to get this ready before the next major wave of applications is due.
No fixed deadline
We want to take our time to make sure it fits our workflow perfectly.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-tasks — the document

```
# Tasks: GrantReminder Core Tracker & Draft Engine

**Input**: Design documents from `/specs/101-grantreminder-tracker-draft-engine/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are requested in the solution specification and are included in the phases below. Write tests first to observe them fail before writing implementation code.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project configuration is used, with files organized under `src/` and `tests/` directories at the repository root.
- Component paths: `src/components/`
- Hooks paths: `src/hooks/`
- Helper and formatting utility paths: `src/utils/`
- Pure text template builders: `src/templates/`
- Automated verification tests: `tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic single-page web environment structure

- [ ] T001 Initialize TypeScript 5.3 + React 18 project using Vite 5 in the repository root
- [ ] T002 Configure CSS stylesheet in `src/index.css` with TailwindCSS 3.4 directives, base colors, and layout norms
- [ ] T003 Configure Vitest testing environment including configuration overrides and React Testing Library setup dependencies
- [ ] T004 [P] Configure code style rules, parser settings, and linting standards using ESLint/Prettier

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data schemas, persistence layers, and date calculation mechanics that block user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 [P] Declare type definitions in `src/types/index.ts` mapping the schemas for `Grant` and `Milestone` (including `status` and `template_type` enums)
- [ ] T006 Implement the state sync framework in `src/hooks/useLocalStorage.ts` to manage persistence and read/write states directly to the browser storage
- [ ] T007 Implement date utilities in `src/utils/dateHelpers.ts` to compute remaining days, handle timezone alignments safely, and categorize date ranges into Red, Yellow, and Green visual alerts
- [ ] T008 [P] Write unit tests in `tests/unit/dateA
```

### speckit-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The task specification is exceptionally well-structured, providing clear execution phases, parallelization indicators, and independent testing instructions for each user story. However, it contains a few ambiguities regarding date calculations, file naming formats, and character limit definitions that will cause automated test development to stall or diverge. Resolving these minor gaps will make the guide fully deterministic and ready for an automated coding agent.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (13)
FR-001 has no task
Automated check
Requirement Coverage
FR-001 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-001, or name it in the requirements a listed task already covers.
FR-010 has no task
Automated check
Requirement Coverage
FR-010 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-010, or name it in the requirements a listed task already covers.
FR-011 has no task
Automated check
Requirement Coverage
FR-011 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-011, or name it in the requirements a listed task already covers.
FR-002 has no task
Automated check
Requirement Coverage
FR-002 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-002, or name it in the requirements a listed task already covers.
FR-003 has no task
Automated check
Requirement Coverage
FR-003 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-003, or name it in the requirements a listed task already covers.
FR-004 has no task
Automated check
Requirement Coverage
FR-004 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-004, or
```

### myspec-brownfield-v1-interview — the round asked

```
Who is going to open this tool on a Monday morning to check on the grant deadlines?*
Select one
A part-time volunteer or fundraiser(Recommended)
They have limited time and need a very simple, self-explanatory screen.
The charity founder or executive director
They manage everything and need a quick, high-level bird's-eye view of funding.
A small group of 2-3 staff members
They need to coordinate, assign tasks to each other, and see who is writing what.
Other — your own answer
How do you keep track of these deadlines right now, and what is the most painful part of that process?*
Select one
A shared spreadsheet (like Excel or Google Sheets)(Recommended)
It's annoying to keep updated, doesn't send alerts, and people forget to look at it.
Personal calendars and phone reminders
Deadlines get buried among personal meetings, and there's no space to draft email text.
Searching through emails and sticky notes
It is stressful, unorganized, and we live in constant fear of missing a submission window.
Other — your own answer
For this tool to feel like an absolute lifesaver, what does it need to do best?*
Select one
Generate the actual reminder emails for us(Recommended)
It writes the follow-ups or reminders so we can just review, copy, and send.
Show a clear, simple calendar timeline
A clean visual layout showing exactly what is due this week, next week, and next month.
Send us proactive alerts (like an email nudge)
We don't even want to log in; we just want an email warning us 7 days before a deadline.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the round asked

```
When a reminder email is ready, how should it actually get sent to your team or partners?*
Select one
Show the draft on screen for a human to edit and send(Recommended)
This keeps you in total control; nothing ever goes out to a donor or team member without a human clicking 'send'.
Send the emails automatically in the background
Saves the most time, but risks sending unpolished or incorrect emails if the system makes a mistake.
Just copy the drafted text to your clipboard
The tool stays completely out of your email inbox; you manually paste the text into Gmail or Outlook.
Other — your own answer
To keep things simple, what should this tool definitely stay out of doing, at least in the beginning?*
Select all that apply
Writing the actual grant application answers
We will only draft follow-up and reminder emails, not the actual content of the grant proposals.
Tracking bank details, budgets, and spent grant money(Recommended)
We will focus purely on deadlines and communication, leaving financial accounting to your existing tools.
Managing donor contact lists and relationship histories
We won't try to build a full contact book; we will only store the minimal details needed for the active deadlines.
Other — your own answer
If we look at your charity three months after this is built, what does 'working perfectly' look like?*
Select one
We haven't missed a single grant application deadline(Recommended)
Success is measured by reliability: the tool successfully caught every single key date.
Volunteers spend under 15 minutes a week on administrative follow-ups
Success is measured by time saved: drafts are ready to go with almost zero editing required.
Anyone on the team can log in and immediately see what's due next
Success is measured by clarity: replacing messy, confusing spreadsheets with a clear, shared view.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the document

```
# Change Proposal: Grant Application Tracker and Email Drafter

## Context

Small charities operate under severe resource constraints, often relying on part-time volunteers to manage their fundraising pipelines. Currently, this charity tracks grant application deadlines using basic spreadsheets. This manual process is highly prone to human error; spreadsheets require active maintenance, lack automated urgency cues, and do not help volunteers write the repetitive coordination emails needed to gather application materials or follow up with funders. 

Because volunteers rotate frequently and have limited hours, deadlines are occasionally missed, resulting in lost funding opportunities. The charity needs a simple, reliable system of record that ensures zero missed deadlines, while keeping the volunteer's administrative workload to an absolute minimum.

## Proposed Change

The proposed solution is a lightweight, web-based grant application tracking tool specifically designed for non-technical volunteers. The system will replace the tracking spreadsheet with an intuitive, visual pipeline of upcoming deadlines and milestone dates.

To solve the administrative bottleneck, the tool will automatically generate draft reminder and follow-up emails. When a milestone or final submission deadline is approaching, the system will construct a tailored draft email (e.g., reminding a program manager to provide project metrics, or asking a funder for an update on a pending application). 

In compliance with strict email safety and privacy guidelines, the system will never send emails automatically. Instead, it will present these drafts directly to the volunteer within the user interface, allowing them to review, manually edit, and copy the text to their own email client to send.

To maintain simplicity, the tool will focus exclusively on tracking and coordination. It will not attempt to write the grant proposals themselves.

## Scope

### In-Scope

*   **Grant Pipeline Management:** A simple CRUD (Create, Read, Update, Delete) interface to input grant details including Funder Name, Grant Name, Deadline Date, Internal Lead, and Application Status (e.g., Researching, Drafting, Submitted, Awarded, Declined).
*   **Urgent Deadline Dashboard:** A clean, prioritized dashboard displaying grant applications sorted by proximity to deadline, utilizing clear visual warnings (e.g., red alerts for dates within 7 days).
*   **Automated Email Draft Generation:** Context-aware email drafting 
```

### myspec-brownfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The specification outlines a valuable tool for tracking grant applications and drafting coordination emails, but it cannot be implemented by a coding agent in its current state. Crucial product and architectural decisions—such as whether to use hardcoded templates or an LLM for email generation, and whether to include an iCal calendar feed—are left as unresolved 'Open Questions.' Additionally, the data model and the exact logic/templates for generating emails lack technical detail. Resolving these ambiguities will enable the agent to deliver a precise, functional system.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Unresolved decision on Email Generation mechanism
Confidence score 10/10
Risks & Open Questions
The document leaves an open question on whether to generate email drafts using hardcoded templates with variable interpolation or an LLM API. A coding agent cannot make this architectural decision or invent the integration details.
Suggestion: Explicitly choose hardcoded text templates with variable interpolation for predictability and lower cost, and define the default template strings (e.g., containing placeholders like [Funder Name] or [Internal Lead]) directly in the spec.
Unresolved Calendar Integration scope
Confidence score 10/10
Risks & Open Questions
The document lists calendar integration (iCal feed export) as an open question. This creates a critical ambiguity in the project's scope, leaving the agent to guess whether they should build this feature or not.
Suggestion: Move calendar integration explicitly to the 'Out-of-Scope' list for this release, confirming that the internal dashboard is sufficient.
Incomplete database schema and creation flow
Confidence score 9/10
Impact — Data Model
The 'Data Model' section introduces three entities (Funders, Grants, Milestones), but the exact schemas, field types, and creation workflows are undefined. For example, it is unclear if Funders requires a separate management page, or if entering a Funder Name in the Add Grant form should dynamically find or create a Funder entity.
Suggestion: Provide a detailed schema for each table (types, nullability, relations). Specify that entering a Funder Name in the 'Add Grant' form should perform a 'find or create' operation on the Funders table to maintain the simple UI flow.
Recommendations (1)
Undefined draft generation triggers and template logic
Confidence score 9/10
S
```

### myspec-brownfield-v1-requirements — the round asked

```
When a volunteer opens this tool, how should they enter new grant deadlines and get their drafted emails out?*
Select one
Type them in manually, and copy-paste the drafts(Recommended)
They type the grant name and deadline into a simple form, and click a button to copy the drafted reminder email to their clipboard.
Forward funder emails directly to the tool
They forward an email from a funder to a special inbox; the tool automatically reads the deadline and drafts a reply.
Upload a spreadsheet and get drafts emailed to them
They upload their existing Excel sheet, and the tool emails them a document containing all the drafted reminders.
Other — your own answer
How and when should the reminder drafts be created?*
Select one
Draft automatically and notify the volunteer(Recommended)
The tool drafts the email (for example, 14 days before the deadline) and emails the volunteer to review and send it.
Draft only when a volunteer clicks a button
The tool waits until a volunteer logs in, looks at the list of grants, and clicks 'Generate Draft' next to a deadline.
Send the email automatically on the due date
The tool connects to their email account and sends the reminder draft directly to the funder without anyone needing to click 'send'.
Other — your own answer
Who gets to see and change things in this tool?*
Select one
Everyone has the same simple access(Recommended)
There are no complex user accounts; anyone with the link can view, add, or edit any grant deadline and draft.
Some people can edit, others can only read
Fundraisers can edit deadlines and drafts, while trustees get a read-only view to see what's coming up.
Volunteers only see their own assigned grants
Each volunteer logged in only sees and manages the specific grants they are personally responsible for.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-requirements — the document

```
## Overview

This specification details a lightweight, web-based Grant Application Tracker and Email Drafter designed to help a small charity manage its fundraising pipeline. Currently relying on error-prone spreadsheets, the charity faces operational risks due to high volunteer turnover and limited administrative capacity, occasionally leading to missed grant deadlines. 

To achieve the primary success criterion of **zero missed deadlines**, this system introduces a centralized digital pipeline of upcoming deadlines and milestones. The core administrative bottleneck is eliminated via context-aware, automatically generated draft emails (for internal staff reminders and external funder follow-ups). 

To ensure absolute adherence to security, privacy, and safety regulations, the tool functions strictly under a **review and send manually** paradigm. It contains no direct outbound email capabilities (no SMTP or API connections). Instead, it presents generated drafts to the user to copy to their clipboard or launch via local `mailto:` links, preserving manual human verification before any message is dispatched.

### In-Scope Boundaries
*   **Pipeline Management**: Basic CRUD operations for Funders, Grants, and Milestones.
*   **Urgent Deadline Dashboard**: A central interface sorting items by urgency, using red-alert visual indicators for items due in less than 7 days.
*   **Automated Email Draft Workspace**: Automatic generation of copyable email reminders and follow-ups.
*   **Manual Copy/Paste Mechanics**: High-visibility placeholders, warning banners, "Copy to Clipboard" triggers, and `mailto:` link generation.
*   **Shared Volunteer Portal**: Shared-access environment optimized for rapid manual data entry.

### Out-of-Scope Boundaries
*   **Direct Emailing Capabilities**: No integrated SMTP server, SendGrid, or other dispatch services.
*   **Grant Writing assistance**: No generation of proposal narratives, research summaries, or program answers.
*   **Funder Search/Discovery**: No active scraping, API matching, or integrated external databases to find new grants.
*   **Financial/Post-Award Accounting**: No bookkeeping, restricted fund burn-down charts, or allocation tracking.

---

## User Roles

Because the charity is run by a small, collaborative team with rotating personnel, the application operates on a simplified, shared-access administrative model.

### 1. Volunteer (Primary User)
*   **Description**: Non-technical team members responsible for day-to
```

### myspec-brownfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The specification outlines a well-conceived, lightweight Grant Application Tracker with a manual-dispatch model that elegantly bypasses email integration security concerns. However, the document contains several critical gaps that would leave a coding agent guessing. Most notably, it references non-existent schema fields for 'program' details, requires status-duration tracking without any timestamp fields in the schema, and fails to specify the actual text and subject lines for the automated email drafts. Addressing these ambiguities is necessary to make the specification fully testable and implementable.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Missing status change timestamp for email trigger
Confidence score 10/10
Functional Requirements — Automated Email Draft Workspace
The system is required to trigger an External Follow-up Template when a Grant's status is 'Submitted' and 'more than 30 days have passed with no status change'. However, the Grant entity schema contains no timestamp fields (such as 'status_updated_at' or 'submitted_at') to track when the status was last changed, making this trigger impossible to compute.
Suggestion: Add a 'status_updated_at' (DateTime) or 'status_changed_at' field to the Grant entity schema, updating it whenever the Grant's status changes.
Missing email template copy and subject lines
Confidence score 10/10
Functional Requirements — Automated Email Draft Workspace
The document requires the system to dynamically generate 'Internal Reminder' and 'External Follow-up' email drafts with predefined subject lines, but it does not specify the actual text, wording, or subject lines for these templates. A coding agent will have to invent arbitrary copy, making it untestable and potentially unsuitable for the user.
Suggestion: Provide concrete text templates with placeholders (e.g., 'Subject: Reminder: [Milestone Title] due on [Due Date]' and 'Body: Hello [Lead Name]...') for both email draft types.
Undefined 'program' fields referenced in email generation
Confidence score 9/10
Functional Requirements — Automated Email Draft Workspace
The Internal Reminder Template description states that it dynamically pulls 'program details' and uses placeholders like '[Insert Program Name]'. However, neither the Funder, Grant, nor Milestone entity schemas define any fields for 'program name' or 'program details'.
Suggestion: Clarify if 'Program Nam
```

### Edit — the Describe prefill

```
I want to update spec constitution.md, spec.md, plan.md and tasks.md to 
```

### Edit — the proposal

```
CONSTITUTION · EDIT

Proposed edit across 4 documents

I want to update spec constitution.md, spec.md, plan.md and tasks.md to state plainly that reminder emails are never sent without a human approving them. — +11 −10. Nothing is saved until you approve.

constitution.md +3 −3

--- a/constitution.md
+++ b/constitution.md
@@ -3,7 +3,7 @@
 ## Core Principles
 
 ### I. Absolute Email Air Gap (NON-NEGOTIABLE)
-The application must never send emails automatically under any circumstances. There must be no direct SMTP configuration, background queue workers, or automated APIs capable of transmitting messages to funders. All generated emails must be presented solely as raw draft text inside the user interface, with standard copy-to-clipboard or "mailto:" actions. This ensures the solo director retains absolute manual control over the final message copy, preventing accidental, unverified, or incomplete communications from reaching external foundations.
+The application must never send emails automatically under any circumstances. There must be no direct SMTP configuration, background queue workers, or automated APIs capable of transmitting messages to funders. All generated emails must be presented solely as raw draft text inside the user interface, with standard copy-to-clipboard or "mailto:" actions. Reminder emails are never sent without a human approving them. This ensures the solo director retains absolute manual control over the final message copy, preventing accidental, unverified, or incomplete communications from reaching external foundations.
 
 ### II. Strictly Bounded Scope (No Grant Writing)
 The system is explicitly restricted to tracking deadlines and drafting administrative/follow-up reminders. It must never attempt to write the actual content of grant proposals, summarize impact studies, or generate funding pitches. By focusing purely on operational logistics and basic template-based reminders, the platform remains highly reliable, predictable, and free from the hallucinations or complexities associated with automated generative prose.
@@ -26,7 +26,7 @@
 Email drafts must be generated using predictable, rule-based text templates populated by the tracked grant metadata (e.g., Funder Name, Grant Milestone, Due Date, and Director's Name). The logic for selecting and assembling templates must be strictly deterministic, ensuring the solo director can easily customize the underlying templates without worrying about unstable or variable outputs.
 
 ### Client-Side Handoffs Only
-The transition from draft to actual email client must happen at the system level. When a user clicks "Draft Reminder," the application will render the Subject and Body in clear, editable text boxes alongside a "mailto:" link that prepopulates the user's default desktop email application (e.g., Outlook, Apple Mail, or Gmail). No external API integrations with third-party email providers will be developed.
+The transition from draft to actual email client must happen at t
```
