# M10п gate — what the models said

### myspec-greenfield-v1-interview — the round asked

```
Who is the main person opening this on a Monday morning, and what is their main goal?*
Select one
A volunteer or part-time fundraiser(Recommended)
They have limited hours and just want to know who to email today without digging through files.
The charity's director or founder
They juggle everything and need a quick bird's-eye view of coming deadlines so the charity doesn't run out of money.
A board member or trustee
They want to pop in occasionally to check on progress and make sure deadlines are being met.
Other — your own answer
How do you track these grant deadlines today, and what is the most annoying part of that process?*
Select one
We use a spreadsheet, but it gets messy and out of date(Recommended)
People forget to update it, and we still have to manually write every email from scratch anyway.
We rely on calendar invites and inbox searches
We spend too much time hunting for previous application details and draft templates in our sent folder.
It is mostly in someone's head, which leads to last-minute panics
We occasionally miss deadlines entirely because there is no central system.
Other — your own answer
What would make you say 'thank goodness we have this tool' instead of going back to your old way?*
Select one
Seeing a fully written draft email ready to copy/paste(Recommended)
The tool automatically fills in the funder's name, the project name, and the due date so you just hit send.
A simple color-coded dashboard of upcoming deadlines
A quick visual check where anything due in 2 weeks is red, 4 weeks is yellow, etc.
Getting a weekly summary email sent directly to your inbox
You don't even have to log in; a reminder of this week's tasks lands in your inbox every Monday morning.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the round asked

```
When you think about this tool running day-to-day, what is the absolute worst-case scenario we must prevent, or the one thing it must always do?*
Select one
Never send an email automatically without a human checking it first(Recommended)
The tool only drafts the text; a volunteer must manually review and hit send from their own email.
Never let a deadline slip by without some kind of alert
If someone doesn't log in, the system must proactively nudge them via email or text.
Never share draft contents or contact names between different volunteers
Each volunteer should only see the grants and drafts they are personally working on.
Other — your own answer
What kind of information will you be typing into this tool, and how private does it need to be?*
Select one
Publicly available grant info and standard charity descriptions
Simple info like 'Funder Name', 'Deadline Date', and boilerplate text about your charity.
Funder contact details and internal notes about relationships(Recommended)
Names and email addresses of foundation managers, plus notes on how past conversations went.
Draft budgets, project plans, and sensitive charity financial data
Specific dollar amounts requested, draft program details, and internal financial bottlenecks.
Other — your own answer
To keep this simple and get it in your hands quickly, what should we deliberately stay out of at the beginning?*
Select all that apply
Actually sending the emails from the tool(Recommended)
We will just display the drafted text on the screen for you to copy and paste into Outlook or Gmail.
Tracking the grant money once you win it
We won't build features to track how the awarded grant money is spent or reported on.
Storing PDF proposals or tax documents
We won't host your actual application files; we will only track the dates and text drafts.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the document

```
## Project Vision

The goal of this project is to build a lightweight, highly intuitive web-based tracking and drafting utility tailored specifically for volunteer fundraisers at small charities. 

Volunteer fundraisers often manage multiple grant opportunities simultaneously, which frequently leads to "spreadsheet chaos"—where critical deadlines are missed, status updates are lost, or templates must be manually rewritten from scratch. This tool replaces disorganized spreadsheets with a structured dashboard that visually highlights when grant applications or follow-ups are due. 

The software's "magic moment" is when a volunteer selects an upcoming or overdue milestone and is immediately presented with a fully formatted, context-specific reminder or follow-up email draft. The volunteer can copy this draft or launch it in their local email client with a single click, completely eliminating the cognitive burden of drafting correspondence while preserving absolute manual control over the communication.

## Core Principles

*   **Zero Automatic Email Delivery (Absolute Dealbreaker):** Under no circumstances is the system allowed to send emails automatically. Every message generated must go through manual human review, editing, and execution outside of the platform.
*   **No Direct Emailing Capabilities (Strictly Out of Scope):** The system must not connect to external mail servers (SMTP), mail APIs (e.g., Mailgun, SendGrid, Resend), or OAuth-based email integrations (Gmail/Outlook API). All drafts are handled exclusively via the browser's native clipboard or local system mail protocols.
*   **Volunteer-Centric UX:** The interface must require near-zero training. Volunteers are often non-technical and time-constrained. Avoid complex configuration screens, multi-tenant workspace configurations, or administrative bloat.
*   **High Accountability and Transparency:** The system must clearly display the status of each application, the logic behind due dates, and the placeholders used to compile drafts.

## Technology Constraints

*   **Frontend Framework:** Next.js (App Router) with TypeScript and Tailwind CSS.
*   **Database:** SQLite via Prisma ORM (or Drizzle ORM). SQLite is chosen for its simplicity, zero-configuration hosting requirements, portability, and exceptional speed for small-to-medium datasets typical of a local charity.
*   **State Management:** React Context or native React state hooks. No complex global state libraries (e.g., Redux) are allowed.
*  
```

