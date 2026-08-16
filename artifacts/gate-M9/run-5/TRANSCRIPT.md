# M9п gate — what the models said

### speckit-greenfield-v1-interview — the round asked

```
Who is going to open this tool on a Monday morning to check on these grants?*
Select one
A single busy founder or director(Recommended)
One person who does everything from fundraising to running the charity programs.
A small team of 2 or 3 staff/volunteers
A few people who need to see who is handling which grant application so they don't double-email someone.
A part-time or freelance grant writer
A specialist who log in occasionally just to update deadlines and drafts for the director to approve.
Other — your own answer
How do you keep track of these deadlines right now, and what's the most painful part of that?*
Select one
Google Sheets or Excel(Recommended)
The pain is forgetting to look at the spreadsheet, or having to manually draft 10 different emails from scratch.
A shared calendar (like Google Calendar)
The pain is that alerts pop up, but you still have to dig up old emails to figure out what to write in the follow-up.
Mostly in our heads or sticky notes
The pain is the constant anxiety that a crucial deadline has already passed without us noticing.
Other — your own answer
When the tool drafts a reminder email for you, what would make it feel like magic?*
Select one
It puts the draft directly into my Gmail/Outlook drafts folder(Recommended)
You just open your normal email app, review the pre-written draft, and hit Send.
It shows the text on a dashboard with a 'Copy text' button
You log into the tool, click copy, and paste it wherever you want (email, WhatsApp, etc.).
It sends the email automatically on the due date
The system emails the donor directly without you needing to review it first.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the round asked

```
When it comes to drafting those reminder emails, what is the absolute 'red line' this tool must never cross?*
Select one
It must never send an email on its own(Recommended)
The tool only creates drafts; a human must always log into Gmail/Outlook and click 'Send'.
It must never read or edit my existing emails
The tool should only write new drafts, never look at your received emails or edit your sent history.
It must never draft emails directly to funders
It should only draft internal reminders to our own team, never to external grant officers.
Other — your own answer
What kind of details will you be storing in this tool, and how private do they need to be?*
Select one
Just basic dates and funder names(Recommended)
Nothing secret—just the names of public grants, deadlines, and standard templates that anyone could look up.
Drafts containing our budgets and project plans
The drafts will include specific funding amounts we are asking for and internal project notes we want to keep private.
Direct contact info and personal notes on funders
Personal email addresses of foundation directors and private notes about our relationship history with them.
Other — your own answer
Imagine you've been using this tool for three months. What does a successful Monday morning look like?*
Select one
Reviewing and sending pre-made drafts in 5 minutes(Recommended)
You open your Outlook/Gmail drafts folder, quickly tweak the automatically generated emails, and hit send.
A clear dashboard that ensures nothing slips through the cracks
You open the tool and immediately see a visual timeline of what is due, completely replacing your spreadsheet.
Knowing exactly who is handling which draft
You can see which volunteer or board member is assigned to review each draft before it goes out.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the document

