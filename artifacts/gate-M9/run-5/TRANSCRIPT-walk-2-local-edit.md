# M9п gate — what the models said

### speckit-greenfield-v1-interview — the round asked

```
When someone opens this tool on a Monday morning, who are they and what is their main goal for the day?*
Select one
A part-time fundraiser or volunteer(Recommended)
They manage 10 to 20 grant applications and need a quick way to see what to do next.
The charity's director or founder
They do everything themselves and need fast, automated nudges so nothing slips through the cracks.
A volunteer board member
They check in occasionally to help write updates and ensure deadlines are met.
Other — your own answer
How are you keeping track of these deadlines right now, and what is the most annoying part of that process?*
Select one
A shared spreadsheet(Recommended)
We manually update a spreadsheet, but we forget to check it and writing every email from scratch is tedious.
Calendar alerts and email folders
We set calendar reminders, but then we waste 20 minutes searching through old emails to find the details we need to write the draft.
Sticky notes and memory
We rely on memory and notes, which leads to last-minute scrambling or missing deadlines entirely.
Other — your own answer
What is the single most important thing this tool could do to make you say, 'This just saved my whole week'?*
Select one
A ready-to-send email draft(Recommended)
Clicking a button and getting a pre-written email draft with the funder's name and application details already filled in.
An absolute-deadline warning system
A dead-simple visual list showing what is due in 7, 14, or 30 days, so we can prioritize instantly.
Quick access to past answers
Having our previous successful grant descriptions right next to the draft screen so we don't have to keep copy-pasting from old Word documents.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the round asked

```
To keep things simple and safe, what is the absolute boundary for this tool? What should it definitely NOT do?*
Select one
Never send emails automatically(Recommended)
The tool drafts the emails, but a human must always review and click 'Send' from their own inbox.
Do not write the actual grant proposals
The tool stays completely out of the complex writing of the bid itself; it only handles the relationship and deadline reminders.
Do not track charity bank accounts or budgets
It won't hold financial balances or track how grant money is spent once received.
Other — your own answer
What kind of information will you be putting into this tool, and how private is it?*
Select one
Basic public details & work emails(Recommended)
Just grant names, public deadlines, and professional work email addresses (low sensitivity).
Internal notes & personal contacts
Private notes about funder relationships and direct cell phone numbers of foundation officers (medium sensitivity).
Confidential donor files & financial drafts
Draft budgets, charity tax documents, and sensitive beneficiary stories (high sensitivity).
Other — your own answer
If we look at this three months after it launches, what would make you say, 'This is a huge success'?*
Select one
We haven't missed a single deadline(Recommended)
The absolute peace of mind that nothing slipped through the cracks.
Mondays take 15 minutes instead of 2 hours
Volunteers spend virtually zero time hunting for what to do next and drafting emails from scratch.
New volunteers can use it instantly
We can hand this to a brand new volunteer on day one without explaining a complex spreadsheet.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the document

```
# GrantMinder Constitution

## Core Principles

### I. User-in-the-Loop (No Auto-Sending)
Every communication drafted by the system must be manually reviewed and initiated by a human user. The system is strictly forbidden from automatically sending emails to funders or external parties. It acts exclusively as a draft-generator and pipeline advisor, protecting the delicate, relationship-driven nature of charity fundraising from automated mistakes.

### II. Simple Tracker Over Complex CRM
The tool is built specifically for the part-time fundraiser at a small charity. It must avoid the feature bloat, complex configurations, and high setup overhead of enterprise-level grant platforms. Instead, it serves as a lightweight, highly intuitive digital replacement for manual tracking spreadsheets, prioritizing immediate clarity on what is due.

### III. Zero-Missed-Deadlines Reliability
The ultimate success metric of this tool is ensuring the charity misses zero grant deadlines. The core tracking and reminder engine must be bulletproof, accounting for timezone variations, calendar shifts, and human oversight. Upcoming milestones must be highly visible and impossible to overlook on the user interface.

### IV. Basic, Low-Sensitivity Data Profile
To minimize security overhead and protect user trust, the platform stores only basic public or semi-public information about grants, funders, and deadline dates. Highly sensitive personal donor files, financial accounting records, and extensive PII are out of scope, allowing the charity to maintain a clean, secure, and easily auditable data footprint.

### V. Template-Driven Draft Accuracy
Email drafts must be generated using predictable, high-quality templates that merge tracked grant parameters (such as the funder's name, target amount, and specific due dates) cleanly and accurately. The user must be presented with highly contextual, polished copy-pasteable text or native mailto links that require minimal polishing.

## Product Boundaries & Scope Constraints

### Out-of-Scope Capabilities
* **Automatic Email Dispatching**: The system will generate, format, and present email drafts, but it will not connect directly to outbound SMTP services or API triggers to send them. All deliveries must occur through manual user action (e.g., clicking a link to open an email client or copying the text to a local clipboard).
* **Funder Discovery and Prospecting**: Unlike public databases or search directories, this tool does not help users 
```