### myspec-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The specification provides a strong, logical foundation for building a volunteer tracking tool with clear boundaries, such as the absolute prohibition on automatic email delivery. However, it contains several critical ambiguities and contradictions that will block an automated agent. Most notably, it mandates authentication without defining a User schema or credential storage mechanism, and it introduces a mismatch between standard template placeholders (such as `{grant_name}`) and actual database entity fields (such as `title`). Resolving these issues alongside minor ORM and data type clarifications will make the document completely actionable.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Vague Authentication Requirement and Missing User Schema
Confidence score 9/10
Security Constraints
The document specifies implementing session-based authentication (such as NextAuth.js with a credentials provider) to protect private grant and contact information. However, there is no corresponding User database entity in the core schema requirements, nor any specification on how credentials are to be provisioned, stored, or managed. A coding agent cannot determine if registration is permitted, if accounts should be seeded, or how to model the users in SQLite.
Suggestion: Specify a concrete authentication strategy: either add a 'User' model to the Core Schema Entity Requirements (with fields for id, email, and hashed password) and describe how the initial user is seeded, or mandate a static single-user credential system configured solely via environment variables.
Mismatch between template placeholders and database schema fields
Confidence score 10/10
Architecture Constraints — Core Schema Entity Requirements
Under Core Schema Entity Requirements, the EmailTemplate contains a subject template referencing the placeholder '{grant_name}'. However, the GrantApplication schema uses 'title' to represent the name of the grant. This mismatch will break the dynamic string-interpolation logic or cause validation failures in the template engine tests.
Suggestion: Change '{grant_name}' to '{title}' in the example subject_template, or explicitly specify that the interpolation engine must map '{grant_name}' to the 'title' database field.
Recommendations (3)
Ambiguous ORM Selection
Confidence score 8/10
Technology Constraints
The technology constraints list 'Prisma ORM (or Drizzle ORM)' as opt
```

### myspec-greenfield-v1-requirements — the round asked

```
When a volunteer sits down to use this on a Tuesday morning, what are the main things they should be doing in the tool?*
Select one
Type in a grant deadline and instantly get an email draft to copy(Recommended)
The user types the funder name and date, and the tool immediately displays a clean timeline and the draft email.
Forward a messy email from a funder and let the tool extract the details
The user forwards an email to a special address; the tool automatically finds the deadline and writes the draft.
Upload a spreadsheet of old grants to set up everything at once
The user starts by uploading their existing Excel sheet to populate the dashboard and draft emails for the year.
Other — your own answer
Does everyone who opens this tool have the exact same access, or do different people need different views?*
Select one
Shared access: everyone can add deadlines and copy drafts(Recommended)
Simple and open; any volunteer who logs in can view, edit, and copy everything.
Coordinator vs. Volunteer: only one person can change deadlines
One manager sets the dates; volunteers can only log in to see what is due and copy email drafts.
No logins: a single shared link for the whole team
No usernames or passwords; anyone with the secret link can view and edit the list.
Other — your own answer
Should the tool do anything automatically in the background while everyone's hands are off the keyboard?*
Select one
Send a weekly email summary with the ready-to-use drafts attached(Recommended)
Every Monday, the tool emails the team a list of deadlines for the month, with the pre-written text right in the email.
Send real-time alerts to Slack or WhatsApp when a deadline is near
The tool automatically posts a message to your team chat 7 days before a grant is due.
Nothing automatic: it only reacts when someone is logged in
The tool stays completely quiet until a volunteer opens the website to check on things.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-requirements — the document

