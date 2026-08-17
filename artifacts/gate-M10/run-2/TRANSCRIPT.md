# M10п gate — what the models said

### myspec-greenfield-v1-interview — the round asked

```
Who is the main person opening this tool on a busy morning, and what are they trying to get done?*
Select one
A sole fundraiser or volunteer(Recommended)
One person handles all grant tracking and needs a quick, stress-free way to stay on top of it.
The charity founder or director
A busy leader who wears ten hats and wants to draft reminders in under five minutes between meetings.
A small team sharing the workload
Multiple people coordinate grants and need to see who is reaching out to which funder so they don't double-email.
Other — your own answer
How do you keep track of these deadlines right now, and what is the most frustrating part of that process?*
Select one
We use a spreadsheet, but it's hard to maintain(Recommended)
It gets outdated easily, and writing the follow-up emails from scratch each time takes too long.
We rely on calendar alerts, but details get lost
Alerts pop up, but we still have to dig through old emails to remember what to say next.
We do it ad-hoc from our inboxes
We search our sent folder to see who is due for a nudge, which is stressful and risky.
Other — your own answer
To make this tool feel like an instant lifesaver, what is the single most important thing it should do?*
Select one
Show upcoming deadlines with a ready-to-send draft email next to them(Recommended)
You log in, see what's due, and immediately have a tailored email draft you can send in one click.
Send me a Monday morning digest directly to my inbox
You don't even have to log into a dashboard; the tool emails you the week's tasks and drafts automatically.
Show a clear history of our conversations with each funder
The tool acts as a simple memory bank so we never forget who we promised what, and when.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the round asked

```
What kind of information will you be typing into this tool, and how private does it need to be?*
Select one
Just public grant deadlines and general charity contact emails(Recommended)
This means we don't need heavy security or passwords, making it incredibly fast for any volunteer to jump in and use.
Draft emails that might mention specific community members or sensitive charity stories
This means we will need secure password logins so only authorized volunteers can view the draft emails.
Internal funding targets and private donor relationships
This means we will need bank-grade security to ensure your charity's financial strategies never leak.
Other — your own answer
To keep this tool safe and easy to use, is there anything it should absolutely NEVER do?*
Select all that apply
Never send an email directly to a funder without a human reviewing it first(Recommended)
This means the tool only drafts the email for you to look over, copy, or edit before sending.
Never try to store your entire donor history or replace a database
This keeps the tool focused strictly on deadlines, avoiding the clutter of giant donor management systems.
Never search the web for new grants automatically
This means you are strictly tracking the grants you already know about, keeping the tool simple and reliable.
Other — your own answer
Imagine you've been using this for three months. What does a successful Monday morning look like?*
Select one
You spend 5 minutes reviewing upcoming dates, grab the pre-written drafts, and send them(Recommended)
Success means saving time. The tool is a quick pit-stop that gets you back to your charity work immediately.
Multiple volunteers log in, assign deadlines to each other, and coordinate who writes what
Success means coordination. The tool acts as a simple project board for a small team.
You can look back at a neat timeline of every email you've ever sent to a specific funder
Success means memory. The tool is primarily a reliable archive of your relationship history.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the document

```
## Project Vision

The goal of this project is to build a lightweight, intuitive Grant Application Tracker and Reminder Draft Generator tailored specifically for a lone fundraiser at a small charity. 

Currently, these fundraisers experience severe spreadsheet pain, struggling to keep track of multiple deadlines, submission statuses, and follow-up schedules across various external foundations and grantmakers. This tool replaces disorganized spreadsheets with a centralized, dead-simple dashboard that monitors upcoming deadlines and automatically prepares reminder or follow-up email drafts with a single click.

Success is defined by the "quick review" experience: the fundraiser should spend less than five minutes reviewing, editing, and using the generated drafts to maintain vital relationships with funders, ensuring no deadline or follow-up opportunity slips through the cracks.

## Core Principles

* **Lone Fundraiser Focus**: Keep the user interface clean, uncluttered, and optimized for a single user who does not have time for complex training or configuration.
* **One-Click Drafting**: The primary value driver is minimizing administrative drag. Generating an email draft (whether a follow-up on a submitted application or an inquiry before a deadline) must be a single-click action.
* **Strict Human-in-the-Loop (No Auto-Send)**: To protect the charity's reputation and funder relationships, the system must never automatically send emails. The system's boundary stops at draft generation and presentation for review. The user must copy the draft or launch a local mail handler to send it manually.
* **Immediate Value**: The transition from spreadsheet tracking to this tool must be seamless, requiring minimal initial setup.

## Technology Constraints

* **Frontend**: Single Page Application (SPA) built with React and Tailwind CSS, focused on responsive, fast-loading, and highly readable interfaces.
* **Backend**: Node.js with Express, configured with TypeScript for type-safety and robust data handling.
* **Database**: SQLite for lightweight, file-based persistence, allowing easy backup and making it simple to deploy on low-cost hosting services (e.g., Render, Fly.io) or run locally.
* **Large Language Model (LLM)**: Integration with a standard, cost-effective LLM API (such as OpenAI's GPT-4o-mini or Claude 3.5 Haiku) for drafting high-quality, contextual emails.
* **Deployment**: Packaged to run easily inside a single Docker container or deployable as a monolith t
```