### speckit-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The GrantMinder Constitution provides a clear and focused philosophy for a lightweight, user-in-the-loop grant tracker. However, it contains a direct contradiction between the strictly limited database schema fields and the template engine requirements, which will prevent a coding agent from successfully building the draft generator. Additionally, some quality gates and state transitions are described via examples rather than strict, testable rules, leaving key behaviors open to interpretation.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Contradiction in allowed database schema vs template parameters
Confidence score 10/10
Product Boundaries & Scope Constraints — Data Security & Privacy Bounds
Section V (Template-Driven Draft Accuracy) specifies that email drafts must merge tracked grant parameters such as 'target amount'. However, the 'Data Security & Privacy Bounds' section explicitly limits the database schema to 'Grant Name, Funder Name, Deadline, Contact Name, Funder Email, Draft Status, and local user metadata', completely omitting any field for the financial amount. Under these strict security constraints, the system would be unable to store or merge the target amount.
Suggestion: Add 'Target Amount' to the restricted list of fundamental tracking entities under the 'Data Security & Privacy Bounds' section.
Recommendations (2)
Vague state machine definition
Confidence score 8/10
Development Workflow & Quality Gates — Testing Requirements
The tracking pipeline state machine is defined using an illustrative example ('e.g., Identified → Drafting → Submitted → Awarded/Declined') rather than an explicit, deterministic specification. A coding agent will have to guess the exact allowed states and transition boundaries.
Suggestion: Provide a concrete and definitive list of states and allowed transitions instead of an 'e.g.' placeholder.
Untestable click-limit threshold
Confidence score 7/10
Development Workflow & Quality Gates — UX Evaluation Gate
The gate requiring that a primary task must not take 'more than three clicks' is highly subjective and untestable for an automated workflow. It does not define what counts as a click (such as opening dropdowns, selecting dates, or page transitions), nor does it define the exact list of 'primary tasks'.
Suggestion: List the specific primary workflows to be evaluated and specify exactly how 'clicks' should be counted, or de
```

### speckit-greenfield-v1-requirements — the round asked

```
When you have a new grant to track, how would you prefer to get it into the system?*
Select one
Type it into a quick form(Recommended)
You fill out three quick fields: the grant name, the due date, and who needs to be reminded.
Forward an email to the tool
You forward the grant announcement or guidelines email to a special address, and the tool extracts the deadline details for you.
Upload a spreadsheet
You upload your existing Excel or Google Sheet list of grants to set them all up at once.
Other — your own answer
Who is going to be opening this tool, and do they all need the same level of access?*
Select one
Everyone is a peer(Recommended)
No passwords or roles required; anyone with the link can add a grant, edit deadlines, or view email drafts.
One coordinator manages, others just view
One main person sets up the deadlines and templates, while volunteers can only log in to see what's due and copy drafts.
Other — your own answer
Where should those Monday morning email drafts actually show up for your team?*
Select one
Sent directly to your inbox(Recommended)
You get an email on Monday morning containing the pre-written drafts, ready for you to copy, edit, and send.
On a simple web dashboard
You open a website on Monday morning to see a tidy list of upcoming deadlines with a 'Copy Draft' button next to each one.
Directly in your email Drafts folder
The tool connects to your charity's shared Gmail or Outlook account and places the draft emails directly into your Drafts folder.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-requirements — the document