```
## Overview

This specification details a lightweight, intuitive web-based tracking and drafting utility tailored specifically for volunteer fundraisers at small charities. 

Volunteer fundraisers often manage multiple grant opportunities simultaneously, which frequently leads to "spreadsheet chaos"—where critical deadlines are missed, status updates are lost, or email templates must be manually rewritten from scratch. This tool replaces disorganized spreadsheets with a structured visual dashboard that highlights when grant applications or follow-ups are due.

The core "magic moment" of this application is when a volunteer selects an upcoming or overdue milestone and is immediately presented with a fully formatted, context-specific reminder or follow-up email draft. The volunteer can copy this draft to their clipboard or launch it in their local email client with a single click. This eliminates the cognitive burden of writing correspondence while preserving absolute manual control over actual communications.

### Core Architecture and Delivery Principles

*   **Zero Automatic Email Delivery (Absolute Dealbreaker):** Under no circumstances is the system allowed to send emails to external funders automatically. Every generated message must go through manual human review, editing, and execution outside of the platform.
*   **No Direct Emailing Capabilities (Strictly Out of Scope):** The system must not connect to external mail servers (SMTP), mail APIs (e.g., Mailgun, SendGrid, Resend), or OAuth-based email integrations (Gmail/Outlook API). All drafts are handled exclusively via the browser's native clipboard or local system mail client protocols (`mailto:`).
*   **Volunteer-Centric UX:** The interface requires near-zero training. It avoids complex configuration screens, multi-tenant workspace configurations, or administrative bloat.
*   **High Accountability and Transparency:** The system clearly displays the status of each application, the logic behind due dates, and the placeholders used to compile drafts.

---

## User Roles

The system uses a flat, single-tier access model. There are no multi-tenant environments, complex organizational hierarchies, or granular role-based access controls (RBAC). 

### Volunteer Fundraiser
*   **Description:** An active volunteer, staff member, or fundraiser within the small charity.
*   **Permissions:** All authenticated users share equal capability. Every user can create, read, update, and delete grant applications, cust
```

### myspec-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