```
# GrantDraft Constitution

## Core Principles

### I. Never Auto-Send (Human-in-the-Loop)
The system must never, under any circumstances, dispatch emails autonomously. Its sole communication output is writing high-quality drafts into the user's Gmail Drafts folder. The user must manually review and physically click "Send" within their native Gmail environment. This design eliminates the anxiety of automated tools sending incorrect or premature follow-ups to critical funding bodies.

### II. Solo-Founder Ergonomics (Quick Draft Review)
The user interface and background tasks must be optimized for a solo charity founder with extreme time constraints. Success is defined as enabling the user to review, edit, and approve a scheduled reminder draft in under 60 seconds directly in their daily workflow. The system must demand zero administrative overhead, featuring clean, single-click operations and no nested navigation menus.

### III. Spreadsheet-Pain Reducer
Small charities are bogged down by complex, neglected, and fragile tracking spreadsheets. GrantDraft replaces this setup with an opinionated, ultra-focused pipeline tracking engine. The data model is strictly restricted to tracking who is applying, what is due, when it is due, and who the point of contact is. No general-purpose CRM or fundraising automation bloat is permitted in the database schema.

### IV. Gmail-Native Integration
Instead of building a proprietary email client or demanding custom SMTP configuration, the application meets users where they already work. By utilizing direct Gmail API integrations, drafts appear seamlessly inside the user's existing inbox with their existing signature, styles, and identity. This leverages trusted native tools and ensures no email delivery issues.

### V. Secure Token Storage and Minimal Scopes
While grant deadlines themselves are generally public information, the authorization tokens and contents of draft emails are highly sensitive. Security architecture must isolate the user's Google OAuth credentials securely. The application must request only the absolute minimum API privileges required to compose drafts, preventing any access to reading inboxes or executing destructive actions.

## Safety Guardrails & Integration Standards

### API Scope Restriction
The system is strictly prohibited from requesting the broad `https://www.googleapis.com/auth/gmail.send` or `https://www.googleapis.com/auth/gmail.modify` OAuth scopes. The integration layer must exclusively 
```

### speckit-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The GrantDraft Constitution establishes clear, solid core principles around security and safety, specifically the non-negotiable write-only Gmail scopes and human-in-the-loop draft generation. However, the document is not ready for direct implementation due to critical ambiguities in its functional execution. Most notably, the CSV import feature lacks any definition of schema or column formats, and the scheduling behavior for overlapping deadlines contains an 'or' statement that leaves the draft generation strategy undefined. Resolving these ambiguities and specifying exact texts for safety sanitization will make the specification fully actionable for a coding agent.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Missing CSV File Format and Schema Specification
Confidence score 9/10
Development & Quality Assurance Workflow — Zero-Sync Flat File Imports
The document requires flat CSV file imports but does not specify the required column headers, data types, validation rules, or date formats (e.g., ISO-8601 vs local formats). This leaves the parsing and validation logic completely up to the agent's imagination, creating risks of integration failure.
Suggestion: Define the expected CSV column schema explicitly (for example: 'funder_name', 'grant_id', 'deadline_date', 'poc_email') and standard date formats (e.g., 'YYYY-MM-DD') that the importer must support.
Ambiguity in Overlapping Deadlines Scheduling Rule
Confidence score 10/10
Development & Quality Assurance Workflow — Deterministic Scheduling Tests
The test requirements state that multiple overlapping deadlines 'must group cleanly or generate distinct draft items without conflicts'. This 'or' presents an architectural ambiguity. The agent cannot know whether they should combine multiple reminders into a single draft email or generate individual draft emails per deadline.
Suggestion: Specify a single deterministic behavior, such as: 'Multiple overlapping deadlines must generate distinct draft items (separate draft emails) in the Gmail Drafts folder.'
Recommendations (1)
Undefined Fallback Footer Text Template
Confidence score 8/10
Safety Guardrails & Integration Standards — Draft Content Sanitization
The specification mandates appending a standard fallback notification to the draft footer but does not define the exact text string. This prevents the creation of precise, automated unit tests for the sanitization layer
```

### speckit-greenfield-v1-requirements — the round asked

```
How do you picture yourself putting new grant deadlines into this tool on a busy morning?*
Select one
Type them into a quick, clean form(Recommended)
You type the funder name, deadline date, and a brief note into a simple form on your screen.
Keep editing your current spreadsheet and let the tool read it
You keep your Excel or Google Sheet; the tool automatically watches it and pulls in new dates.
Forward the grant announcement email to a special address
You forward emails from funders to the tool, and it tries to find the deadline date for you.
Other — your own answer
Who is actually going to open this tool? Will everyone have the power to connect your charity's main email and edit everything?*
Select one
One shared account where everyone has full control(Recommended)
Keep it simple: anyone with the login can add deadlines and connect/use the email drafter.
An owner account (you) plus restricted accounts for volunteers or writers
Only you can link the main email account; helpers can only log in to add deadlines or view the schedule.
Active editors plus view-only access for your board
A couple of people manage the deadlines and draft emails, while board members can log in just to see what is coming up.
Other — your own answer
How do you want the tool to decide when to pop those draft emails into your Gmail or Outlook folder?*
Select one
Automatically draft them exactly 14 days before the deadline(Recommended)
The tool works quietly in the background and puts the draft in your folder exactly two weeks early.
Draft them only when you click a button next to a grant
You look at your upcoming list and click 'Create Draft' whenever you are personally ready to write it.
Draft all upcoming emails for the week every Monday morning
Every Monday, the tool looks at the week ahead and creates drafts for all those deadlines at once.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-requirements — the document

```
# Feature Specification: GrantDraft Tracker and Email Preparer

**Feature Branch**: `101-grantdraft-core-tracker`

**Created**: 2026-03-31

**Status**: Draft

**Input**: User description: "A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails"

## User Scenarios & Testing

### User Story 1 - Manual Grant Entry & On-Demand Gmail Draft Preparation (Priority: P1)

As a solo charity founder, I want to register a grant application manually via a simple layout and immediately generate a standardized reminder email draft inside my connected Gmail account, so that I can quickly follow up with funders without wrestling with spreadsheets or copy-pasting template text.

**Why this priority**: This is the core MVP loop. It establishes the basic tracking pipeline database, connects to the Gmail API with the secure write-only scope, runs the formatting/sanitization pipeline, and places the draft in the correct destination folder.