```
# Feature Specification: GrantMinder Core Tracking & Draft Generator

**Feature Branch**: `001-grantminder-core`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails"

## User Scenarios & Testing

### User Story 1 - Deadline Tracking Dashboard (Priority: P1)

As a part-time fundraiser at a small charity, I want a single, highly visual screen showing all our upcoming grant deadlines so that I can see exactly what is due and never miss a key date.

**Why this priority**: Ensuring zero missed deadlines is the ultimate success metric of GrantMinder. Without a reliable, simplified tracker view, the core utility of the application cannot be realized.

**Independent Test**: Can be fully tested by creating three grant applications with differing deadlines (overdue, due today, due in 10 days) and verifying that the dashboard displays them correctly prioritized, with clear status indicators and exact localized times.

**Acceptance Scenarios**:

1. **Given** a grant with a deadline set for tomorrow at 5:00 PM Eastern Time, **When** viewed by a logged-in user whose profile or browser is set to Pacific Time, **Then** the system displays the deadline adjusted to the user's local time (2:00 PM Pacific Time) and tags the item with a yellow "Warning" status indicating it is due in less than 48 hours.
2. **Given** a grant with a deadline that passed yesterday without being updated to "Submitted", **When** the dashboard loads, **Then** the system displays this grant at the top of the view in a high-priority "Overdue" section flagged in bright red.

---

### User Story 2 - Template-Driven Email Drafting (Priority: P2)

As a part-time fundraiser, I want the system to generate highly personalized reminder email drafts using tracking parameters so that I can easily copy them or email them to myself for outbound follow-ups.

**Why this priority**: Speeds up communication work without violating the "User-in-the-Loop" constitutional directive. The system does not directly email the funder but automates the heavy lifting of draft composition.

**Independent Test**: Can be tested by clicking "Draft Email" on any tracked grant, previewing a formatted email containing correct merged fields, and successfully using "Copy to Clipboard" or "Email Draft to Me".

**Acceptance Scenarios**:

1. **Given** a tracked grant with Funder Name "The Oak Foundation", Funder Con
```

### speckit-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The GrantMinder Core Tracking & Draft Generator specification provides a solid foundation for tracking grant applications and generating email drafts, but it contains critical ambiguities in data storage, status transitions, and relational record handling. Specifically, the document fails to define the database schema attributes needed to track user and application timezones (despite requiring timezone-aware displays and inputs), leaves pipeline stage ordering undefined for "backward" state transition validation, and is vague about how the system handles potential duplicate funder records during the combined grant-and-funder intake form. Addressing these missing details will prevent the coding agent from making arbitrary implementation choices.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Missing timezone attributes in User and Grant Application schemas
Confidence score 9/10
Key Entities
User Story 1, Acceptance Scenario 1 relies on displaying adjusted deadlines based on a user's profile timezone, and FR-004 includes a 'Timezone' field in the grant intake form. However, neither the 'User' nor the 'Grant Application' key entities have attributes to store these timezones (only 'Charity Workspace' has a 'timezone_default'). Without these database attributes, the system cannot store individual user timezone preferences or preserve the specific timezone of an inputted grant deadline.
Suggestion: Add a 'timezone' string attribute to the 'User' entity (e.g., to store profile-based timezone offsets) and a 'timezone' string attribute to the 'Grant Application' entity to record the timezone submitted via the intake form.
Undefined order of pipeline stages for 'backward' transition validation
Confidence score 9/10
Edge Cases
The edge case 'Accidental Deletions or Pipeline Reversals' states that if a user attempts to transition a grant 'backward' in the pipeline (e.g., from 'Submitted' back to 'Identified'), the system must prompt with a confirmation dialog. However, the five pipeline stages defined in FR-003 ('Identified', 'Drafting', 'Submitted', 'Awarded', 'Declined') do not have an explicitly defined sequential order, which makes it impossible to programmatically determine what constitutes a backward transition.
Suggestion: Explicitly define the sequential order of the pipeline stages (for example, 'Identified' -> 'Drafting' -> 'Submitted' -> ['Awarded' / 'Declined']) and
```

### speckit-greenfield-v1-solution — the round asked

```
When your team is checking deadlines or sending these emails, what device will they most likely be using?*
Select one
Almost entirely on laptops or desktop computers(Recommended)
Best for drafting and sending emails where typing and copying text is easier.
Mostly on their mobile phones while on the move
Optimized for quick taps and reading notifications on a small screen.
A mix of both; they need it to work perfectly on phones and laptops
Ensures full flexibility, though it takes a bit more care to build.
Other — your own answer
How should this tool connect to the software you already use every day?*
Select all that apply
Connect directly to our work email (like Gmail or Outlook)(Recommended)
The tool puts the drafted email straight into your email provider's 'Drafts' folder.
Connect to our shared calendar (like Google Calendar)
Deadlines automatically appear as events on your charity's existing calendar.
Keep it standalone (we will copy and paste the text ourselves)
No integrations needed; you log in to our tool, view deadlines, and copy the draft text manually.
Other — your own answer
How many volunteers or fundraisers will be logging in to use this?*
Select one
Just 1 or 2 core people(Recommended)
Super simple setup with a shared login or simple password.
A tight team of 3 to 10 people
We will need individual accounts so everyone can see who updated what.
A rotating door of volunteers
We need an easy way to invite new volunteers and revoke access when they leave.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-solution — the document