While the specification provides a clear and highly focused functional UX design, it contains critical data modeling omissions that will leave the coding agent guessing. It mandates a session-based authentication system and references 'system configurations' and 'local currency' formatting, but fails to provide database schemas or clear requirements for either a User entity or a System Configuration entity. Resolving these schema gaps and clarifying date boundary logic will ensure the developer can implement the utility seamlessly.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Missing User Schema for Session-Based Authentication
Confidence score 10/10
Security Constraints — Session-Based Authentication
The specification requires session-based authentication with standard email/password validation and states that unauthenticated requests to API endpoints must return 401 responses. However, the 'Data Requirements' section only defines schemas for 'GrantApplication' and 'EmailTemplate'. There is no schema or field specification provided for storing user credentials or session tokens, leaving the agent to guess how authentication is persistence-modeled.
Suggestion: Add a 'User' database schema to the Data Requirements section detailing fields such as 'id' (UUID, PK), 'email' (String, Unique, Required), and 'password_hash' (String, Required).
Undefined System Configurations Entity and Scope
Confidence score 9/10
User Roles — Volunteer Fundraiser
The user permissions state that volunteers can manage 'system configurations,' and the template engine requires amount formatting in 'local currency'. However, there is no system configuration schema defined, nor is there any specification of what configuration parameters (such as currency code, local timezone, or locale) exist and how they are read or stored.
Suggestion: Either define a simple 'SystemConfiguration' key-value database schema or specify that the application uses hardcoded defaults (e.g., USD for currency and UTC/local browser timezone for dates) and remove the reference to CRUD capabilities for system configurations.
Recommendations (3)
Overlapping Rules for Due Soon and Overdue Badges
Confidence score 8/10
Functional Requirements — 2. Deadline Dashboard & Visual Alerts
The rules define 'Due Soon' as any application with a 'deadline_date' less than 14 days in the future, and 'Overdue' as a 'deadline_date' in the 
```

### myspec-greenfield-v1-solution — the round asked

```
When a fundraiser is checking deadlines or grabbing an email draft, what device are they using, and do they need it to work offline?*
Select one
A computer or laptop with reliable internet
A standard web app designed for larger screens where typing drafts is easiest.
On their phones, sometimes with shaky mobile signal
A mobile-first tool that saves changes offline and syncs up once they get connection back.
They switch between computer and phone throughout the day
A fully responsive web app that fits any screen size, requiring an active internet connection.
Other — your own answer
Do these deadline reminders and draft emails need to link up with tools you already use, or is a standalone website fine?*
Select one
Keep it separate; we will manually copy and paste into our own email and calendars
A simple dashboard where they log in, see dates, and click 'Copy' on ready-made drafts.
Connect directly to Google (Gmail and Google Calendar)
The tool puts deadlines right onto a shared Google Calendar and lets them send drafts directly from Gmail.
Connect directly to Microsoft (Outlook and Outlook Calendar)
Deadlines sync to Outlook calendars and drafts can be sent straight through their Microsoft email accounts.
Other — your own answer
How many people from your charity will actually be logging into this tool to manage the grants?*
Select one
Just one or two core people
We keep setup incredibly simple with one shared login or basic individual logins.
A small team (3 to 10 volunteers)
We will add simple accounts so people don't step on each other's toes when updating deadlines.
A large or constantly changing group of volunteers
We'll build a quick system to invite new volunteers and revoke access easily when they move on.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-solution — the document

```
## Overview

This specification details a lightweight, secure, and intuitive web-based tracking and drafting utility tailored specifically for volunteer fundraisers at small charities. 

The software acts as an operational system of record to resolve "spreadsheet chaos"—the common state of affairs where small nonprofit organizations miss critical grant submission dates, lose track of historical correspondence, or waste hours re-drafting emails. By replacing manual spreadsheets with a unified deadline pipeline, the tool ensures all tracking occurs transparently. 

The application's core feature—the **"magic moment"**—is activated when a user selects a grant deadline or milestone on the dashboard. The system instantly compiles a fully interpolated, context-specific outreach or follow-up email draft using local database attributes. The user can copy this draft to their clipboard or automatically launch their default system mail handler with a single click.

### Architectural Guardrails

*   **Zero Automatic Email Delivery (Absolute Dealbreaker):** The software does not contain, and must never be extended with, automated outbound mailing capabilities. To eliminate any possibility of accidental delivery to external funders, the application has no access to external mail servers (SMTP), transactional mail APIs (e.g., Mailgun, SendGrid), or OAuth-based email integrations (Google Workspace, Microsoft Outlook API).
*   **Browser-Native Integrations Only:** Draft dispatching occurs strictly through the secure browser Clipboard API or client-side `mailto:` URI execution. All actual editing, review, and sending are handled manually by the user within their own system email application.
*   **Volunteer-Optimized Usability:** Designed for non-technical volunteers who require a highly flat, self-evident interface with near-zero training overhead.
*   **Secure Single-User Footprint:** Optimized for a single-user or small flat-team environment running on a local machine, a secure local network, or a simply hosted private web container.

---

## High-Level Architecture Design

The application is structured as a standalone, monorepo web application using Next.js (App Router), TypeScript, Tailwind CSS, and SQLite with Prisma ORM.

```
                               +-----------------------------------+
                               |         Client Web Browser        |
                               +-----------------------------------+
                                 |    
