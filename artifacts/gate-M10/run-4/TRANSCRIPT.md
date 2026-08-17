# M10п gate — what the models said

### myspec-greenfield-v1-interview — the round asked

```
When Monday morning comes around, who is actually opening this tool to check on grants, and what are they trying to tick off their to-do list?*
Select one
A single founder or volunteer
One busy person who handles all fundraising alongside ten other jobs and needs to move fast.
A small team of 2-3 people
A few volunteers or part-time staff who need to coordinate so they don't double-email the same donor.
A director or board member
Someone who wants a quick bird's-eye view of what money is coming in, rather than daily writing tasks.
Other — your own answer
How are you keeping track of these deadlines right now, and what is the most annoying part of that process?*
Select one
A shared spreadsheet
We use Excel or Google Sheets, but we forget to check it, and finding old emails to copy-paste takes forever.
Calendar alerts
We get calendar reminders, but writing the actual reminder emails from scratch still takes hours.
In someone's head
One person knows the dates, but if they are busy or away, deadlines get missed entirely.
Other — your own answer
Imagine you've been using this tool for a month. What is the one thing it does that makes you say, 'Thank goodness we bought this'?*
Select one
One-click draft emails
I log in, see what is due, and click one button to open a pre-written draft that I can quickly edit and send.
A weekly email digest
The tool emails me a summary of upcoming deadlines every Monday morning with the draft text already inside.
Fully automated reminders
The tool sends the reminders directly to the grantors on the due date without me needing to approve them.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the round asked

```
To keep this safe and simple for you, what is the number one thing this tool should absolutely never do without your direct permission?*
Select one
Send an email directly to a funder(Recommended)
The tool will only ever create drafts; you will always review and hit 'send' yourself in your own email app.
Pull data from your spreadsheet automatically
It won't touch your existing files; you will type or paste the grant info in yourself to keep full control.
Look for new grant opportunities online
It will strictly track what you tell it to track, and never try to suggest or search for new grants.
Other — your own answer
What kind of details will you be typing into this tool, and how sensitive is this information?*
Select all that apply
Just basic details you could find on Google(Recommended)
Funder names, deadline dates, public website links, and general notes about what they fund.
Our private grant proposals and draft answers
Unpublished text, project ideas, and internal notes that we wouldn't want anyone outside the charity to see.
Direct contact details for real people
Personal email addresses and phone numbers of specific program officers at the foundations.
Other — your own answer
Imagine it's three months from now. You open this tool on a Monday morning. What does a 'perfect run' look like?*
Select one
You spend less than 5 minutes total reviewing and drafting emails(Recommended)
You see who is due, click a button to open your pre-written email drafts, and get back to your day immediately.
You haven't missed a single application deadline in three months
The tool's main value is that nothing slips through the cracks, even if it takes a bit more time to manage.
You can see exactly how much potential funding is on the horizon
The tool gives you a clear visual sense of which grants are pending, won, or lost so you can plan your budget.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the document

