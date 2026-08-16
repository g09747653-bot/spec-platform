# M9п gate — what the models said

### speckit-greenfield-v1-interview — the round asked

```
Who opens this on a Monday morning?*
Select one
The person who manages grant applications(Recommended)
They check deadlines and send reminders
The team lead who oversees grants
They review progress but don’t handle details
The volunteer coordinator
They help with applications but not deadlines
An external partner organization
They track deadlines for the charity
Other — your own answer
What do they do now to track deadlines and send reminders?*
Select all that apply
Use a spreadsheet to track dates
They manually update deadlines and send emails
Use a shared calendar
They add deadlines but rely on memory for emails
Set up email reminders manually
They create emails one by one as deadlines approach
Keep paper logs
They note deadlines on sticky notes or paper
Other — your own answer
What would make this tool obviously worth using?*
Select one
Automatically send reminder emails(Recommended)
They get emails drafted and sent without manual work
Show a visual schedule of deadlines
They see all upcoming deadlines in one place
Integrate with their email client
They send emails directly from the tool
Let multiple people edit deadlines
They share tracking with others in real time
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the round asked

```
What is one thing this tool must always do, no matter what?*
Select one
Always encrypt application data(Recommended)
Store all grant application details in an encrypted format, even when not in use.
Automatically send reminders on deadline
Email reminders to applicants exactly 7 days before a deadline, without manual input.
Track all deadlines in one view
Show a calendar view of all upcoming grant deadlines in one screen.
Never allow external logging
Make sure no third-party services can log or access application data.
Other — your own answer
What kind of data will this tool handle, and how sensitive is it?*
Select one
Store contact info only(Recommended)
Hold names, emails, and phone numbers of applicants, but no financial details.
Store complete application records
Keep all documents, transcripts, and financial statements submitted with applications.
Handle no personal data
Only track deadline dates and internal notes about applications, no applicant details.
Allow sharing with partners
Let the charity share application data with partner organizations for review.
Other — your own answer
What should this tool deliberately avoid handling, at least at first?*
Select all that apply
Donor contribution history
Keep track of past donations or funding sources related to grants.
Publicly shared grant data
Publish grant details or application results on the charity’s website.
AI scoring of applications
Use machine learning to rate or prioritize applications automatically.
Custom email templates
Allow users to create and save unlimited email templates for reminders.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the document

```
# GrantReminder Constitution

## Core Principles

### I. User-Centric Design  
Every feature must prioritize the needs of grants officers, ensuring intuitive workflows, minimal manual input, and clear visual indicators of approaching deadlines. Interfaces must avoid technical jargon and support quick onboarding without training.

### II. Data Security and Privacy  
All applicant contact data must be encrypted at rest and in transit. The tool must comply with GDPR and similar regulations, with no storage of donor history or sensitive financial data. Access controls must be role-based, with audit logs for all data interactions.

### III. Automation of Routine Tasks  
The tool must automatically track grant application deadlines, calculate reminders based on configurable lead times, and draft email templates with placeholders for personalization. Users must override defaults without disrupting automation.

### IV. Simplicity and Minimalism  
The product must avoid feature bloat. Only essential functions (tracking, reminders, basic reporting) are allowed. Third-party integrations are restricted to email services and calendar APIs; no unnecessary analytics or dashboards.

### V. Reliability and Accuracy  
Deadlines must be synchronized with external data sources (e.g., grant databases) where possible. Reminders must be sent with zero tolerance for delays. Failures in email delivery must trigger immediate alerts to the user via in-app notifications and SMS.

## Additional Constraints

**Technology Stack Requirements**  
- Backend: Python with Django or Flask, using PostgreSQL for encrypted storage.  
- Frontend: Lightweight React-based interface for desktop and mobile.  
- Encryption: AES-256 for data at rest; TLS 1.3 for transit.  
- Compliance: GDPR and UK Data Protection Act 2018.  

**Deployment Policies**  
- No storage of donor history or financial data.  
- All data backups must be encrypted and stored in UK-based cloud infrastructure.  
- Third-party services (e.g., email providers) must comply with data residency laws.  

## Development Workflow

**Code Review and Testing Gates**  
- All PRs must include unit tests covering 100% of core logic (deadline calculations, email templating).  
- Integration tests required for SMTP/email delivery, encryption libraries, and calendar sync APIs.  
- Code reviews must verify compliance with data security rules and avoid any donor-history-related features.  

**Quality Gates**  
- Automated testing must pass before 
```