### myspec-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The specification outlines a well-defined, highly-focused tool tailored for lone fundraisers, with clear architecture constraints. However, it requires revisions regarding authentication mechanics, user database requirements, and securing the proposed calendar subscription feed, as these details are currently ambiguous and would leave the coding agent guessing during implementation.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Missing User Model or Single-Password Definition
Confidence score 9/10
Security Constraints — Authentication
The specification requires basic password protection on the dashboard and defines a 'login' flow for E2E testing, but the core entity schema only contains Funder, Grant Application, and Draft Log entities. It is unclear whether the system needs a dynamic database-backed User table or a single environment-configured password, leaving the implementation of authentication ambiguous.
Suggestion: Explicitly state that authentication relies on a single password configured via an environment variable (e.g., DASHBOARD_PASSWORD), and that no dynamic User database table or registration flow is required.
Missing Security and Access Protocol for Calendar Subscription Feed
Confidence score 9/10
Integration Points — Calendar Export (iCal/.ics)
The specification allows users to 'subscribe to' an iCal feed of deadlines. However, external calendar applications (like Google Calendar or Outlook) cannot authenticate through a normal interactive login screen or session cookies. If the endpoint is protected by the default dashboard auth, subscription will fail; if it is completely public, it compromises data sensitivity rules.
Suggestion: Define that the calendar feed endpoint is public but secured via a unique, long, unguessable query parameter token (e.g., /api/calendar.ics?token=xyz) that is generated once or stored in config.
Recommendations (1)
Ambiguous 'Used' Status Definition in Draft Log
Confidence score 8/10
Architecture Constraints — Simple Entity Model
The Draft Log entity tracks whether drafts were 'copied or used'. Because the application uses 'mailto:' URIs to launch local mail clients, the web application cannot programmatically detect if an email was actually sent or if the user canceled the action.
Suggestion: Specify that the 'used' status should be recorded when the user clicks the button to open the mail client, mapping 'used' directly
```

### myspec-greenfield-v1-requirements — the round asked

```
When you open this tool, what does a complete 'task' look like for you from start to finish?*
Select one
Type in a deadline, view the auto-generated email, and copy it to my clipboard(Recommended)
You quickly type the grant name and date, the tool instantly shows a draft, and you copy-paste it into your own email app.
Upload our existing Excel sheet and see a list of ready-to-send draft emails
You import your current list of grants all at once, and the tool builds a dashboard showing drafts for every upcoming deadline.
Type in the deadline and click a 'Send' button directly inside the tool
The tool connects to your email account (like Gmail or Outlook) and sends the reminder directly from the webpage.
Other — your own answer
How much should happen quietly in the background without you prompting it?*
Select one
Nothing—it only updates when I open the page and look at it(Recommended)
The tool is completely quiet until you log in to check deadlines and grab your email drafts.
Send me a weekly morning email summary of what is due
The tool automatically emails you every Monday morning with a list of deadlines coming up that week.
Automatically send the reminder emails to funders on the due date
The system sends out pre-written emails on its own schedule without requiring you to click anything.
Other — your own answer
Will different volunteers or staff members need to see different things, or is everyone sharing the same view?*
Select one
One shared workspace where everyone sees and edits the same list(Recommended)
There are no individual accounts or restricted views; anyone who logs in can see, add, or edit any grant.
Personalized views where volunteers only see grants assigned to them
You can assign specific grant deadlines to specific volunteers, so their dashboard only shows their own work.
Some people can edit grants, while others (like board members) can only view them
You have 'editor' accounts for those managing deadlines, and 'viewer' accounts for people who just need to check progress.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-requirements — the document