```
## Project Vision

The goal of this tool is to rescue sole fundraisers at small charities from "spreadsheet hell" by providing a lightweight, focused dashboard that monitors grant application deadlines and requirements. 

Instead of getting lost in complex, multi-tab spreadsheets or overwhelmed by heavy, enterprise-level grant management software, the user gets a focused daily companion designed for a quick, **five-minute routine**. The core success moment of the application is the **one-click draft** generator, which synthesizes basic public info and grant requirements into actionable, personalized reminder and follow-up emails. The fundraiser can copy these drafts, quickly adjust them, and send them through their standard email client.

---

## Core Principles

* **Strictly Informational (Never Send Automatically):** The tool must never send emails automatically to grantors or third parties. It is a drafting and tracking assistant only. The human-in-the-loop principle is absolute; the sole fundraiser has final review and physical control over sending every message.
* **Five-Minute Daily Value:** The interface must be optimized so that a user can understand their immediate obligations, generate necessary drafts, and exit the system in under five minutes.
* **Frictionless Onboarding:** Transitioning away from "spreadsheet hell" must be trivial. Importing basic tracker data should be simple, and the system must require minimal configuration to start delivering value.
* **Radical Simplicity:** Avoid feature creep. This is not a complex CRM, a public prospecting engine, or a full-scale accounting ledger. It is a highly specialized pipeline tracker and AI-assisted drafting tool.

---

## Technology Constraints

* **Frontend:** Built using modern web technologies (e.g., React, TypeScript, and Tailwind CSS) to ensure a highly responsive, clean, and accessible user interface.
* **Backend:** Built using a reliable, lightweight framework (e.g., Node.js with Express or Python with FastAPI) that can easily integrate with external Large Language Model (LLM) APIs.
* **Database:** A relational database (e.g., PostgreSQL or SQLite) to manage grant details, deadlines, milestone stages, and saved drafts.
* **AI/LLM Engine:** Integration with a reliable LLM API (such as OpenAI's GPT-4o-mini or Anthropic's Claude 3.5 Haiku) for generating contextual, highly personalized email drafts.
* **Deployment:** Containerized via Docker to facilitate seamless, repeatable deployments on
```

### myspec-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The constitution document defines a clear, focused vision for a lightweight grant tracking dashboard. However, it contains a critical technical contradiction regarding the backend language choice, specifying Python/FastAPI in one section while strictly mandating TypeScript for both frontend and backend in another. Additionally, key integration details such as the CSV import schema and the draft generation architecture are left ambiguous, which will force the coding agent to make arbitrary architectural assumptions.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (1)
Contradiction in Backend Language Selection
Confidence score 10/10
Technology Constraints — Backend
The Technology Constraints section states that the backend can be built using either 'Node.js with Express or Python with FastAPI'. However, the Coding Standards section explicitly mandates 'TypeScript for both frontend and backend to guarantee strict type safety'. Since Python cannot run TypeScript, this is a direct conflict that will confuse the coding agent.
Suggestion: Resolve the conflict by specifying a single backend technology stack, such as 'Node.js with Express and TypeScript', and removing the reference to Python and FastAPI.
Recommendations (2)
Missing CSV Schema Specification
Confidence score 9/10
Integration Points — Standard CSV Import/Export
The document specifies that the tool must allow users to import historical data from standard CSV files to resolve 'spreadsheet hell'. However, it does not define the expected column headers, data formats (especially for deadlines), or error handling behavior for malformed files. The agent will have to invent a schema, which may not align with typical user spreadsheets.
Suggestion: Provide a basic expected CSV schema (e.g., required headers like 'Grant Name', 'Deadline Date', 'Status', 'Requested Amount') and define the system behavior when parsing invalid rows or missing headers.
Ambiguous Draft Generation Architecture
Confidence score 8/10
Architecture Constraints — Synchronous and Asynchronous Draft Queue
The architecture constraints specify that the system 'must support either server-sent events (SSE) for streaming text generation or a highly responsive loading state.' This 'either/or' requirement is too open-ended and will leave the agent guessing whether to build a complex streaming infrastructure or a simpler polling/loading mechanism.
Suggestion: Exp
```

### myspec-greenfield-v1-requirements — the round asked

```
How would you prefer to get your grant deadlines into this tool?*
Select one
Link your existing Google Sheet(Recommended)
The tool reads directly from your current spreadsheet, so you don't have to re-type anything.
Type them into a quick web form
You type the funder name and due date into a clean, simple form whenever you apply.
Forward confirmation emails
You forward the funder's email to a special address, and the tool extracts the deadline automatically.
Other — your own answer
Who needs to log in and use this tool besides you?*
Select one
Just me(Recommended)
One simple password-free login link sent to your email to keep things secure and incredibly fast.
Multiple volunteers
Anyone on the team can log in, see the same board, and draft or edit emails.
Me to draft, a board member to approve
You click to draft the email, and it automatically gets sent to a reviewer for a green light before going to the funder.
Other — your own answer
How should the tool alert you that a deadline is coming up?*
Select one
A weekly Monday morning email(Recommended)
You get one email every Monday listing what's due, with 'Draft Follow-up' buttons directly inside the email.
No emails—just show them when I open the site
The site has a clear 'Urgent' list you look at whenever you decide to log in.
Individual email alerts as deadlines approach
Get a separate email notification exactly 7 days, 3 days, and 1 day before each specific deadline.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-requirements — the document