```
# Implementation Plan: GrantMinder Core Tracking & Draft Generator

**Branch**: `001-grantminder-core` | **Date**: 2026-07-24 | **Spec**: [requirements.md](requirements.md)

**Input**: Feature specification from `/specs/001-grantminder-core/requirements.md`

## Summary

GrantMinder is a highly specialized tracking pipeline and email draft generator designed for part-time fundraisers at small charities. It acts as a lightweight digital upgrade to spreadsheet-based workflows, ensuring zero missed deadlines while helping users draft and preview relationship-saving communications without automated system errors. 

The technical approach implements a single, unified web application built on Python 3.11 and FastAPI. The frontend uses server-rendered Jinja2 templates enhanced with Tailwind CSS to maintain structural simplicity and fulfill the "three-clicks or fewer" user experience constraint. Strict date-time comparisons using PyTZ/Datetime libraries handle timezone variations and leap-year shifts to ensure high-priority deadlines are calculated reliably. To respect the strict "User-in-the-Loop" constitutional directive, the system uses a local copy-to-clipboard engine, native web mailto link builders, and transactional SMTP strictly configured to route emails back to the verified, authenticated user's inbox only—preventing any direct automated dispatch to external funders.

## Technical Context

**Language/Version**: Python 3.11

**Primary Dependencies**: FastAPI, Uvicorn, Jinja2, SQLAlchemy (ORM), Pydantic v2 (validation), PyTZ (timezone management), python-multipart (for form handling), and aiosmtplib (for async transactional email routing to internal users).

**Storage**: PostgreSQL (for multi-user production data and transaction consistency), SQLite (for local development and fast execution of test suites).

**Testing**: pytest, pytest-cov (for 100% test coverage of core draft engines), and freezegun (for reliable mock timezones and leap year math verification).

**Target Platform**: Dockerized container deployable to Linux-based cloud runtimes (e.g., Render, Fly.io, or AWS ECS).

**Project Type**: Single-project server-rendered web service with built-in SQLite/PostgreSQL-backed API and Jinja2 frontend components.

**Performance Goals**:
* Main dashboard load and query execution time under 150ms.
* Zero unrendered draft variables during compile time.
* UI transitions and modal displays requiring under 3 clicks for core operations.

**Constraints**:
* **Outb
```