**Independent Test**: Can be fully tested by creating a single grant application via the manual form, clicking "Generate Draft", and confirming that a corresponding draft appears in the mock/actual Gmail account with correct formatting, while ensuring no email is sent automatically.

**Acceptance Scenarios**:

1. **Given** a founder has authenticated their Gmail account via Google OAuth (using only the `https://www.googleapis.com/auth/gmail.compose` scope), **When** they fill out the manual grant form with a funder name of "The Green Foundation", contact "Sarah Connor" (`sarah@greenfoundation.org`), a deadline of 2026-06-15, and click "Save & Prepare Draft", **Then** the grant is stored in the database, and a draft is successfully placed in their Gmail Drafts folder.
2. **Given** a generated draft for "The Green Foundation" is prepared, **When** the developer checks the draft contents in the Gmail environment, **Then** the recipient email is `sarah@greenfoundation.org`, the subject contains "Grant Application Reminder: The Green Foundation", the body text contains no unresolved placeholders (like `{Funder Name}`), and a standard GrantDraft confirmation footer is attached.

---

### User Story 2 - Time-Based Automated Draft Generation & Business Day Shifting (Priority: P2)

As a busy founder, I want the system to automatically prepare my reminder email drafts 7 days before a grant deadline, automatically shifting the prep date to the preceding business day if the reminder date falls on a weeken
```

### speckit-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The specification document outlines the core features of the GrantDraft tracker and email preparer tool, establishing a clear MVP scope and a custom business-day shifting scheduling rule. However, several critical gaps prevent complete implementation. The background scheduler is required to run at 08:00 local organization time, but the User entity lacks a timezone field. Furthermore, the draft compilation engine is expected to parse templates, yet no template structures, placeholder definitions, or storage mechanisms are defined. Finally, the CSV import requirements fail to specify the expected column headers, leaving the import format entirely up to guess work.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Missing Timezone Field for Local Organization Time Scheduler
Confidence score 9/10
Requirements — Functional Requirements
FR-005 states that the automated background schedule check must run daily at 08:00 'local organization time'. However, the User entity does not possess a timezone attribute, meaning the server cannot accurately map 08:00 local organization time to UTC or system time.
Suggestion: Add a `timezone` (string, e.g., IANA timezone format) attribute to the User entity schema and specify how the scheduler resolves local times to execute the check daily.
Undefined Template Content and Source
Confidence score 9/10
Requirements — Functional Requirements
FR-003 and User Story 1 reference draft template parsing, template tags (e.g., {Funder Name}), and compilation. However, the specification does not declare whether templates are hardcoded or customizable, where they are stored, nor does it provide the actual text of the default template.
Suggestion: Explicitly define the default email subject and body template text inside the specification, and clarify if templates are stored statically in code or if a Template entity needs to be added to the database schema.
Missing CSV Header Format Definitions
Confidence score 8/10
User Scenarios & Testing — User Story 3
User Story 3 and FR-008 define a CSV import mechanism to batch-upload records, but the document does not specify the exact column headers or mapping format required for the import to succeed (e.g., 'Funder Name', 'funder_name', 'Contact Email', etc.).
Suggestion: Add a clear table or example defining the mandatory CSV headers and their mapping to the GrantApplication attributes.
Recommendations (1)
Unc
```

### speckit-greenfield-v1-solution — the round asked

```
When you are checking deadlines and drafting these emails, where will you physically be working, and on what devices?*
Select all that apply
On a computer with reliable internet(Recommended)
You'll use it as a standard website on your office computer or laptop while connected to Wi-Fi.
On both phones and computers
You need to quickly check deadlines on your phone while on the move, as well as on your laptop.
On the go without internet access
You need to be able to view deadlines or draft reminders even when you don't have internet (like on a flight or train).
Other — your own answer
Where does your grant information live right now that this new tool should connect with?*
Select all that apply
An Excel or Google spreadsheet we already use(Recommended)
The tool should read deadlines directly from your existing tracking spreadsheet.
Our shared Google or Outlook calendar
The tool should sync with your calendar to display and track deadlines.
Nowhere—we want to type it directly into this new tool
You want a clean slate where you type the grant details directly into this new system.
Other — your own answer
Who at your charity will actually log in and use this tool?*
Select one
Just one person (usually the founder or director)(Recommended)
Only one person needs a login to manage deadlines and drafts.
A small, stable team of 2 to 5 people
A few core staff members need their own logins to collaborate and see the same dashboard.
A changing group of volunteers and staff
You need an easy way to invite, remove, and manage access for people who help out temporarily.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-solution — the document

```
# Implementation Plan: GrantDraft Core Tracker and Email Preparer