```
## Overview

The purpose of this document is to specify the requirements for a lightweight grant application tracking and draft generation tool designed specifically for sole fundraisers at small charities. 

The application serves as a daily companion that rescues users from "spreadsheet hell" by consolidating deadlines, status metrics, and follow-up activities into a clean, intuitive dashboard. Instead of spending hours managing complex multi-tab trackers or learning bloated CRM platforms, the fundraiser uses this system to maintain an efficient **five-minute daily routine**.

A core element of the product's success is the **one-click draft** generator. By leveraging Large Language Model (LLM) APIs, the system transforms basic grant records and public details into highly personalized, polite, and contextual reminder and follow-up emails. 

### Core Product Tenets
* **Strictly Informational (Never Send Automatically):** The application contains **no outbound email infrastructure** (such as SMTP, SendGrid, or SES integrations) for contacting grantors. It acts solely as a tracking and drafting engine. The user remains the absolute human-in-the-loop, physically copying or deep-linking drafts into their own local email client to review and hit "Send."
* **Frictionless Onboarding:** Transitioning from spreadsheets is immediate. A straightforward CSV upload imports existing pipeline data within seconds.
* **Radical Simplicity:** The platform focuses purely on monitoring deadlines and drafting communications, intentionally omitting accounting ledgers, advanced multi-tenant permissions, or complex donor CRM pipelines.

---

## User Roles

The system is engineered specifically for a single-user archetype. It does not support tiered collaborative permissions, public access, or organizational hierarchies.

### Sole Fundraiser (Single-User Account)
* **Description:** The primary operator of the charity's development and grant-seeking activities.
* **Key Goals:**
  * Quickly identify which grant proposals, letters of intent (LOIs), or reporting milestones are due this week.
  * Avoid missed deadlines without spending hours maintaining tracking sheets.
  * Generate professional, context-aware follow-ups or query emails in under a minute.
* **Access Level:** Absolute administrative control over the application instance, including database records, configuration settings (e.g., charity mission description), and CSV import features.

---

## Functional Requirements

The a
```