### speckit-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The constitution has several critical gaps that would leave implementers uncertain during development. Key areas include unclear mechanisms for handling email failures (which conflict with the zero-tolerance deadline requirement), ambiguous definitions of 'overrides' in automation workflows, and lack of concrete usability criteria for manual testing. While the document provides strong high-level principles, their implementation requires additional specificity to be actionable.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Missing failure handling for email delivery
Confidence score 9/10
Core Principles — V. Reliability and Accuracy
The document requires 'zero tolerance for delays' in reminder delivery but does not specify how to handle email failures (e.g., retries, fallback channels, or alert escalation paths). This creates a contradiction between intent and implementation feasibility.
Suggestion: Add a subsection specifying mechanisms like automated retries, alternative delivery methods (e.g., SMS), and time-bound alert escalation to ensure zero-tolerance compliance.
Unclear override implementation mechanism
Confidence score 8/10
Core Principles — III. Automation of Routine Tasks
The requirement to 'override defaults without disrupting automation' lacks specificity about the allowed override methods (e.g., UI settings, API calls) or how automation continues after an override.
Suggestion: Define permissible override channels and specify that automation must continue using default parameters unless explicitly changed through documented user-facing mechanisms.
Recommendations (2)
Vague usability testing criteria
Confidence score 7/10
Development Workflow — Quality Gates
Manual testing by grants-officer representatives is required but lacks measurable success criteria. This makes it difficult to validate if usability goals are met.
Suggestion: Add a subsection with quantifiable metrics (e.g., task completion time, error rates) for assessing usability during manual testing.
Unspecified 'basic reporting' scope
Confidence score 6/10
Core Principles — IV. Simplicity and Minimalism
'Basic reporting' is mentioned as an allowed feature but not defined. This could lead to implementation ambiguity about what level of reporting is permissible.
Suggestion: Provide concrete examples of what constitutes 'basic reporting' (e.g., simple deadline calendars, grant status counters).
A
```

### speckit-greenfield-v1-requirements — the round asked

```
What are the most important things the person using this tool needs to be able to do, from start to finish?*
Select all that apply
Add a new grant application with a deadline(Recommended)
The user types in details like grant name, deadline date, and contact info for the applicant.
See a list of all upcoming deadlines
The user opens the tool and sees a calendar view of all deadlines, colored by urgency.
Send a custom email to applicants
The user clicks a button to email an applicant, and the tool drafts the message with placeholders like [Grant Name].
Mark a grant as submitted or missed
The user updates the status of a grant, which changes its color in the list and triggers a notification.
Export all grant data to a file
The user downloads a CSV file with all grants, deadlines, and statuses for reporting.
Other — your own answer
What should happen automatically when a deadline is approaching?*
Select one
Send a reminder email 7 days before the deadline(Recommended)
The tool sends an email to the applicant with a subject like 'Reminder: Grant [Name] is due soon'.
Notify the charity manager via SMS
The manager gets a text message saying 'Grant X is due in 3 days'.
Display a pop-up alert on the charity's computer
A window appears on the manager's screen with a warning about an upcoming deadline.
Send a final warning email the day before the deadline
The tool sends an email with a subject like 'Last Chance: Grant [Name] is due tomorrow'.
Other — your own answer
Do different people see different things in this tool?*
Select one
Managers see all grants, guests see only their own(Recommended)
The charity's manager can edit any grant, while volunteers only see grants they're responsible for.
Everyone sees the same information
All users, including interns, have full access to all grants and deadlines.
Only admins can add or delete grants
Regular users can only view and update grant statuses, not add new ones.
Applicants can log in to see their own deadlines
External users who applied for grants can check their deadlines without being charity staff.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-requirements — the document