**Branch**: `101-grantdraft-core-tracker` | **Date**: 2026-03-31 | **Spec**: [/specs/101-grantdraft-core-tracker/requirements.md](/specs/101-grantdraft-core-tracker/requirements.md)

**Input**: Feature specification from `/specs/101-grantdraft-core-tracker/requirements.md`

**Note**: This plan outlines the technical design, architectural patterns, platform choices, and task specifications required to build the core pipeline tracking engine and direct write-only Gmail integration for GrantDraft.

## Summary

The primary requirement is to replace fragile tracking spreadsheets for a solo charity founder with an opinionated, ultra-focused grant application pipeline that automatically drafts follow-up emails directly into their Gmail Drafts folder. 

Our technical approach centers on three pillars:
1. **Direct Write-Only Gmail Integration**: Authenticate users via Google OAuth requesting exclusively the `gmail.compose` scope, keeping token data safely encrypted at rest, and writing formatted drafts without retaining full body content or needing SMTP configurations.
2. **Deterministic Weekend-Aware Scheduler**: An automated background routine that runs daily at 08:00 to detect approaching deadlines (7-day default warning) and pre-emptively calculates target draft times to shift weekend warnings to the preceding Friday business day.
3. **Draft Compilation & Sanitization Engine**: A structural parsing block that prevents sending raw placeholder variables (e.g., `{Funder Name}`) by executing rigorous pre-draft schema sanitization, RFC 5322 email checking, and appending a distinct safety disclaimer to every draft footer.

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.3 + React 18.2 (Frontend)

**Primary Dependencies**: 
* Backend: `fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `pydantic`, `google-auth-oauthlib`, `google-api-python-client`, `cryptography` (for secure credentials encryption at rest)
* Frontend: `vite`, `react-router-dom`, `tailwindcss`, `lucide-react`

**Storage**: PostgreSQL 16 (Production/Staging), SQLite (Local/Unit Testing)

**Testing**: `pytest`, `pytest-asyncio`, `pytest-mock`, and a localized Mock Gmail API server running locally during automated test execution

**Target Platform**: Docker-ready Linux environment (e.g., AWS ECS or Render instance) and standard modern web browsers (Chrome, Safari, Firefox)

**Project Type**: Monorepo Web Applicat
```

### speckit-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The implementation plan is generally clean and well-structured, successfully isolating the write-only OAuth scopes and maintaining strict database minimalism. However, it contains a critical scheduling contradiction regarding weekend execution, lacks a defined timezone for the daily background job, and leaves parsing and sanitization rules slightly ambiguous, which would cause the developer agent to make arbitrary design decisions.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Scheduler Weekend Execution and Timezone Contradiction
Confidence score 9/10
Technical Context — Deterministic Weekend-Aware Scheduler
The plan states that the scheduler 'runs daily at 08:00', but Constitutional Check VI states 'Zero scheduling tasks executed or scheduled on weekends.' If the scheduler executes daily, it will run on weekends, resulting in a direct contradiction. Additionally, '08:00' lacks a specified timezone (e.g., UTC, EST, or User Local Time), which is a common source of database/application sync bugs.
Suggestion: Define whether the daily background worker skips execution on weekends at the cron level (e.g., '0 8 * * 1-5') or within the application logic. Explicitly specify the target timezone (e.g., '08:00 UTC' or '08:00 organization-local time').
Recommendations (2)
Vague Bracket Sanitization Rule
Confidence score 8/10
Constitution Check — IV. Draft Sanitization
The instruction to scan for brackets ('{', '}', '[', ']') and halt generation is overly broad. An agent might block legitimate draft bodies containing plain bracketed text (e.g., 'See [Attachment 1]'). The exact criteria for determining if a field is 'unpopulated' is not specified.
Suggestion: Specify the precise regex pattern to target (such as matching matched pairs containing letters, e.g., `\{[A-Za-z0-9_ ]+\}`) instead of individual bracket characters.
Undefined CSV Import Schema
Confidence score 8/10
Project Structure — Source Code
The project lists components for CSV imports (`csv_import.py`, `CSVUploader.tsx`) but does not define the expected CSV header columns, required data fields, or date formats. The coding agent will have to guess the database mapping structure for the CSV parser.
Suggestion: Define the minimal CSV template columns (e.g., 'Funder Name', 'Deadline', 'Amount Requested', 'Notes') expected by the parser.
Accept feedback
Request changes
Ignore
```

### speckit-greenfield-v1-tasks — the round asked

```
When you first open this on a busy Monday morning, what is the absolute least it has to do to be worth your time?*
Select one
Type in dates manually, get auto-drafted emails(Recommended)
You type the grant name and due date into a simple form, and it automatically creates the draft emails in your inbox.
Upload our existing spreadsheet, get auto-drafted emails
You upload your current tracking spreadsheet, and the tool immediately drafts emails for every upcoming date it finds.
Just send me reminders first, skip the email drafts for now
The tool sends you a ping or notification when a grant is due, but doesn't write any draft emails for you yet.
Other — your own answer
Is there a specific calendar date or an upcoming grant deadline you are rushing to meet with this tool?*
Select one
No hard deadline(Recommended)
We want to stop using spreadsheets soon, but we have a few months to get this right.
An upcoming grant deadline
We have a major funding application due in the next few weeks and want to use this tool for it.
Other — your own answer
Who is actually going to sit down and build this tool for you?*
Select one
Ourselves, using simple automated tools(Recommended)
We want to build this using easy drag-and-drop tools like Zapier, Make, or Airtable without writing code.
A volunteer or freelance programmer
We have a friend or helper who knows how to write software and will code this for us in their spare time.
Nobody yet
We need to find someone to build this, so we need to keep the design as simple and standard as possible.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-tasks — the document