### myspec-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The specification is exceptionally well-structured and clearly details the functional goals, database schema, and integrations of the lightweight grant tracker. However, it requires revision due to a critical gap in the single-user authentication bootstrapping flow and a casing mismatch in the status Enum between the functional requirements and the database schema. Addressing these logical gaps alongside minor ambiguities in the fallback template and Weekly Digest definitions will prevent development-time errors and ensure a highly coherent implementation by the coding agent.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Missing Provisioning or Registration Flow for Single-User Account
Confidence score 9/10
Functional Requirements — 1. Authentication & Session Management
The system specifies a single-user system requiring a username/email and password to log in (FR-1.1), but does not define how this single user is initially provisioned or registered. Without an explicit flow, the coding agent may either implement an open registration system (violating the single-user security tenet) or omit registration entirely, leaving the system inaccessible upon first deployment.
Suggestion: Specify an initial user creation mechanism, such as a one-time registration screen at `/register` that becomes permanently disabled once a user record exists in the database, or an administrative CLI/seeding script that provisions credentials from environment variables.
Casing Conflict for Grant Status Enum
Confidence score 9/10
Data Requirements — 1. Database Schema
There is a casing mismatch between the frontend status stages defined in FR-2.2 ('Researching', 'Drafting', 'Submitted', 'Awarded', 'Declined') and the database schema's ENUM definition which is written in lowercase ('researching', 'drafting', 'submitted', 'awarded', 'declined'). If the application attempts to insert the capitalized frontend strings directly into the database ENUM, it will trigger validation or syntax errors.
Suggestion: Align the casing across both sections. Either update FR-2.2 to specify lowercase values or explicitly state that the backend database adapter must normalize all incoming status strings to lowercase before persistence and capitalize them on retrieval.
Recommendations (3)
Lack of Specification for Static Fallback Email Template
Confidence score 8/10
Integration Requirements — 1. LLM Provider Inte
```

### myspec-greenfield-v1-solution — the round asked

```
When you are racing through these grant reminders on Monday morning, what device are you most likely using?*
Select one
Sitting at a computer or laptop
We will build a web app optimized for a keyboard and mouse, making it easy to type and manage drafts on a big screen.
On my phone, on the go
We will design a mobile-first screen with big tap targets, perfect for quick actions while you are away from a desk.
Swapping between phone and computer
We will build a responsive web app that adapts beautifully to both screens, letting you check deadlines anywhere.
Other — your own answer
How should the tool handle sending the emails and tracking the dates with the tools you already use?*
Select all that apply
Open a draft directly in my Gmail or Outlook
Clicking 'remind' will open your actual email app on your computer/phone with the text and recipient already filled in.
Just copy the text to my clipboard
The tool will generate the text and give you a copy button so you can paste it manually into whatever email program you want.
Sync deadlines to my Google or Outlook calendar
Grant due dates will automatically appear as events on your personal or work calendar so you don't miss them.
Other — your own answer
Who else needs to use this tool, and do we need to worry about multiple people changing things at the same time?*
Select one
Just me
A simple login for one person, keeping the tool fast, secure, and uncomplicated.
Me and one or two other volunteers
We will add basic account sharing so a couple of people can log in and update the grant status without stepping on each other's toes.
Just me editing, but others need to view the status
You alone will manage the data, but we will create a simple 'read-only' dashboard or shareable link for your board of directors.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-solution — the document