```
# Feature Specification: Grant Deadline Tracker and Reminder Drafting Tool

**Feature Branch**: `[GRANT-REMINDER-TOOL]`

**Created**: 2023-11-01

**Status**: Draft

**Input**: User description: "A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track Grant Deadlines with Automated Reminders (Priority: P1)

A grants officer adds a new grant application to the system, sets a deadline, and configures reminder intervals. The tool automatically sends email reminders at specified intervals before the deadline.

**Why this priority**: This is the core functionality that solves the primary problem of missed deadlines. Without this, the tool cannot deliver its main value proposition.

**Independent Test**: Can be fully tested by adding a grant with a deadline, configuring reminders, and verifying emails are generated and sent at correct intervals.

**Acceptance Scenarios**:

1. **Given** a grant is added with a deadline of 2023-12-01, **When** the system checks for reminders on 2023-11-15, **Then** a draft email is generated with subject "Reminder: Grant Application Due Soon" and body containing the deadline date.
2. **Given** a grant has no configured reminders, **When** the deadline is reached, **Then** no automatic email is sent.
3. **Given** a grant has a configured reminder 3 days before the deadline, **When** the deadline is 2023-12-01 and today is 2023-11-28, **Then** a draft email is generated with subject "Final Reminder: Grant Application Deadline Approaching".

---

### User Story 2 - Customize Reminder Emails (Priority: P2)

A grants officer edits the template for reminder emails, adding personalized fields like grant name and applicant contact details. The system uses these custom fields in drafted emails.

**Why this priority**: Customization improves usability and ensures reminders are relevant to specific grants, increasing the likelihood of compliance.

**Independent Test**: Can be tested by editing the email template, adding a grant with personalized fields, and verifying the generated email contains those fields.

**Acceptance Scenarios**:

1. **Given** the email template contains a placeholder `{grant_name}`, **When** a grant with name "Community Food Bank" is added, **Then** the drafted email includes "Community Food Bank" in the subject and body.
2. **Given** the email template is left unchanged, **When** a grant is added, **T
```