```
---

description: "Task list for the GrantDraft core tracker and email draft manager implementation"
---

# Tasks: GrantDraft Core Tracker and Email Preparer

**Input**: Design documents from `/specs/101-grantdraft-core-tracker/`

**Prerequisites**: plan.md (required), spec.md/requirements.md (required for user stories), research.md, data-model.md

**Tests**: Test tasks are included as requested by the test plan verification requirements. Tests are executed against a local Mock Gmail API server to avoid hitting Google API sandbox limits.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## Path Conventions

- **Frontend Project**: `frontend/src/`
- **Backend Project**: `backend/src/`
- **Backend Tests**: `backend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo project initialization, framework bootstrapping, and static analysis configuration.

- [ ] T001 Create project directories for `backend/` and `frontend/` at repository root
- [ ] T002 Initialize Python 3.11 FastAPI project with dependencies in `backend/requirements.txt`
- [ ] T003 Initialize React 18.2 + TypeScript 5.3 SPA with Vite inside `frontend/package.json`
- [ ] T004 [P] Configure backend linting and formatting rules with Ruff in `backend/pyproject.toml`
- [ ] T005 [P] Configure frontend linting and formatting rules with ESLint and Prettier in `frontend/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data model, secure OAuth authorization engines, local sandbox mock interfaces, and migration baselines.

**⚠️ CRITICAL**: This phase must be completed and validated before any user story implementation begins.

- [ ] T006 Setup SQLAlchemy PostgreSQL database configuration in `backend/src/core/database.py`
- [ ] T007 Initialize Alembic database migration environment in `backend/alembic/`
- [ ] T008 [P] Implement AES-256 GCM token encryption and decryption helpers in `backend/src/core/security.py`
- [ ] T009 Implement Google OAuth router in `backend/src/api/auth.py` strictly requiring the `https://www.googleapis.com/auth/gmail.compose` write-only scope
- [ ] T010 Create base SQLAlchemy tables for `User`, `GrantApplication`, and `DraftLog` in `backend/src/models/` without email body storage fields
- [ ] T011 Build offline Mock Gmail API server in `backend/tests/mock_gmail_api.py` to capture and verify draft write payloads locally
- [ ] T012 Configure global FastAPI error 
```

### speckit-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The task specification contains a critical contradiction regarding the database engine choice, alternating between PostgreSQL and SQLite across different sections of the document. This core conflict prevents consistent implementation of migrations and database connections. Additionally, several minor gaps exist around the expected CSV column schema and the exact content of the mandatory disclaimer footer, which would require the developer agent to guess the implementation details.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (9)
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
Suggestion: Add a task that implements FR-005, or name it in the requirements a listed task already covers.
FR-006 has no task
Automated check
Requirement Coverage
FR-006 is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.
Suggestion: Add a task that implem
```

### myspec-brownfield-v1-interview — the round asked