```
## Overview

This document specifies the complete technical design and architectural blueprint for the Grant Tracking and Draft Generation Tool. Designed specifically for the sole fundraiser at small charities, this desktop-focused application rescues users from "spreadsheet hell" by providing a centralized dashboard that highlights impending deadlines and dynamically drafts personalized email communications.

### Core Product Philosophy
* **The "Five-Minute" Routine:** The system is built for extreme informational efficiency. A single fundraiser can log in, view a summary of critical tasks for the upcoming week, trigger necessary draft communications, export them to their local client, and log off within five minutes.
* **100% Human-in-the-Loop (Zero Auto-Send):** The application strictly functions as a tracking and drafting companion. Under no circumstances will the system configure, host, or execute programmatic outgoing SMTP mail transfers to external grantors. Outbound communication relies entirely on the user's manual validation using local clipboard copying or browser-initiated protocol hand-offs (`mailto:`).
* **Frictionless Migration:** Small charity fundraisers rarely have time for complex database setups. The application features a robust CSV column-mapping utility that immediately transforms static, fragmented Excel or Google Sheets trackers into a clean, relational pipeline.

---

## High-Level Architecture Design

The application follows a clean, decoupled client-server architecture. To ensure high responsiveness and maintainable separation of concerns, the system is designed as a single-page application (SPA) communicating with a stateless REST API.

### System Diagram

```
+---------------------------------------------------------------------------------+
|                                 DESKTOP BROWSER                                 |
|                                                                                 |
|  +--------------------------- React Frontend SPA ----------------------------+  |
|  |                                                                           |  |
|  |  +------------------+  +--------------------+  +-----------------------+  |  |
|  |  | Dashboard View   |  | CSV Upload/Mapper  |  | Draft Workbench View  |  |  |
|  |  +------------------+  +--------------------+  +-----------------------+  |  |
|  |                                                                           |  |
|  |  [State: JWT Session 
```

### myspec-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The specification provides a strong architectural and data design for the Grant Tracking and Draft Generation Tool, outlining clear boundaries, a secure zero-SMTP policy, and concrete relational schemas. However, it requires revisions before a coding agent can build it successfully. The major blockers include a missing user registration endpoint, the lack of an API route to fetch previously generated drafts from the database, and ambiguity over which grant statuses constitute 'active' applications versus completed ones on the urgency-based dashboard. Addressing these gaps, along with refining date parsing specifications, prompt design guidelines, and full CRUD endpoints, will ensure a robust and predictable implementation.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Missing User Registration Endpoint
Confidence score 10/10
API / Protocol Design — Authentication Endpoints
The document specifies a login endpoint (`POST /api/auth/login`) but does not define an endpoint for user registration. Since the database schema mandates a 'users' table and all grant applications require a 'user_id', there is no specified mechanism for a new fundraiser to create an account, leaving the agent to guess the signup flow and requirements.
Suggestion: Add a `POST /api/auth/register` endpoint specification that accepts username, password, charity_name, and charity_mission, creates a database record with a hashed password, and returns a session token.
No Endpoint to Retrieve Stored Drafts
Confidence score 9/10
API / Protocol Design — Draft Email Generation Engine
The specification includes a 'generated_drafts' table to store generated email drafts, but it does not specify any API endpoint to retrieve them (either nested in the grants GET endpoint or via a dedicated GET endpoint like `/api/grants/:id/drafts`). Without a retrieval endpoint, stored drafts cannot be loaded into the frontend's Draft Workbench View.
Suggestion: Define a `GET /api/grants/:id/drafts` endpoint that returns a list of previously generated drafts for that specific grant application, or specify that `GET /api/grants/:id` or `GET /api/grants` optionally includes the associated drafts.
Ambiguous Definition of Active Grants and Urgency Tiers
Confidence score 9/10
System Modules — 1. Frontend SPA (React, TypeScript, Tailwind CSS)
The specification states that the dashboard lists 'active' grant applications sorted by urgenc
```

### myspec-greenfield-v1-tasks — the round asked

```
To make your Monday mornings easier right away, what is the absolute bare minimum this tool must do in its very first version?*
Select one
Show deadlines and open a draft in your own email (like Gmail)
You click a button next to a deadline, and it opens your usual email app with a pre-written draft ready for you to review and hit send.
Automatically send the emails on schedule
The system sends the reminder emails directly in the background without you needing to click or review anything.
Just show a neat countdown list of deadlines
You manually write and send the emails yourself, but you use the tool to see what is due and when.
Other — your own answer
Who will be building this tool, and what kind of setup are they comfortable with?*
Select one
A volunteer or friend with basic coding skills (like Python or JavaScript)
We have someone who can write simple scripts or web pages in their spare time.
I will build it myself using 'no-code' tools (like Airtable, Zapier, or Make)
No traditional coding needed; we build it using drag-and-drop tools we can manage ourselves.
A professional developer or agency we are hiring
We have a budget to hire someone who can build a custom, secure web application from scratch.
We don't have anyone to build it yet
We need to design this so simply that we can easily find a beginner to put it together.
Other — your own answer
Is there a specific date when you absolutely need this tool up and running?*
Select one
Within the next few months
We want to transition away from our spreadsheet soon, but we have time to test it and get it right.
Within the next 2 to 3 weeks
We have an important grant deadline coming up and need this working immediately to help manage it.
No deadline at all
We are happy to take our time to make sure we build the perfect solution.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-tasks — the document

```
## Overview

This document outlines the actionable, sequentially structured implementation tasks required to build the Grant Tracking and Draft Generation Tool. It serves as a step-by-step roadmap for a software development agent to assemble the system from its initial codebase scaffold to a production-ready, containerized deployment.

The implementation is structured around delivering the core "five-minute daily routine" for a sole fundraiser at a small charity. Key efforts are heavily focused on three primary areas:
1. **Frictionless Data Import:** Rescuing the user from "spreadsheet hell" through an interactive client-side column mapper paired with a database-transactional CSV import pipeline.
2. **Dynamic Dashboard Tracking:** Displaying relative visual urgency indicators and a dedicated weekly digest panel.
3. **One-Click Draft Workbench:** Generating high-quality contextual email drafts via an external LLM API and handing them off safely to the user's local mail client via clipboard mechanisms and `mailto:` protocol deep links, maintaining a strict human-in-the-loop posture with zero outbound SMTP infrastructure.

The architecture uses TypeScript across both the React frontend and Node.js backend. A relational database (PostgreSQL in production, SQLite for local testing) holds system states. Both layers are containerized in a single multi-stage Docker file to optimize hosting costs for small non-profits.

---

## Requirement Coverage

The following matrix maps the functional and non-functional requirements defined in `requirements.md` and `solution.md` to specific implementation tasks detailed in the execution phases of this document.

| Requirement ID | Description | Target Module / System Component | Verification & Testing Method |
| :--- | :--- | :--- | :--- |
| **FR-1.1 / FR-1.2** | Secure authentication and stateless token/cookie session management | Backend Auth Router (`/api/auth/login`), JWT Verification Middleware, React Context | Integration testing of login controller, verification of secure cookie/token storage in E2E tests |
| **FR-1.3** | View and modify baseline charity details (Name, Mission) | Profile Controller (`GET`/`PUT` on `/api/user/profile`), Profile Form Component | Validation of payload update integrity in database; E2E check on prompt execution context changes |
| **FR-2.1 / FR-2.5** | Unified pipeline dashboard, manual CRUD, and relative sorting | React Dashboard view, Express Pipeline Manager, Paramount db index (`idx_gra
```

### myspec-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The implementation tasks document provides a solid, sequentially structured roadmap with excellent coverage of core requirements and strong performance/security guards. However, it contains critical gaps and architectural ambiguities that would leave a coding agent guessing. Specifically, there is no registration path or database seeding mechanism defined for onboarding users, a direct contradiction exists between cookie-based and bearer-token authentication flows, and the external LLM provider API details are completely unspecified. Addressing these details will ensure the agent can execute the build successfully without making incorrect assumptions.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Missing User Registration Flow or DB Seeding Strategy
Confidence score 9/10
Phase 2: Authentication, Profile Setup & Session Management — Task 2.1 & 2.3
The specification outlines a login API router (/api/auth/login) and login frontend form, and references a 'users' table in Task 1.2. However, there is no registration endpoint (/api/auth/register), signup form, or database seeding strategy defined for creating the initial user. Without a way to create a user account, the login flow is untestable and unusable.
Suggestion: Add a user registration task (e.g., '/api/auth/register') to Task 2.1 and Task 2.3, or explicitly define a database seeding step in Phase 1 with default fallback credentials for the sole fundraiser.
Contradictory Authentication Storage Mechanisms
Confidence score 9/10
Phase 2: Authentication, Profile Setup & Session Management — Task 2.1 & 2.3
Task 2.1 tasks the developer with choosing between a 'secure payload JWT or HTTP-only cookie wrapper,' whereas Task 2.3 specifies using 'React hook-state contexts to preserve access tokens across sessions.' This creates a contradiction: if an HTTP-only cookie is used, the frontend does not need to manually handle or store access tokens in React state; if bearer JWTs are used, the client must store and attach them. Leaving this choice ambiguous will likely lead to mismatched implementation between frontend and backend layers.
Suggestion: Standardize on a single approach. For example, specify: 'Return a JWT in the response payload on login, which the React app stores in context/memory and transmits in the Authorization header as a Bearer token.'
Unspecified LLM Provider and Environment Configuration
Confidence score 9/10
Phas
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