### speckit-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The document contains vague requirements, untestable acceptance criteria, and gaps that leave implementation details ambiguous. Key issues include unspecified reminder intervals in acceptance scenarios, contradictory examples in deadline tracking, and missing definitions for edge cases and security requirements.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Unspecified Reminder Interval
Confidence score 8/10
User Story 1 - Track Grant Deadlines with Automated Reminders — Acceptance Scenarios
Acceptance Scenario 1 references a 45-day interval (deadline on 2023-12-01, check on 2023-11-15) but does not define the configured interval for the test. Without this, the scenario is untestable as the system’s behavior cannot be validated.
Suggestion: Clarify the configured reminder interval (e.g., 45 days) in the scenario description to make it testable.
Contradictory Deadline Calculation Example
Confidence score 9/10
User Story 3 - View All Grants with Upcoming Deadlines — Acceptance Scenarios
Acceptance Scenario 1 includes a grant with a deadline on 2023-12-15 (45 days from 2023-11-01) in the 30-day dashboard filter, which contradicts the requirement to show only grants due within 30 days.
Suggestion: Correct the example to ensure all grants displayed are within 30 days of the dashboard view date (e.g., exclude the 2023-12-15 deadline).
Missing System Behavior for Deadline Changes
Confidence score 7/10
Edge Cases
The edge case 'What happens when a grant deadline is manually changed after reminders have been sent?' is raised but not answered, leaving implementation logic ambiguous.
Suggestion: Define the system’s behavior (e.g., update reminders, mark existing ones as invalid) for this scenario.
Recommendations (2)
Vague Encryption Scope
Confidence score 6/10
Requirements — Functional Requirements
FR-004 specifies AES-256 encryption for contact data but does not clarify whether this applies to data at rest, in transit, or both. This ambiguity could lead to inconsistent implementation.
Suggestion: Add a note specifying encryption scope (e.g., 'AES-256 encryption is applied to all applicant contact data at rest and during transmission').
Subjective Success Criterion
Confidence score 7/10
Success Criteria — Measurable Outcomes
SC-003 measures user satisfaction with email clarity via self-reported surveys, which are subjective and hard to quantify for automated testing.
Suggest
```

### speckit-greenfield-v1-solution — the round asked

```
Where would people use this tool most often — on a phone, on a laptop, both, or somewhere else?*
Select one
Phone
Used when on the go, like during meetings or traveling.
Laptop
Used for detailed work, like at a desk or in the office.
Both(Recommended)
Used on phone for quick checks and on laptop for planning.
Other
Used in a way not listed here, like on a tablet or smartwatch.
Other — your own answer
Does the tool need to work with anything they already use — like a spreadsheet, an email client, or something else?*
Select one
Spreadsheet
Needs to replace or integrate with tools like Excel or Google Sheets.
Email client
Needs to connect with tools like Outlook or Gmail.
Calendar
Needs to sync with tools like Google Calendar or Outlook calendars.
Project management tool
Needs to integrate with tools like Asana or Trello.
Other
Needs to work with something not listed here, like a CRM or database.
Other — your own answer
How many people would use this tool — one or two people, three to five, more than five — and does that number change quickly?*
Select one
1 or 2 people(Recommended)
Only the manager uses it, or maybe a co-worker occasionally.
3 to 5 people
More people need access, like a small team.
More than 5 people
A larger group uses it, like an entire department.
Number changes quickly
The number of users grows or shrinks depending on the charity’s needs.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-solution — the document

```
# Implementation Plan: Grant Deadline Tracker and Reminder Drafting Tool

**Branch**: `[GRANT-REMINDER-TOOL]` | **Date**: 2023-11-01 | **Spec**: [link](/specs/GRANT-REMINDER-TOOL/spec.md)

**Input**: Feature specification from `/specs/GRANT-REMINDER-TOOL/spec.md`

**Note**: This template is filled in by the `__SPECKIT_COMMAND_PLAN__` command; its definition describes the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]  
The tool must track grant application deadlines, calculate reminders based on user-configurable intervals, and draft email templates with placeholders for personalization. The technical approach uses Python with Django/Flask for the backend, PostgreSQL for encrypted storage, and React for a lightweight frontend. Email automation is handled via SMTP with TLS 1.3 encryption.

## Technical Context

**Language/Version**: Python 3.11  
**Primary Dependencies**: Django 4.2, PostgreSQL 15, React 18, pytest 7.2  
**Storage**: PostgreSQL 15 with AES-256 encryption at rest  
**Testing**: pytest for unit tests, Django test client for integration tests  
**Target Platform**: Web (desktop and mobile via React)  
**Project Type**: Web-service  
**Performance Goals**: 100% email draft generation within 1 minute of deadline calculation, 99.9% uptime  
**Constraints**: GDPR compliance, no storage of donor history, AES-256 encryption for applicant data  
**Scale/Scope**: 1–2 users, 100+ grants tracked concurrently, 50+ email templates  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*  

- **Gate 1**: Data encryption (AES-256 at rest, TLS 1.3 in transit) ✅  
- **Gate 2**: No storage of donor history ✅  
- **Gate 3**: Role-based access controls with audit logs ✅  
- **Gate 4**: 100% test coverage for deadline calculations and email templating ✅  
- **Gate 5**: UK-based cloud infrastructure for backups ✅  

## Project Structure

### Documentation (this feature)

```text
specs/GRANT-REMINDER-TOOL/
├── plan.md              # This file (__SPECKIT_COMMAND_PLAN__ command output)
├── research.md          # Phase 0 output (__SPECKIT_COMMAND_PLAN__ command)
├── data-model.md        # Phase 1 output (__SPECKIT_COMMAND_PLAN__ command)
├── quickstart.md        # Phase 1 output (__SPECKIT_COMMAND_PLAN__ command)
├── contracts/           # Phase 1 output (__SPECKIT_COMMAND_PLAN__ command)
└── tasks.md             # Phase 2 output (__SPECKIT_COMMAND_TASKS__ 
```

### speckit-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The document contains critical contradictions and ambiguous requirements that would prevent the coding agent from executing the plan accurately. Key issues include conflicting statements about frontend inclusion, vague configuration mechanisms, and missing implementation details for security features.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Contradictory frontend scope statements
Confidence score 9/10
Project Structure — Structure Decision
The Summary states React is used for a 'lightweight frontend' while the Structure Decision claims 'mobile support is out of scope for version 1.0' and 'frontend (React) is not included in this scope'. This contradiction leaves the agent uncertain whether to implement frontend functionality.
Suggestion: Remove the contradiction by either (a) explicitly including React frontend implementation in the scope, or (b) revising the Summary to remove frontend-related requirements if they are truly out of scope.
Recommendations (2)
Vague user-configurable interval mechanism
Confidence score 8/10
Summary — primary requirement
The requirement to 'calculate reminders based on user-configurable intervals' lacks specificity about how users configure these intervals (e.g., through UI, API, or configuration files). This makes acceptance criteria untestable without additional details.
Suggestion: Define concrete configuration mechanisms (e.g., 'users configure intervals via the admin dashboard with a dropdown menu for time units') to make the requirement testable.
Incomplete encryption implementation details
Confidence score 7/10
Complexity Tracking — AES-256 encryption
The document states 'AES-256 encryption at rest' is required but doesn't specify how this will be implemented (e.g., via PostgreSQL's built-in encryption or application-layer encryption). This leaves the agent without specific implementation guidance.
Suggestion: Add technical details about encryption implementation (e.g., 'AES-256 encryption will be applied to all applicant data fields using PostgreSQL's pgcrypto module') to ensure compliance.
Accept feedback
Request changes
Ignore
```