```

### myspec-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The solution document is well-structured and provides a strong foundation for building the volunteer tracking and drafting utility. However, it contains several critical ambiguities and contradictions that will block an automated coding agent. These include missing default content definitions for mandatory seeded email templates, a schema mismatch where the template engine expects `{grant_name}` but the schema only defines `title`, a highly vague administrative setup flow choice ('stdout output' versus 'setup screen'), and an undefined execution model for scheduled weekly digest calculations. Addressing these items along with boundary logic clarifications will make the specification fully testable and implementable.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (4)
Missing content definitions for seeded templates
Confidence score 10/10
System Modules — Template Customization Module
The specification states that the database seeding script must register three default templates: 'Submission Follow-Up', 'Document Clarification Request', and 'Reporting Submission'. However, the exact subject and body texts for 'Document Clarification Request' and 'Reporting Submission' are never defined in the document. A coding agent will be forced to guess the content, leading to untestable and unpredictable baseline states.
Suggestion: Provide the explicit default subjectTemplate and bodyTemplate string constants for the 'Document Clarification Request' and 'Reporting Submission' templates directly in the specification.
Dynamic token {grant_name} has no corresponding schema field
Confidence score 10/10
System Modules — Client-Side Draft Generation Engine
The syntax legend and standard template examples reference the token `{grant_name}`. However, the Prisma `GrantApplication` model defines the grant's name/title field as `title`. There is no `grantName` or `grant_name` database field. Without an explicit translation rule, a standard token-to-attribute mapping utility will fail to populate this value or will output the fallback value.
Suggestion: Explicitly state in the dynamic formatting or parsing engine rules that the token `{grant_name}` must map to the `title` field of the `GrantApplication` database model.
Vague first-time administrative user setup flow
Confidence score 9/10
Deployment & Operations — Seeding Configuration
The document states that if the default administrative account i
```

### myspec-greenfield-v1-tasks — the round asked

```
To stop using your current spreadsheet on day one, what is the absolute bare minimum this tool must do?*
Select one
Let us type in a deadline and get a copy-pasteable email draft(Recommended)
We enter dates manually; the tool shows them in order and writes the email text for us to copy.
Automatically pull deadlines from our emails and write the draft
The tool scans our inbox for dates so we don't have to type anything in manually.
Send the reminder emails directly from the tool with one click
Instead of copying and pasting, the tool connects to our email inbox and sends it for us.
Other — your own answer
Is there a specific date on the calendar we are rushing to meet?*
Select one
No fixed date—we just want to get off our spreadsheets as soon as it is stable(Recommended)
We can take our time to make sure the email drafts look and feel right.
Before the next major grant cycle begins
We need this live in the next 2 to 3 months to handle a heavy wave of applications.
By the end of the current month
We need to show progress to our board or a donor on a very tight timeline.
Other — your own answer
Who is going to actually build this tool for you?*
Select one
A volunteer coder using standard web developer tools(Recommended)
A friend or volunteer who can write code (like Python, JavaScript, or basic web pages).
A non-technical volunteer using 'no-code' tools
We will build it ourselves using tools like Airtable, Zapier, or spreadsheet automation.
A professional software developer or agency
We have a budget to hire someone to build a custom application from scratch.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-tasks — the document

```
## Overview

This implementation document establishes a structured, progressive engineering plan to build the grant application tracker and draft generator. Tailored to a volunteer developer working within a Next.js, TypeScript, Tailwind CSS, and SQLite/Prisma stack, this plan breaks down the construction of the application into clear, self-contained development tasks.

The core purpose of this tool is to eliminate "spreadsheet chaos" for volunteer fundraisers by providing a unified deadline dashboard with visual urgency highlights and an interactive draft generation system. Underpinning every phase of this development plan are two inviolable constraints:
1. **Zero Outbound Email Sending Engine:** Under no circumstances will the platform implement email-sending code paths (e.g., SMTP configurations, mail delivery API clients, or OAuth-based inbox access).
2. **Browser-Native Handoff Only:** All communication delivery must rely exclusively on the browser clipboard or standard `mailto:` client launching.

This document translates the functional requirements, architectural constraints, and target performance metrics into a step-by-step checklist. By mapping core requirement domains to explicit technical targets, identifying edge-case risks, and establishing a safe sequencing order, this roadmap ensures a reliable build path.

---

## Requirement Coverage

The following table maps every functional requirement, security rule, and performance benchmark outlined in `constitution.md` and `requirements.md` directly to specific application files, UI interfaces, and test specs.