### speckit-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The Implementation Plan for the GrantMinder Core Tracking & Draft Generator provides a solid project structure and technical stack, but it contains critical ambiguities and contradictions regarding SMTP email routing and timezone-aware datetimes. Specifically, the document conflicts on whether drafts are dispatched solely via frontend 'mailto' links and clipboard buffers or if they support transactional SMTP delivery. Furthermore, the validation rule for limiting SMTP recipient targets (individual inbox vs. domain-level) is vague, which threatens the 'User-in-the-Loop' constitutional constraint. Finally, the plan relies on the deprecated `pytz` library and ignores dialect differences between SQLite (for testing) and PostgreSQL (for production) regarding timezone-aware datetimes, posing a high risk of runtime failures.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Contradiction between SMTP capability and local-only delivery statement
Confidence score 9/10
Constitution Check
The document contradicts itself regarding draft export channels. The 'Summary' and 'Technical Context' specify that transactional SMTP is used to route email drafts back to the user's verified inbox. However, the 'Constitution Check' table asserts under the 'User-in-the-Loop' row that the 'System only constructs mailto: and clipboard buffers.' This leaves the agent guessing whether they need to build an actual SMTP draft-delivery feature or restrict the system strictly to frontend mailto/clipboard interactions.
Suggestion: Update the 'Constitution Check' table to accurately reflect the SMTP routing capability, confirming that drafts can be sent via SMTP but only to the verified user's registered inbox. Ensure both the Summary and the Constitution Check are aligned.
Vague validation logic for internal SMTP recipient routing
Confidence score 9/10
Technical Context — Constraints
The specification has conflicting and vague boundaries for blocking outbound SMTP emails. The 'Summary' says emails are routed back to the 'verified, authenticated user's inbox only'. However, the 'Constitution Check' says SMTP services are blocked from 'targeting domains not belonging to registered staff users'. This is a major security gap: if validation is done at the domain level, any user could potentially send emails to any external recipient sharing that domain. If it is restricted to the user's own email, the validation
```

### speckit-greenfield-v1-tasks — the round asked

```
To get this in your hands quickly, what is the absolute minimum the first version needs to do to be helpful?*
Select one
A weekly email with a list of deadlines and text drafts you can copy-paste(Recommended)
Super simple: no website to log into, just a Monday morning email with everything you need.
A basic website where you can see deadlines and click a 'Copy Draft' button
Gives you a central visual board to look at, but requires opening a browser link.
Direct integration that automatically saves drafts inside your actual Gmail/Outlook account
The most seamless experience, but requires setting up secure access to your email accounts.
Other — your own answer
Do you have a specific date in mind for when this tool needs to be live and working?*
Select one
Yes, we have a major grant deadline cycle coming up very soon
We need this built in days or weeks to help us manage a specific near-term deadline.
No hard deadline, but we would love to start using it in a month or two(Recommended)
Gives us comfortable time to build, test, and tweak it without rushing.
We are just planning ahead; there is no rush at all
We can take several months to get it right whenever the builder has free time.
Other — your own answer
Who is going to be putting this tool together, and what are they most comfortable using?*
Select one
A volunteer using 'no-code' tools like Airtable, Zapier, or Make
We will build it by connecting existing tools together without writing traditional code.
A friend or volunteer who knows some basic coding (like Python or simple web pages)
We will write some simple custom scripts but want to keep the tech setup very easy.
A professional software developer who can write custom code from scratch(Recommended)
We can build a fully custom application and host it on professional cloud servers.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-tasks — the document

```
---

description: "Task list for GrantMinder core tracking and email draft generator implementation"
---

# Tasks: GrantMinder Core Tracking & Draft Generator

**Input**: Design documents from `/specs/001-grantminder-core/`

**Prerequisites**: plan.md (required), spec.md/requirements.md (required for user stories), data-model.md, contracts/

**Tests**: The requirements explicitly mandate strict timezone safeguards, leap-year calculations, draft render syntax evaluation (0% unrendered templates), and state transition validations. Consequently, comprehensive test coverage tasks are included in this project plan.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Paths shown below correspond to a unified single project structure, locating all execution scripts at the repository root:
  - Source files: `src/`
  - Test files: `tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project directories matching the implementation structure (create directories `src/models/`, `src/services/`, `src/views/templates/`, `src/utils/`, `tests/unit/`, `tests/integration/`, `tests/contract/`)
- [ ] T002 Initialize Python 3.11 environment and write dependency manifests (e.g., `pyproject.toml`, `requirements.txt`) targeting FastAPI, SQLAlchemy, Jinja2, PyTZ, Pydantic, python-multipart, aiosmtplib, pytest, and freezegun
- [ ] T003 [P] Configure code quality tooling: configure ruff, black formatting rules, and mypy static analysis controls in `pyproject.toml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Setup core database engines, session handling, and migrations layer in `src/database.py` and environment configurations in `src/config.py` (supporting SQLite for local test fast-execution and PostgreSQL capability)
- [ ] T005 [P] Implement base security middleware and basic multi-user authorization hooks in `src/views/routes.py` (supporting logins mapped to Charity Workspaces)
- [ ] T006 [P] Initial
```