```
## Overview

This specification details the requirements for a lightweight, intuitive **Grant Application Tracker and Reminder Draft Generator** designed specifically for a lone fundraiser at a small charity. 

Currently, these fundraisers experience severe administrative drag and "spreadsheet pain" attempting to track multiple foundation deadlines, submission states, and necessary follow-ups across decentralized, fragile files. This tool replaces disorganized spreadsheets with a centralized, dead-simple, single-view dashboard that monitors approaching deadlines and automatically prepares reminder or follow-up email drafts with a single click.

Success is defined by a "quick review" user experience: the fundraiser should spend less than five minutes reviewing, editing, and executing the generated drafts to maintain vital relationships with funders, ensuring no deadline or follow-up opportunity slips through the cracks.

### Core Principles

* **Lone Fundraiser Focus**: Keep the user interface clean, uncluttered, and optimized for a single user who does not have time for complex training, profile configurations, or system setup.
* **One-Click Drafting**: The primary value driver is minimizing administrative drag. Generating an email draft (whether a follow-up on a submitted application, a pre-deadline query, or a milestone reminder) must be a single-click action.
* **Strict Human-in-the-Loop (No Auto-Send)**: To protect the charity's reputation and funder relationships, the system must never automatically send emails. The system's boundary stops at draft generation and presentation for review. The user must manually copy the draft or launch their local mail handler.
* **Immediate Value**: The transition from spreadsheet tracking to this tool must be seamless, requiring minimal initial setup.
* **Public-Only Data Sensitivity**: To maintain a minimal security footprint and comply with the `public_only` data sensitivity rule, the application must not store highly sensitive information. It should only store publicly available funder information, general program descriptions, standard work emails, and deadline tracking dates. No donor credit card details, charity bank accounts, or sensitive tax-ID credentials should be stored.

### Tech Stack and Deployment

* **Frontend**: Single Page Application (SPA) built with React and Tailwind CSS.
* **Backend**: Node.js with Express and TypeScript.
* **Database**: SQLite for lightweight, file-based persistence, allowing e
```

### myspec-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The specification provides a clear and highly focused architectural blueprint for building a lightweight Grant Application Tracker tailored for a single fundraiser. It successfully outlines user flows, the core SQLite schema, and integration requirements, particularly the strict human-in-the-loop email drafting loop. However, critical ambiguities regarding the database deletion strategy for Funders, the lack of a fallback for null requested amounts in the iCal export, and missing API routes for updating the draft log usage states represent significant development gaps that would leave a coding agent guessing.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Contradictory Deletion Strategy and Incomplete Schema for Soft-Deletes
Confidence score 9/10
Funder and Grant Application Management — FR-2.1: Funder CRUD Operations
FR-2.1 states that the user must be able to 'delete (soft-delete or hard-delete) Funder entities,' leaving the exact strategy unresolved. Meanwhile, the SQLite schema defines a foreign key with 'ON DELETE CASCADE' on 'grant_applications.funder_id'. If soft-delete is intended, the tables lack a 'deleted_at' or 'is_deleted' column and cascading deletes wouldn't naturally apply. If hard-delete is intended, the system will permanently wipe out related grant applications and draft logs without confirming this behavior to the user.
Suggestion: Expressly declare a single deletion strategy. If hard-delete is chosen, remove references to soft-delete. If soft-delete is required, add a 'deleted_at' (DATETIME, NULLABLE) column to both the 'funders' and 'grant_applications' schemas and specify how query scopes should filter out deleted records.
Missing Event Summary Fallback for Null Requested Amounts
Confidence score 10/10
Integration Requirements — 3. Calendar Export (iCal / .ics Feed)
The specification dictates that the calendar event summary must strictly follow the format: '[Grant Deadline] {Funder Name} - {Requested Amount}'. However, in the 'grant_applications' schema, the 'requested_amount' field is marked as NULLABLE. The specification fails to define how the system should construct the event summary string when there is no requested amount recorded, which could lead to trailing hyphens or null string interpolations (e.g., '[Grant Deadline] Gates Foundation - null' or '[Grant Deadline] Gates Foundation - ').
Suggestion: Provide a fallback template for when
```

### myspec-greenfield-v1-solution — the round asked

```
When you are checking these deadlines or working on these emails, what device are you usually using, and do you need it to work without internet?*
Select one
Mainly a computer (laptop or desktop) with reliable Wi-Fi(Recommended)
We will build a clean web app designed for comfortable typing and reading on a computer screen.
Both phones and computers, even with patchy internet on the go
We will make sure it works beautifully on small screens and saves your work if you temporarily lose signal.
Other — your own answer
How should this new tool connect with the email and calendar accounts you already use?*
Select all that apply
Keep it simple: let us copy-paste the text into our usual email app(Recommended)
No tricky setup or permissions needed; we generate the text and you paste it into Gmail, Outlook, or Mail.
Connect directly to Gmail or Outlook to save drafts automatically
The tool will log into your email account to place the pre-written drafts directly in your Drafts folder.
Put the deadlines onto our existing Google or Outlook calendars
Deadlines entered here will automatically show up on your charity's shared calendar.
Other — your own answer
How many people at your charity will actually log in to use this?*
Select one
Just one person (like a sole fundraiser or director)(Recommended)
No need for complex user accounts or passwords to share; it's tailored for a single coordinator.
A small handful of regular volunteers (2 to 5 people)
Everyone will have their own login so you can see who last updated a deadline or sent an email.
A constantly changing group of volunteers
We will make it incredibly easy to invite new volunteers and revoke access when they move on.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-solution — the document