### speckit-greenfield-v1-tasks — the round asked

```
What must this tool do for a first version to feel useful immediately?*
Select one
Track deadlines in a list and highlight upcoming ones(Recommended)
The manager can see all grant application due dates in one place, with warnings for deadlines in the next week.
Generate email drafts for reminders
The tool creates a ready-to-send email for each grant application when its deadline approaches.
Send emails automatically without human action
The tool sends reminders directly to grant applicants when deadlines are near.
Sync with the manager's calendar
The tool adds grant deadlines as calendar events for the manager to see.
Other — your own answer
What can wait until after the first version is working well?*
Select all that apply
Custom email templates for different grant types
The tool would let the manager choose from different email formats for different kinds of grants.
Send SMS reminders too
The tool would also send text messages in addition to emails.
Let other team members access the tool
More people in the charity could log in and see deadlines or send emails.
Generate reports on grant application trends
The tool would show charts or summaries of past grant application data.
Other — your own answer
Is there a specific date or time by which this must work?*
Select one
Before the next grant application deadline
The tool must be ready by a specific grant deadline the charity has coming up.
Before the manager’s next vacation
The tool must be ready by a specific date related to the manager’s schedule.
Before a charity event that needs grant funding
The tool must be ready by a specific charity event date.
There is no specific date attached
The tool can be built at the charity’s convenience without time pressure.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-tasks — the document

```
---

description: "Task list template for feature implementation"
---

# Tasks: Grant Reminder Tool