```
Who is the main person opening this tool on a Monday morning to check on the grants?*
Select one
The solo director(Recommended)
An executive director or founder who wears all the hats and is short on time.
A part-time volunteer
A helper who only logs in for a few hours a week and needs something dead simple.
A small team
Two or three staff members who need to coordinate so they don't double-email the same funder.
Other — your own answer
How are you keeping track of these deadlines today, and where does it hurt the most?*
Select one
A messy spreadsheet(Recommended)
We have a shared sheet, but it's hard to read, easy to mess up, and doesn't send us alerts.
Calendar events and memory
We put dates on Google Calendar, but things still slip through the cracks and writing the actual emails takes forever.
Notebooks and sticky notes
It's scattered across paper and desks, making it incredibly stressful to wonder what we are missing.
Other — your own answer
When it's time to write a reminder email, what would make this tool feel like absolute magic?*
Select one
One-click draft in Gmail/Outlook(Recommended)
Clicking a button opens a pre-written draft in your actual email app, ready to hit send.
Send directly from the tool
An editor inside the tool where you can review, tweak, and send the email without leaving.
A weekly copy-paste list
A simple screen showing the draft text so you can easily copy it and paste it wherever you want.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the round asked

```
To make sure you feel completely safe using this tool, what is the number one thing it must NEVER do on its own?*
Select one
Send an email without you clicking 'Send'
The tool creates the draft in Gmail or Outlook, but a human must always review and manually click send.
Share your grant list with anyone else
Keep everything strictly private to your account, with no team sharing or external access whatsoever.
Delete or overwrite past grant history
Keep a permanent archive of old applications, even the rejected ones, unless you explicitly delete them.
Other — your own answer
What is the most sensitive information this tool will hold?*
Select one
Just public dates and funder names
Basic info that anyone could find online. Very low security risk.
Funder email addresses and your private relationship notes
Direct contact names, email histories, and your internal thoughts on what the funder likes.
Your charity's tax documents, bank details, or budgets
Sensitive PDFs and spreadsheets uploaded directly into the tool for safekeeping.
Other — your own answer
To get this tool up and running quickly, what should we deliberately stay out of at first?*
Select all that apply
Writing the actual grant applications
The tool will track deadlines and emails, but won't help you write the actual proposals.
Charity bookkeeping and tracking how grant money is spent
We will leave financial spreadsheets and expense tracking to your existing tools.
Tracking regular individual donors
This will strictly track institutional grants (foundations, government) and ignore individual donors.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the document

```
# Change Proposal: Grant Tracker & Automated Email Drafter

## Context

Small charities often struggle to manage their grant application pipelines. Currently, solo directors use cluttered spreadsheets to track deadlines, submission statuses, and funder relationships. This "spreadsheet clutter" frequently leads to missed deadlines, lost follow-up opportunities, and administrative exhaustion for the solo director.

While the market offers enterprise-grade grant management platforms (such as SmartSimple and Fluxx) and heavy AI-powered grant writing systems (such as Vee), these tools are over-engineered, cost-prohibitive, and too complex for under-resourced solo operations. The primary need for this user segment is not a complex database or an automated proposal writer, but a clean system of record that keeps deadlines visible and simplifies the tedious process of writing follow-up and reminder emails.

## Proposed Change

We propose a lightweight, web-based tool designed specifically for the solo charity director. The tool will replace spreadsheet-based tracking with a clean, date-sorted pipeline dashboard and automate the preparation of standard outreach emails.

The core capability is a "One-Click Email Draft" feature. When a grant milestone or deadline approaches, the system generates a tailored email draft (e.g., a reminder to a program officer, a follow-up on a submitted application, or a query about upcoming reporting guidelines). 

To ensure the user maintains complete control and to eliminate the risk of accidental communication, the application will never send emails directly. Instead, clicking the drafting button triggers the user’s native device email client (e.g., Outlook, Apple Mail, or Gmail) with the pre-populated subject line, recipient email, and body text ready for final review, manual refinement, and sending.

## Scope

### In Scope
*   **Simple Pipeline Dashboard**: A clean, single-view list of grant applications sorted by chronological urgency, displaying Funder Name, Grant Name, Amount, Deadline Date, Funder Contact Email, and Status (e.g., Researching, Drafting, Submitted, Awarded, Declined).
*   **Basic Grant Entry & Management**: A simple form to add, edit, or delete grant records, satisfying basic tracking data needs.
*   **One-Click Email Draft Launcher**: An action button next to each grant record that generates a contextual email template (e.g., pre-submission inquiry, post-submission follow-up, or reporting reminder) and launches
```