```
## Overview

This document specifies the technical design, system architecture, data model, and API contracts for the **Grant Application Tracker and Reminder Draft Generator**. This lightweight, single-user tool is engineered specifically for a lone fundraiser at a small charity to alleviate the administrative drag of managing complex grant application pipelines across decentralized spreadsheets.

### Problem Statement & Audience
Lone fundraisers operate under extreme time scarcity. They often track dozens of foundational grant deadlines and post-submission relationship touchpoints in fragile spreadsheets, leading to missed application milestones or forgotten follow-ups. 

### Core Value Proposition
The tool provides a dead-simple, highly focused, centralized dashboard that:
* Monitors upcoming grant deadlines.
* Determines the operational context (pre-proposal research, drafting, or submitted follow-up).
* Automatically drafts high-quality, personalized outreach emails with a **single click** using a stateless Large Language Model (LLM) pipeline.
* Eliminates dynamic overhead by utilizing local SQLite storage, simple static password protection, and a manual workflow handover.

### System Boundaries & Rules
* **No Auto-Send (Strict Human-in-the-Loop)**: The application is strictly prohibited from directly dispatching emails. It operates up to the point of generation and hands off the structured text to the user via "Copy to Clipboard" or standard `mailto:` client redirection.
* **Public-Only Data Sensitivity**: To minimize operational liability and avoid complex security architecture compliance, the system stores only publicly referenceable information, general non-confidential project descriptions, and deadline calendars. Bank accounts, donor credit cards, and sensitive tax credentials must never enter the platform.
* **Single Shared View**: The application uses a streamlined single-account approach. User access relies on a single shared view authenticated via a static runtime password rather than a multi-tenant user table.

---

## High-Level Architecture Design

The application follows a clean, single-container monolithic architecture. By packaging the Single Page Application (SPA) and Node.js backend together, hosting costs are minimized, local deployment is made trivial, and network latency between the API layer and the local SQLite file is virtually non-existent.

### System Components Topology

```
+-------------------------------------------------
```

### myspec-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The technical specification outlines a well-conceived, lightweight architecture tailored for a single-user fundraising tool, utilizing local SQLite storage and a simplified static password flow. However, the document is currently unsuitable for immediate code generation because of a critical HTTP status code typo, undefined status-to-prompt file mappings, ambiguous state transition rules, and minor data schema mismatches. Resolving these issues will prevent development bottlenecks and test failures.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Invalid HTTP Status Code 21 Created
Confidence score 10/10
API / Protocol Design — 2. Funder Operations
The response status for 'POST /api/funders' is specified as '21 Created' instead of '201 Created'. Since 21 is not a valid HTTP status code, it will cause crashes or failures in standard backend web frameworks and automated client test suites.
Suggestion: Update the success response status for 'POST /api/funders' to '201 Created' to align with standard HTTP protocol practices.
Missing Mapping Between Application Statuses and Prompt Files
Confidence score 9/10
System Modules — 3. Stateless Prompt & LLM Execution Engine
The document lists five application statuses (Researching, Drafting, Submitted, Pending Funder, Closed) but only provides two example prompt files ('pre_proposal_prompt.txt' and 'submitted_followup_prompt.txt'). The specification does not define which status maps to which prompt file, nor does it specify if certain statuses (like 'Closed') should block draft generation entirely.
Suggestion: Define an explicit mapping table connecting each of the status values to its exact prompt filename inside '/src/prompts/', and explicitly specify which statuses do not support draft generation.
Vague Status Transition Validation Rules
Confidence score 9/10
System Modules — 2. Pipeline Manager Module
The specification states that transitions between status types are 'validated sequentially to maintain clean telemetry'. However, it does not provide a state transition matrix. It is unclear if users can skip steps (e.g., transitioning from 'Researching' directly to 'Closed' if a lead goes cold) or if the system must strictly enforce one-step-at-a-time increments. Leaving this undefined will cause the coding agent to guess, potentially implementing breaking validation logic.
Suggestion: Provide a clear list or diagram of allowed ne
```