**Input**: Design documents from `/specs/GRANT-REMINDER-TOOL/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included as per spec.md (required for user stories)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- Paths shown below assume single project - adjust based on plan.md structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize Python project with Django dependencies
- [ ] T003 [P] Configure linting and formatting tools (Black, Flake8)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjusted based on project):

- [ ] T004 Setup PostgreSQL database with AES-256 encryption
- [ ] T005 [P] Implement authentication/authorization framework (reuse existing system)
- [ ] T006 [P] Setup API routing and middleware structure
- [ ] T007 Create base models/entities that all stories depend on (Grant, Reminder)
- [ ] T008 Configure error handling and logging infrastructure
- [ ] T009 Setup environment configuration management (secrets, encryption keys)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Track Grant Deadlines with Automated Reminders (Priority: P1) 🎯 MVP

**Goal**: Automatically send email reminders for grant deadlines based on user-configurable intervals

**Independent Test**: Add a grant with a deadline and configured reminders, verify email drafts are generated at correct intervals

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Contract test for email generat
```

### speckit-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The document provides a clear task structure but contains several vague requirements and untestable acceptance criteria that would leave the coding agent uncertain about specific implementation details. Key gaps include missing information about reminder intervals, unclear contract test specifications, and insufficient details about existing authentication systems.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (7)
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
Missing specific reminder intervals
Confidence score 8/10
Phase 3: User Story 1 - Track Grant Deadlines with Automated Reminders
The 'Independent Test' for User Story 1 mentions verifying emails at 'correct intervals' but does not specify what those intervals are (e.g., 3 days, 1 day before deadlines). This creates ambiguity about expected behavior.
Suggestion: Define
```

### myspec-brownfield-v1-interview — the round asked

```
Who will be using this tool every day, and what are they trying to get done?*
Select one
A grants officer who manages deadlines and communications(Recommended)
This person is responsible for tracking all grant application due dates and sending reminders to applicants.
A program manager who oversees grant applications
This person ensures grants are applied for on time but doesn’t handle the nitty-gritty of sending reminders.
An admin assistant who sends emails and maintains records
This person handles email reminders but doesn’t track deadlines themselves.
An executive director who reviews applications
This person occasionally checks deadlines but isn’t involved in daily tracking or reminders.
Other — your own answer
What do these people do today to track deadlines and send reminders, and what frustrates them about it?*
Select one
They use a spreadsheet to track deadlines and manually write emails(Recommended)
This is time-consuming and error-prone, especially when multiple applications are due.
They add deadlines to a shared calendar and send emails from there
This works for visibility but doesn’t help with drafting or sending personalized reminders.
They keep a folder of draft emails and manually check due dates
This is disorganized and easy to forget deadlines, especially with overlapping applications.
They rely on phone reminders and handwritten notes
This is unreliable and doesn’t scale with more applications.
Other — your own answer
What would make this tool obviously worth using every day?*
Select one
Automatically sending reminder emails when deadlines are approaching(Recommended)
This saves time and ensures no deadlines are missed, even during busy periods.
Having all deadlines in one place with status updates
This helps the user see progress at a glance but doesn’t solve the problem of sending reminders.
Customizing email templates for different grant types
This makes emails feel more personalized but doesn’t address tracking deadlines.
Syncing with the charity’s existing grant management system
This reduces manual data entry but doesn’t directly help with reminders.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the round asked

```
What is one thing this tool must always do, no matter what?*
Select one
Require the user to confirm before sending any email(Recommended)
The tool pauses and shows a confirmation screen before any email leaves the system
Automatically archive old applications after 6 months
Old grant applications are moved to a read-only storage area
Integrate with the charity's current email service
Uses the same email server and login credentials as the charity's existing setup
Never require manual entry of deadlines
All deadlines are imported from a spreadsheet or calendar
Require two-factor authentication for access
Users need to enter a code sent to their phone before using the tool
Other — your own answer
What kind of information will this tool handle that needs special care?*
Select one
Personal details of grant applicants(Recommended)
Names, contact information, and sometimes financial details of people applying for grants
Internal notes from the grants officer
Private comments or observations made during the application review process
The charity's own financial information
Details about the charity's budget or funding sources
Text from grant applications themselves
The full content of applications submitted by others
No sensitive information at all
All data is non-confidential and can be shared freely
Other — your own answer
What is one thing this tool should deliberately avoid doing, at least at first?*
Select one
Use AI to write email content(Recommended)
Letting machine learning algorithms generate email text
Create a website for applicants to track their status
Giving applicants direct access to see their application progress
Automatically allocate funds when deadlines are met
Transferring money to applicants without human review
Send text message reminders
Using phone numbers to send alerts about upcoming deadlines
Avoid nothing - do whatever is needed
No restrictions on features or capabilities
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the document

```
# Change Proposal: Grant Reminder Automation Tool