### speckit-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The tasks document provides a well-structured roadmap for implementing the GrantMinder core tracking and email draft generator. However, it contains several critical defects that would cause git/write conflicts or leave a coding agent guessing. Specifically, there are file-path overlaps where independent, parallel user story tasks attempt to modify the same test file, multiple vague tasks that omit exact filenames or target paths, and a requirement to validate Docker deployments when no tasks exist to create any Docker configurations. Additionally, several cross-cutting Polish tasks contain completely untestable performance and UI click validation criteria without providing the necessary testing frameworks or benchmark environments.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (13)
FR-001 has no task
Automated check
Requirement Coverage
FR-001 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-001, or name it in the requirements a listed task already covers.
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
Suggestion: Add a task that implements FR-004, or name it in the requirements a listed task already covers.
FR-005 has no task
Automated check
Requirement Coverage
FR-005 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implements FR-005, or name it in the requirements a listed task already co
```

### myspec-brownfield-v1-interview — the round asked

```
Who is going to open this tool on a Monday morning, and what is their main goal for the day?*
Select one
A single overworked volunteer or founder(Recommended)
One person handles everything: tracking deadlines, writing the emails, and sending them.
A small team of 2 or 3 people sharing the load
One person manages the calendar, while someone else is responsible for writing and sending the updates.
Board members or trustees checking in
They just want a quick high-level view of what's pending without doing the day-to-day writing.
Other — your own answer
How are you tracking these grant deadlines today, and what is the most frustrating part of that process?*
Select one
A Google Sheet or Excel file that keeps slipping through the cracks(Recommended)
It is hard to keep updated, and nobody gets alerted when a date is creeping up.
Dozens of scattered calendar events and phone reminders
Deadlines are in the calendar, but you still have to manually dig up who to email and what to say.
Searching through old sent emails and sticky notes
You spend hours piecing together when you last spoke to a funder and what the next step is.
Other — your own answer
When it comes to drafting those reminder emails, what would make this tool an absolute lifesaver for you?*
Select one
Creating a personalized draft that I can copy, edit, and send from my own email(Recommended)
The tool writes the text based on the funder's name and details, and I handle the actual sending.
Clicking a single button inside the tool to send the email directly
The tool connects to my email inbox and sends the message out without me needing to copy/paste anything.
Drafting internal reminders to our own team
The email isn't for the funder; it's to nudge a team member to write the grant proposal.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the round asked

```
To keep this tool safe and simple, what is the absolute 'no-go' zone? What must it definitely stay out of?*
Select all that apply
Sending emails automatically(Recommended)
The tool must never send an email itself; a human must always review and hit 'send' from their own inbox.
Writing the actual grant proposals
It should only draft quick reminder emails, not try to write the complex funding proposals themselves.
Asking for your email or portal passwords
It shouldn't require you to log into your work email or external foundation portals inside this tool.
Other — your own answer
What kind of information will you be typing into this tool, and how private does it need to be?*
Select one
Public grant details only
Just names of public grants and official deadlines—nothing that isn't already on Google.
Contact names and draft ideas(Recommended)
Names of foundation officers, direct email addresses, and our private notes about what we plan to pitch.
Highly confidential charity data
Our charity's tax documents, detailed budget spreadsheets, and private donor history.
Other — your own answer
Imagine we are three months in. How will you know this tool is actually working well for your team?*
Select all that apply
We haven't missed a single deadline(Recommended)
No more frantic, midnight scrambles or realizing we missed a major funding window by two days.
Volunteers spend minutes, not hours, on follow-ups
Drafting reminders is so fast that volunteers actually do it instead of putting it off.
No more mental load
We trust the system so much that we don't lie awake worrying about forgotten applications.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the document

```
# Change Proposal: Grant Deadline Tracker and Email Drafter

## Context

The target user is a sole operator at a small charity who currently manages the entire fundraising and grant application pipeline alone. This operator is experiencing severe "spreadsheet chaos"—relying on highly manual, fragile, and disorganized spreadsheets to track multiple grant deadlines, reporting milestones, and outstanding tasks. 

Because of this chaotic manual tracking, the charity faces an ongoing risk of missing critical application windows or reporting deadlines. When it comes to writing follow-up emails, reaching out to partners for letters of support, or chasing internal updates, the operator relies on "copy-paste drafts" extracted from scattered local documents and historical sent folders.

Furthermore, because the operator is a one-person team, they have zero capacity to configure, manage, or pay for complex, enterprise-grade grant management systems designed for large-scale foundations. The solution must be extremely lightweight, highly reliable, focus entirely on public-facing and non-sensitive grant details, and prevent missed deadlines at all costs.

## Proposed Change