### myspec-greenfield-v1-tasks — the round asked

```
When you first open this tool on a busy Monday morning, what are the absolute bare minimum things it must do to be useful to you?*
Select all that apply
Show a clear list of upcoming grant deadlines(Recommended)
You can see what is due next at a single glance without digging through folders.
Provide a 'Copy Draft' button for emails
Clicking a button copies a ready-to-send reminder email to your clipboard so you can paste it into Gmail or Outlook.
Let me type in new deadlines and edit existing ones
You can manage the list of dates directly in the tool rather than editing a background file or spreadsheet.
Send the emails automatically through my email account
The tool connects directly to your Gmail/Outlook and sends the email without you having to review or paste it.
Other — your own answer
Who is going to actually build or set up this tool for you?*
Select one
A non-technical volunteer using 'no-code' tools
They will set this up using friendly, visual tools like Airtable, Zapier, or Notion.
A volunteer or student who knows basic web building(Recommended)
They can write simple code (like HTML, CSS, or basic JavaScript) but aren't professional software engineers.
A professional software developer donating their spare time
They are highly experienced and comfortable building custom databases and secure web applications.
We don't have anyone lined up to build this yet
We need the absolute simplest setup possible so that almost anyone can maintain it.
Other — your own answer
Do you have a specific target date or an upcoming grant deadline when this tool absolutely has to be ready?*
Select one
Yes, we have a major grant deadline coming up in the next few weeks
We need a quick, simple version ready to go before this specific deadline hits.
No, we are flexible and just want to get it right(Recommended)
We can keep using our current methods for a while longer while we build this properly.
We need this immediately because our current tracking is broken
We are missing deadlines right now and need an emergency solution within days.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-tasks — the document

```
## Overview

This tasks document outlines the complete step-by-step development plan to build the **Grant Application Tracker and Reminder Draft Generator** from start to finish. This plan is designed for an autonomous coding agent or developer to build, verify, and pack the application into a single, cohesive monolith.

The application contains:
*   A **Node.js/Express/TypeScript backend** operating a local SQLite database (`data.db`).
*   An **isolated LLM client service** capable of loading structured prompt templates from files and using standard APIs (OpenAI or Anthropic) to produce contextual follow-up emails.
*   A **React Single Page Application (SPA)** with Tailwind CSS that acts as the lone fundraiser's unified dashboard.
*   A **static password authentication mechanism** protecting both frontend resources and backend endpoints using HTTP-Only cookies.
*   A **secure iCal/ICS feed** to expose grant deadlines to external calendar readers.

### Development Roadmap Strategy
The build tasks are divided into highly focused milestones to minimize integration risk. We start by configuring data layers and local tests, move to backend API routes, verify the prompt parsing engine, implement the frontend UI with strict visual feedback, construct the integration interfaces (mailto, copy to clipboard, .ics), and finish with end-to-end integration test coverage.