### myspec-brownfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The specification outlines a lightweight, highly valuable grant tracker for solo charity directors, but it leaves critical implementation details unresolved. Key architectural and scope decisions—such as the authentication mechanism and the inclusion of a CSV export feature—are left as open questions. Furthermore, there are schema discrepancies between the Scope and Impact sections, and the exact templates and mapping rules for the core email drafting functionality are not defined. These gaps must be closed to prevent the coding agent from making arbitrary and potentially incorrect assumptions.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (4)
Authentication Mechanism Unresolved
Confidence score 10/10
Risks & Open Questions
The specification lists authentication as an open question, asking whether the system should support passwordless login (magic links) or single-sign-on (SSO). A coding agent cannot implement a functional user registration and login flow without a concrete architectural decision.
Suggestion: Explicitly define the authentication requirements. For example, specify whether the system should use a simple email/password login, a specific passwordless provider, or if user authentication is deferred to a later phase (making it a single-user local-first application).
Inconsistent Field Names and Database Schema
Confidence score 9/10
Scope — Simple Pipeline Dashboard
There is a contradiction in the required fields between sections. The 'Scope' section defines the dashboard fields as 'Funder Name, Grant Name, Amount, Deadline Date, Funder Contact Email, and Status'. Meanwhile, the 'Impact' section lists the schema fields as 'Funder, Amount, Stage, Target Date, Contact Name, Contact Email'. It is unclear if 'Status' and 'Stage' are identical, if 'Deadline Date' maps directly to 'Target Date', or whether fields like 'Grant Name' and 'Contact Name' are optional or required.
Suggestion: Consolidate the data schema into a single, definitive list of fields, establishing exact field names (e.g., 'grant_name', 'funder_name', 'amount', 'deadline_date', 'contact_name', 'contact_email', 'status') and their expected data types.
Undefined Email Templates and Status Mapping
Confidence score 9/10
Scope — Standard Email Templates
The specification asks for '3-5 high-quality, pre-defined templates' and mentions context-dependent drafts (such as pre-submission inquiries or repo
```

### myspec-brownfield-v1-requirements — the round asked

```
Since you are running this charity solo, will anyone else ever need to log in and look at this tracker?*
Select one
Only me(Recommended)
A single private login for you, keeping things simple and secure.
Me, plus board members who can only view
Board members can log in to see progress but cannot edit or draft emails.
Me, plus volunteers who can edit
Helpers can also log in to add grants, update deadlines, and draft reminders.
Other — your own answer
When you find a new grant to apply for, how do you want to get it into this system?*
Select one
Type it into a quick form(Recommended)
You type the funder's name, the due date, and the amount into a clean web page.
Forward an email to the tool
You forward the grant announcement email to a special address, and it reads the text to create the entry.
Other — your own answer
How should the tool nudge you about upcoming deadlines so nothing slips through the cracks?*
Select all that apply
A weekly Monday morning email summary(Recommended)
Get a simple email digest listing everything due in the next 14 to 30 days.
Create draft emails in my inbox automatically
The tool puts a draft reminder in your Gmail/Outlook drafts folder 14 days before the deadline.
Red highlighting on my dashboard
No extra emails; just make the upcoming items bright red when you open the tool.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-requirements — the document

```
## Overview

For small charities, managing the pipeline of grant opportunities is often an administrative bottleneck. Currently, solo directors rely on cluttered, multi-tabbed spreadsheets to track deadlines, application statuses, and funder relationships. This administrative overhead leads to "spreadsheet clutter," missed deadlines, forgotten follow-ups, and eventual exhaustion. 

The **Grant Tracker & Automated Email Drafter** is a lightweight, web-based tool designed specifically for the solo charity director. It replaces complex, multi-tabbed spreadsheets with a clean, chronologically sorted dashboard pipeline. To ease administrative burdens, the tool features a "One-Click Email Draft" utility. This action compiles a tailored, context-specific outreach draft (e.g., a pre-submission inquiry, a follow-up on a submitted application, or a reporting reminder) and immediately launches it in the user’s default local email client using the browser's native protocol. 

To maintain total user control and comply with strict operational safety boundaries, **the application will never send emails directly**. It does not integrate with any background mail servers (SMTP, API, or otherwise). Instead, it serves purely as a facilitator, placing the completely populated message in the user's local email client for manual review, refinement, and delivery.

---

## User Roles

The platform is designed with a single, highly focused user persona in mind to minimize administrative friction.

### Solo Director
*   **Definition**: The primary (and typically only) operator of the system within the charity organization.
*   **Key Responsibilities**: Enters prospective grants, updates pipeline stages, reviews weekly priorities, and initiates outreach.
*   **System Privileges**: 
    *   Full read/write permissions for all grant records and statuses.
    *   Ability to customize application preferences.
    *   Access to trigger email drafts and export data.
*   **Access Pattern**: Highly friction-free. To avoid the overhead of complex password policies, access is managed through passwordless logins (e.g., email-based Magic Links) or simple Google/Microsoft single sign-on (SSO).

---

## Functional Requirements

The functional requirements support a single-view, lightweight system of record focused on data input simplicity, chronological clarity, and manual confirmation loops.

### 1. Simple Pipeline Dashboard
The primary landing view for the Solo Director after logging in. It must
```

### myspec-brownfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The specification provides a clear and focused overview of a lightweight CRM tailored to solo charity directors, prioritizing a simple workflow and local mail client integration over complex backend integrations. However, the document contains several critical gaps and a contradiction that would prevent successful implementation by an automated agent. Most notably, the email templates require a dynamic [Charity Name] variable which is missing from the database schema. Additionally, there is a direct contradiction between the strict ban on backend mailing code and the requirement to support transactional email APIs for passwordless magic links. Finally, status mappings for email generation are incomplete, leaving behavior for Drafting and Declined states undefined.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Email templates reference missing 'Charity Name' field
Confidence score 10/10
Data Requirements — Data Dictionary
The email templates (Templates 1, 2, 3, and 4) all require a '[Charity Name]' placeholder to be populated dynamically. However, the logical entity relationship diagram and the Data Dictionary do not contain a 'charity_name' or 'organization_name' field in either the User or Grant entities. Without storing this data, the system cannot compile the templates.
Suggestion: Add a 'charity_name' field (String, Required) to either the User entity (representing the charity the director runs) or the Grant entity, and ensure it is collected during user setup or grant creation.
Contradiction between strict zero-server-side-mailing policy and passwordless magic links
Confidence score 10/10
Integration Requirements — Zero Server-Side Mailing Integration
The 'Zero Server-Side Mailing Integration' section states that the codebase must not contain any SMTP clients or background server-side message dispatch pipelines. However, 'Authentication Provider Integrations' specifies using transactional services like Resend or Postmark for passwordless magic links. This is a direct contradiction as those services represent background server-side dispatch integrations.
Suggestion: Clarify that the zero-server-side-mailing policy applies strictly to grant outreach communications. Alternatively, commit to a single SSO authentication standard (like Google/Microsoft OAuth 2.0) that completely eliminates the need for transactional mail servers.
Missing template mappings for 'Draft
```

### Edit — the Describe prefill

```
I want to update spec constitution.md, spec.md, plan.md and tasks.md to 
```

### Edit — the proposal

```
CONSTITUTION · EDIT

Proposed edit across 4 documents

I want to update spec constitution.md, spec.md, plan.md and tasks.md to state plainly that reminder emails are never sent without a human approving them. — +17 −8. Nothing is saved until you approve.

constitution.md +2 −2

--- a/constitution.md
+++ b/constitution.md
@@ -3,7 +3,7 @@
 ## Core Principles
 
 ### I. Never Auto-Send (Human-in-the-Loop)
-The system must never, under any circumstances, dispatch emails autonomously. Its sole communication output is writing high-quality drafts into the user's Gmail Drafts folder. The user must manually review and physically click "Send" within their native Gmail environment. This design eliminates the anxiety of automated tools sending incorrect or premature follow-ups to critical funding bodies.
+The system must never, under any circumstances, dispatch emails autonomously. Its sole communication output is writing high-quality drafts into the user's Gmail Drafts folder. Reminder emails are never sent without a human approving them. The user must manually review and physically click "Send" within their native Gmail environment. This design eliminates the anxiety of automated tools sending incorrect or premature follow-ups to critical funding bodies.
 
 ### II. Solo-Founder Ergonomics (Quick Draft Review)
 The user interface and background tasks must be optimized for a solo charity founder with extreme time constraints. Success is defined as enabling the user to review, edit, and approve a scheduled reminder draft in under 60 seconds directly in their daily workflow. The system must demand zero administrative overhead, featuring clean, single-click operations and no nested navigation menus.
@@ -22,7 +22,7 @@
 ### API Scope Restriction
 The system is strictly prohibited from requesting the broad `https://www.googleapis.com/auth/gmail.send` or `https://www.googleapis.com/auth/gmail.modify` OAuth scopes. The integration layer must exclusively request the limited write-only compose scope:
 `https://www.googleapis.com/auth/gmail.compose`
-This guarantee ensures that even a catastrophic system failure or compromise physically cannot send unauthorized mail from the charity’s domain.
+This guarantee ensures that even a catastrophic system failure or compromise physically cannot send unauthorized mail from the charity’s domain. Under all operational modes, reminder emails are never sent without a human approving them.
 
 ### Draft Content Sanitization
 Before any drafted reminder is written to the Gmail API, a structural formatting layer must run to:

requirements.md +7 −2

--- a/requirements.md
+++ b/requirements.md
@@ -8,6 +8,10 @@
 
 **Input**: User description: "A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails"
 
+## Core Mandate: Human-in-the-Loop Approval
+
+To eliminate any risk of unauthorized or premature communication, reminder emails are never sent without a human approving them. The application 
```