We propose a lightweight, focused web application called **GrantReminder**. This tool will serve as a single, simplified source of truth for tracking upcoming grant deadlines and generating ready-to-use email drafts. 

Key capabilities to be added:
*   **Visual Deadline Pipeline:** A chronological, priority-sorted dashboard highlighting approaching deadlines (such as Letters of Inquiry, Full Proposals, and Post-Award Reports) to support the success metric of zero missed deadlines.
*   **On-Demand Email Draft Generator:** An interactive component that compiles contextual email drafts (e.g., chasing a partner for a support letter, checking in with a program officer, or asking a trustee for feedback) based on stored grant details. 
*   **One-Click Copy Utility:** A system that facilitates the operator's preference for copy-pasting drafts. Instead of sending emails automatically, the tool formats and displays the generated email copy alongside a single-button "Copy to Clipboard" control.

## Scope

### In Scope
*   **Single-User Dashboard:** An uncluttered, responsive dashboard designed specifically for a sole operator.
*   **Grant Record Management (CRUD):** Ability to log and edit grant opportunities with fields restricted to non-sensitive, public-facing information:
    *   Grant Name
    *   Funder 
```

### myspec-brownfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The specification outlines a lightweight, single-user tool called GrantReminder designed to solve "spreadsheet chaos" for a sole charity operator. While the document excels at defining the user context, core CRUD requirements, and scope boundaries (such as omitting automatic email sending), it leaves several critical technical and functional decisions unresolved. Specifically, the data storage architecture remains an open recommendation rather than a firm decision, the exact library of pre-configured email templates is undefined, and the urgency-based color coding and optional mitigations are presented as vague suggestions. These gaps will force the coding agent to make arbitrary assumptions during implementation.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Unresolved Storage Architecture
Confidence score 9/10
Risks & Open Questions
The document lists 'Fully Local-First vs. Cloud Storage' as an Open Question and concludes that a local-first architecture is 'recommended'. A coding agent needs a definitive architectural decision rather than a recommendation to determine whether to build a client-only storage layer (e.g., IndexedDB/localStorage) or set up a server-side database and API.
Suggestion: Update the decision matrix to firmly state: 'Decision: The initial deployment will utilize a local-first browser storage architecture (localStorage/IndexedDB) with zero backend database or user authentication.'
Missing Email Template Specifications
Confidence score 9/10
Scope — In Scope
The 'Context-Aware Template Library' is specified as a core feature, but the document only provides illustrative examples of templates (e.g., 'Chasing Trustee for Sign-off', 'Funder Extension Request') rather than defining the actual suite of templates. Without the exact template names, subject lines, body text, and supported variables, the agent will have to invent the copy.
Suggestion: Add a concrete list of the default templates, specifying their names, subject lines, and body text with placeholder variables like {{Funder Name}} and {{Deadline Date}}.
Incomplete Color-Coding Urgency Rules
Confidence score 8/10
Scope — In Scope
The urgency-based color coding section defines rules using an 'e.g.' (e.g., Red for due in < 7 days, Orange for < 30 days). This leaves several boundary conditions undefined, such as how to handle past/overdue deadlines, the exact boundary at 7 days, and the color
```

### myspec-brownfield-v1-requirements — the round asked

```
When you find a new grant opportunity, how would you prefer to get it into this tracker?*
Select one
Type it in manually(Recommended)
You fill out a short, simple form with the grant name, deadline, and a quick note about what is needed.
Forward an email
You forward the funder's announcement email to the system, and it automatically extracts the deadline and details.
Upload a spreadsheet
You upload your existing Excel or Google Sheets file to import all your current grants at once.
Other — your own answer
Who is going to log in on a Monday morning, and should they all be allowed to see and edit the same things?*
Select one
Everyone has equal access(Recommended)
Any volunteer or staff member who logs in can view, add, or edit deadlines and draft reminder emails.
Admins edit, volunteers only read
Only the charity founder can add grants and edit drafts; volunteers can only view the schedule.
Volunteers only see their assigned grants
Volunteers only see and draft emails for the specific grants assigned to them by the coordinator.
Other — your own answer
How should the tool alert you about upcoming deadlines without you having to open the app to check?*
Select all that apply
A weekly email update(Recommended)
Receive a single email every Monday morning listing all deadlines and draft reminders for the next 30 days.
Individual deadline alerts
Get an email notification exactly 7 days and 2 days before a specific grant is due.
No automatic emails
The system stays quiet; you only see deadlines and drafts when you actively open the tool.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-requirements — the document

```
## Overview