---

## Requirement Coverage

The following matrix maps the functional and non-functional requirements to the specific design layers and implementation actions described in the execution tasks.

| Requirement ID | Requirement Summary | Implementation Task / Module |
| :--- | :--- | :--- |
| **FR-1.1** | Static password auth screen | Backend login routes (`POST /api/auth/login`), JWT HTTP-Only cookie middleware, Frontend Login screen. |
| **FR-1.2** | Centralized tracking dashboard | Frontend React SPA with sorting tables, status filtering tab-bars, and 14/30 day deadline warnings (Red/Amber highlighting). |
| **FR-2.1** | Funder CRUD Operations | Funder REST endpoints (`GET`, `POST`, `PUT`, `DELETE` on `/api/funders`), SQLite schemas, and validation logic. |
| **FR-2.2** | Grant Application CRUD | Application REST endpoints (`GET`, `POST`, `PUT` on `/api/applications`), status validation schema enforcing transition states. |
| **FR-3.1** | Contextual Draft Button | Dashboard action trigger with visual skeleton loaders / active spinner tracking loading state (< 100ms response). |
| **FR-3.2** | Automat
```

### myspec-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The tasks document provides a highly detailed, logical, and technically sound blueprint for building the tracking application. However, it contains a critical integration gap: it instructs the frontend to call a telemetry endpoint (`PATCH /api/drafts/:id/use`) that is never defined or provisioned in the backend routing tasks. Resolving this discrepancy is necessary to prevent the coding agent from making conflicting assumptions about route signatures and database entity relations.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Missing Definition for Telemetry Patch Route
Confidence score 10/10
Phase 5: Handoff Utilities & iCal Subscription Feed — Task 5.1: Clipboard Telemetry Integration
Tasks 5.1 and 5.2 require the client to issue a `PATCH /api/drafts/:id/use` request to update `copied_or_used = 1` in the SQLite `draft_logs` table. However, this endpoint is never defined in Phase 2 (CRUD API Layer) or Phase 3. It is also unclear whether `:id` corresponds to the primary key of the `draft_logs` table, and whether `POST /api/applications/:id/draft` returns this draft log identifier to the frontend in its response payload.
Suggestion: Explicitly define the `PATCH /api/drafts/:id/use` route under Phase 2 or Phase 3. Clarify that the dynamic parameter `:id` refers to the unique primary key of the `draft_logs` table, and specify that the generation endpoint (`POST /api/applications/:id/draft`) must include this `id` as part of its JSON response payload.
Recommendations (1)
Incomplete CRUD Implementation for Grant Applications
Confidence score 8/10
Phase 2: Session Security & CRUD API Layer — Task 2.4: Grant Applications CRUD API Construction
Requirement FR-2.2 mandates 'Grant Application CRUD Operations', yet Task 2.4 and the requirement matrix specify only GET, POST, and PUT methods. No delete operation is defined for grant applications, unlike funders (which have explicit DELETE API instructions).
Suggestion: Clarify if deletion of applications is supported. If so, add `DELETE /api/applications/:id` to Task 2.4. If deletion is restricted to encourage transitioning states to 'Closed' instead, explicitly document this business rule to avoid developer confusion.
Accept feedback
Request changes
Ignore
```

### The handoff prompt

```
Build the project specified by the bundle "a-tool-that-tracks-which-of-a-small-charity-s-gr".

The bundle was written with the MySpec · Greenfield · V1 workflow. Download it as a ZIP and unpack it into `.specs/` at the root of the repository. Read every file before writing any code, in this order:

1. constitution.md — approved revision 2
2. requirements.md — approved revision 1
3. solution.md — approved revision 1
4. tasks.md — approved revision 1

How to work from it:

- The bundle is the specification. Implement what it states, and do not invent requirements it does not.
- Identifiers are stable. Refer to FR/NFR/DR/IR numbers and task numbers as written; never renumber them.
- Work through the task list in order, honouring the dependencies each task declares.
- The constitution outranks the other files. Where two of them disagree, follow the constitution and say so.
- Where the bundle is genuinely silent, ask rather than assume — a wrong assumption is more expensive than a question.
- Tests are part of each task, not a phase after it.

When you are done, state which requirement identifiers you implemented and which remain open.
```