## Context

The current system relies on manual tracking of grant application deadlines using spreadsheets, with the grants officer responsible for manually identifying upcoming deadlines and drafting reminder emails. This process is error-prone, time-consuming, and lacks automation, leading to potential missed deadlines and inconsistent communication. The system must avoid AI-powered drafting and must include explicit confirmation before sending any email to recipients.

## Proposed Change

Introduce a tool that automatically tracks grant application deadlines from a centralized database, generates draft reminder emails with customizable templates, and requires explicit user confirmation before sending. The tool will replace manual spreadsheet tracking and reduce the manual effort required to manage deadlines and communications. It will include a confirmation workflow to ensure emails are only sent after review by the grants officer.

## Scope

This change includes:
- Automatic tracking of grant deadlines from a centralized data source
- Drafting of reminder emails using predefined templates
- A confirmation step requiring manual approval before email sending
- Secure handling of personal information in accordance with data protection requirements

This change does **not** include:
- AI-generated email content
- Integration with external grant management systems
- Automated email sending without manual confirmation

## Impact

This change will affect:
- **Interfaces:** A new user interface for managing deadlines and reviewing email drafts
- **Data:** Storage and processing of grant application deadlines and email templates
- **Workflows:** Automation of deadline tracking and email drafting, with a manual confirmation step
- **Operations:** Reduction in manual spreadsheet management and decreased risk of missed deadlines

## Risks & Open Questions

- **Data Security:** How will personal information in grant applications be securely handled during email drafting and storage?
- **User Adoption:** Will the grants officer require training to use the new tool effectively?
- **Email Template Customization:** How flexible will the email templates be for different types of grant applications?
- **System Reliability:** What happens if the tool fails to track a deadline or draft an email correctly?
```

### myspec-brownfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The document provides useful context but contains critical gaps in technical implementation details, security specifics, and failure scenarios that would leave the coding agent unable to build a fully compliant solution without further clarification.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Missing Security Implementation Details
Confidence score 9/10
Scope — This change includes
The scope mentions secure handling of personal information but does not specify encryption methods, access controls, or audit mechanisms required for compliance.
Suggestion: Add technical requirements for data protection, such as 'Email templates and applicant data must be stored with AES-256 encryption at rest and TLS 1.2+ during transmission.'
Unspecified Failure Recovery
Confidence score 8/10
Risks & Open Questions — System Reliability
The document raises a critical question about system reliability but provides no requirements for error handling, alerts, or fallback mechanisms.
Suggestion: Add a requirement like 'The system must log all deadline tracking failures and notify the grants officer via in-app alert and email within 5 minutes of detection.'
Recommendations (2)
Vague Interface Requirements
Confidence score 7/10
Impact — Interfaces
The impact section mentions a new UI but does not specify required features, usability standards, or access control requirements for the interface.
Suggestion: Define requirements such as 'The UI must include a calendar view of deadlines, version history for email templates, and role-based access controls for grants officers.'
Unclear Template Customization Parameters
Confidence score 6/10
Risks & Open Questions — Email Template Customization
The document asks about template flexibility but does not specify whether templates can be versioned, reused, or have content restrictions.
Suggestion: Add a requirement like 'Email templates must support merge fields for grant-specific data and must include a version control system with approval workflows.'
Accept feedback
Request changes
Ignore
```

### Edit — the Describe prefill

```
I want to update spec constitution.md, spec.md, plan.md and tasks.md to 
```