**GrantReminder** is a lightweight, focused web application designed for a sole operator at a small charity who manages the fundraising and grant application pipeline single-handedly. This tool directly addresses the challenge of "spreadsheet chaos"—the manual, fragmented, and error-prone tracking of multiple critical funding deadlines—and eliminates the tedious work of hunting down and copy-pasting email drafts from historical folders.

The core objective of GrantReminder is to ensure **zero missed deadlines** while keeping administrative overhead to an absolute minimum. It achieves this by providing a single, simplified source of truth: a priority-sorted, color-coded visual pipeline combined with an on-demand, context-aware email draft generator and copy utility.

To comply with the charity's operational constraints and data policies:
*   The application operates with zero automatic outbound email transmission to ensure total user control and prevent accidental delivery.
*   The tool is local-first, run directly within the operator's web browser, requiring no complex server setup, user management, or database hosting.
*   The database stores public-facing, non-sensitive grant and funder information only.

## User Roles

GrantReminder is designed with a **flat access model** optimized for a single-operator environment.

### Sole Operator
*   **Goal:** Maintain clear oversight of all upcoming grant milestones, manage the pipeline, quickly draft outreach or follow-up communications, and never miss an application or reporting deadline.
*   **Access Level:** Full access to all components, including record creation, editing, deletion, template modification, manual clipboard copying, and data import/export configuration.
*   **Permissions:** No multi-user separation, role hierarchies, or collaborative permissions are defined. The single operator is the exclusive user of the system.

## Functional Requirements

The functional requirements are mapped to support the streamlined pipeline workflow and the context-aware copy-paste email workflow.

### Visual Deadline Pipeline & Dashboard
*   **Chronological Sorting:** The primary dashboard view must list all active grant records sorted chronologically by the closest upcoming deadline date and time.
*   **Urgency-Based Color Coding:** The dashboard must automatically evaluate active deadlines against the current system time and apply visual warning classes:
    *   **Red (Critical):** Deadlines due in les
```

### myspec-brownfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The GrantReminder specification provides a clear and focused overview of a local-first pipeline tracking application for a sole operator. However, several critical gaps would force a coding agent to guess key behaviors. Specifically, the default subject and body text patterns for the four pre-configured email templates are missing, the logic for determining which drafts need 'urgent attention based on upcoming phases' in the Weekly Digest is completely undefined, and the output structure of the generated .ics calendar events (such as summary format, description, and event duration) is unspecified. Additionally, there are minor naming mismatches between the validation rules and the data schema fields, as well as a lack of state tracking definition for the weekly digest trigger.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Default content for pre-configured templates is missing
Confidence score 10/10
Functional Requirements — Context-Aware Template Library
The specification requires a built-in pre-configured library of standard communication templates (Partner Support Request, Funder Check-in, etc.) that support dynamic variable substitution. However, the document does not specify the default text (subjectPattern and bodyPattern) for these templates. A coding agent will be forced to guess the wording and tone.
Suggestion: Provide the exact default string patterns for both the 'subjectPattern' and 'bodyPattern' of each of the four pre-defined templates, including how the tokens ({Funder_Name}, {Grant_Name}, etc.) are placed within them.
Vague rules for 'urgent attention' in Weekly Digest
Confidence score 10/10
Functional Requirements — Weekly Digest Background Action
The Weekly Digest is required to show 'Drafts that need urgent attention based on upcoming phases'. There is no definition of what constitutes 'urgent' for each phase, nor is there any timeline defined (e.g., does a 'Proposal Draft' become urgent at a different threshold than a 'Reporting' phase?). This makes the requirement untestable.
Suggestion: Define clear criteria for how 'urgent attention based on upcoming phases' is determined. For example, specify a mapping of phases to remaining days (e.g., 'LOI Draft' is urgent if deadline is < 14 days, 'Proposal Draft' if < 21 days) or explicitly link it to the existing dashboard urgency-based color coding thresholds.
Missing details for .ics event properties
```

### Edit — the Describe prefill

```
I want to update spec constitution.md, spec.md, plan.md and tasks.md to 
```