| Requirement ID & Name | Implementation Target (File Paths / UI Modules) | Verification / Test Approach |
| :--- | :--- | :--- |
| **REQ-1: Grant Application CRUD & States** | `/prisma/schema.prisma`<br>`/app/api/grants/route.ts`<br>`/app/api/grants/[id]/route.ts`<br>`/components/GrantFormModal.tsx` | Run manual and automated validation to ensure all lifecycle states (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `REPORTING_DUE`) persist correctly. |
| **REQ-2: Dashboard & Visual Badging** | `/components/Dashboard.tsx`<br>`/components/UrgencyBadge.tsx`<br>`/lib/date-utils.ts` | **Unit Test:** Asserts that dates < 14 days display yellow alerts, past dates (excluding `APPROVED`/`REJECTED`) display red alerts. <br>**Playwright:** Verifies styling. |
| **REQ-3: Client-side Search, Filtering, Sort** | `/components/Dashboard.tsx` (Client component state filters) | **Performance Ver
```

### myspec-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The engineering plan is well-structured and progressively designed, providing a solid roadmap for building the Next.js, SQLite, and Prisma application. However, it contains several critical gaps that will block an automated coding agent, most notably the absence of default seed credentials for the administrator account and the lack of explicit database schema field names. Resolving these ambiguities will prevent database naming mismatches and allow E2E Playwright tests to execute successfully without guess-work.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Missing Default Administrator Credentials for Seeding
Confidence score 9/10
Phase 1: Project Setup, SQLite Schema Configuration & Authentication — Task 1.3
Task 1.3 instructs the developer to write a database seed script that creates a default administrator User with secure password hashing, and Phase 7 includes an E2E login redirect test. However, the exact default username/email and password credentials are not specified anywhere in the document. An agent cannot write a deterministic test or seed script without guessing these values.
Suggestion: Explicitly state the default seed credentials in Task 1.3 (e.g., Email: 'admin@example.com', Password: 'Password123!') or specify that they must be read from environment variables with exact fallback values.
Recommendations (4)
Lack of Explicit Schema Field Definitions
Confidence score 8/10
Phase 1: Project Setup, SQLite Schema Configuration & Authentication — Task 1.2
Task 1.2 requests the creation of `GrantApplication`, `EmailTemplate`, and `User` models, but the exact database field names and types are not provided. This leads to downstream ambiguity: for instance, Task 3.2 interpolates `{grant_name}` but Task 4.2 refers to 'title'; Task 3.2 uses `{amount}` but its database type (Int, Float, Decimal) is unspecified; and Task 5.4 introduces `{contact_email}` which was not explicitly part of the model definitions.
Suggestion: Provide a quick definition of the expected fields for each model (e.g., GrantApplication: id, title, funderName, status, amount, deadline, contactName, contactEmail) to prevent naming mismatches across client-side logic, API endpoints, and database tables.
Ambiguous Currency Format and Type
Confidence score 7/10
Phase 3: Core Client-Side Utilities Development — Task 3.2
Task 3.2 requires replacing `{amount}` with a 'properly structured currency formatte
```

### The handoff prompt

```
Build the project specified by the bundle "a-tool-that-tracks-which-of-a-small-charity-s-gr".

The bundle was written with the MySpec · Greenfield · V1 workflow. Download it as a ZIP and unpack it into `.specs/` at the root of the repository. Read every file before writing any code, in this order:

1. constitution.md — approved revision 1
2. requirements.md — approved revision 1
3. solution.md — approved revision 1
4. tasks.md — approved revision 2

How to work from it:

- The bundle is the specification. Implement what it states, and do not invent requirements it does not.
- Identifiers are stable. Refer to FR/NFR/DR/IR numbers and task numbers as written; never renumber them.
- Work through the task list in order, honouring the dependencies each task declares.
- The constitution outranks the other files. Where two of them disagree, follow the constitution and say so.
- Where the bundle is genuinely silent, ask rather than assume — a wrong assumption is more expensive than a question.
- Tests are part of each task, not a phase after it.

When you are done, state which requirement identifiers you implemented and which remain open.
```
