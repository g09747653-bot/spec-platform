# M10п gate — what the models said

### myspec-greenfield-v1-interview — the round asked

```
Who is going to open this tool on a Monday morning to manage these grants?*
Select one
A single founder or director(Recommended)
One person who does everything and just needs to get in, get the reminders, and get out.
A tiny team of 2 or 3 staff/volunteers
A few people who need to see who is assigned to what so they don't double-email someone.
Board members or part-time advisors
People who aren't in the day-to-day work but need a quick dashboard view of what's coming up.
Other — your own answer
How are you keeping track of these grant deadlines today, and what's the main reason that's failing?*
Select one
A shared spreadsheet (Excel/Google Sheets)(Recommended)
It's hard to keep updated, nobody looks at it, and it doesn't prompt anyone to write the emails.
Calendar events and phone reminders
They pop up but get dismissed, and they don't help write the actual follow-up text.
Mental notes and digging through old emails
We constantly worry we are forgetting a major deadline until it's too late.
Other — your own answer
When the tool drafts a reminder email for you, what would make it feel like absolute magic?*
Select one
It puts a draft directly into my Gmail or Outlook drafts folder(Recommended)
You open your actual email app, and the perfect draft is already sitting there waiting for you to click 'Send'.
A clean copy-paste screen in the tool
You see the text in the app, click 'Copy', and paste it wherever you want.
It sends the email automatically on the due date
The system sends it in the background without you having to review or click anything.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the round asked

```
When the tool drafts an email or tracks your deadlines, what is the absolute 'no-go' that it must never do?*
Select all that apply
Never send an email automatically
The tool only creates drafts; a human must always review and click 'Send' manually.
Never read non-grant emails
The tool must ignore your personal or unrelated charity emails in Gmail or Outlook.
Stay out of charity financial tracking
It should not track actual bank transactions, spending, or charity budgets, just deadlines.
Other — your own answer
What kind of details will you be typing into this tool, and how private does that information need to be?*
Select one
Mostly public details
Just grant names, upcoming deadline dates, and public links to funding bodies.
Direct contact info for grant officers
Names, direct email addresses, and phone numbers of our key funding contacts.
Highly confidential draft notes
Internal project budgets, weaknesses we are addressing, and raw application ideas.
Other — your own answer
Imagine you've been using this tool for three months. What does 'working perfectly' look like on a Monday morning?*
Select one
Drafts are already waiting in my email folder
I open my normal email client and find relevant, friendly drafts ready for me to personalize and send.
No missed deadlines without looking at spreadsheets
I haven't opened a tracking spreadsheet in weeks, and I feel totally on top of our pipeline.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-constitution — the document

```
## Project Vision

The target user of this tool is the **overworked founder** of a small charity. Currently, their grant application tracking is buried in a cluttered **shared spreadsheet** that is frequently neglected. This leads to missed deadlines, lost funding opportunities, and strained relationships with institutional funders. 

The **magic moment** of this application is delivering a "drafts waiting" experience. Instead of forcing the founder to draft updates, follow-ups, or reminder emails from scratch while staring at a spreadsheet, they will open their email client (Gmail or Outlook) or the application dashboard to find perfectly crafted email drafts waiting for their review. 

The ultimate success vision is a tool that acts as an invisible administrative assistant—keeping track of due dates, preparing the necessary communications automatically, and letting the founder focus on securing resources and running their programs.

## Core Principles

*   **No Auto-Send (Strict Boundary):** The tool must *never* send an email automatically to a funder or grantor. Communication with institutional funders is highly sensitive. The tool's boundary is strictly to *generate drafts* and place them in a pending state or directly in the user's email client. The overworked founder always remains the final authority who reviews, edits, and manually clicks "Send".
*   **Zero-Friction Adoption:** The interface must be significantly easier to use than a shared spreadsheet. Adding a grant opportunity, setting a deadline, and linking a funder should take under 30 seconds.
*   **Drafts as the Primary Output:** The primary metric of value is how quickly a user can go from a due-date alert to having a polished email draft ready in their inbox workspace.
*   **Minimal Data Footprint:** We only track basic public info about grants (funder names, public deadlines, program names) and do not store sensitive donor banking credentials or internal financial accounts.

## Technology Constraints

*   **OAuth Integration for Email Services:** The application must integrate with Google Workspace (Gmail API) and Microsoft 365 (Microsoft Graph API) using secure OAuth 2.0. Service account keys or raw SMTP/IMAP credentials must not be stored.
*   **Deployment & Hosting:** The application must run on a cost-effective cloud platform (such as Render, Fly.io, or AWS Elastic Beanstalk) with minimal infrastructure overhead, keeping operational costs low for small charity budgets.
*   **Relatio
```

### myspec-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The constitution document provides a clear product vision and strong constraints around security, architecture, and performance for a grant application tracking helper. However, it suffers from critical ambiguities that would leave an automated coding agent guessing. Specifically, the technology stack is specified as a list of multiple alternative options (TypeScript, Python, Go; Celery, BullMQ, Sidekiq) rather than a single concrete selection, and there are references to AI draft generation with absolutely no details on LLM providers, prompts, or configuration. Additionally, the lack of specifications around user registration, workspace creation, and the triggers for grant state transitions leaves key structural components of the application undefined.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Undefined and ambiguous tech stack selection
Confidence score 10/10
Technology Constraints
The document lists several mutually exclusive alternatives for both languages (TypeScript, Python, Go) and background processors (Celery, BullMQ, Sidekiq). Leaving this open guarantees the coding agent will have to guess the tech stack, which may lead to incorrect library usage or configuration mismatches.
Suggestion: Explicitly select and mandate a single programming language/framework (e.g., TypeScript with Node.js) and a single background queue runner (e.g., BullMQ) for the implementation.
Missing specifications for AI/template-based draft generation
Confidence score 9/10
Coding Standards
The document references 'AI/template-based draft generation' under Modular Architecture, but fails to define whether AI is actually used, which LLM provider or API key is required, what model to target, or how prompts/templates are configured.
Suggestion: Clarify whether draft generation is purely template-driven or uses an LLM. If LLM-based, specify the provider (e.g., OpenAI API), model (e.g., gpt-4o), and prompt guidelines. If strictly local templates, remove the 'AI' reference to prevent confusion.
Recommendations (2)
Unspecified grant state transition triggers
Confidence score 8/10
Testing Approaches
The document states that email drafts must be automatically generated when state transitions occur (e.g., Drafting -> Submitted -> Awarded), but does not specify how these state transitions are triggered (manual user action in the UI, database cron job, or external mail/API event).
Suggestion:
```

### myspec-greenfield-v1-requirements — the round asked

```
How do you want to get your grant deadlines into this tool?*
Select one
Type them in manually(Recommended)
You fill out a quick, simple form with the grant name, funder, due date, and contact email.
Upload your existing spreadsheet
You upload your current tracking Excel or Google Sheet, and the tool imports the data for you.
Forward an email from a funder
You forward a grant announcement email to a special address, and the tool extracts the deadline automatically.
Other — your own answer
When should the tool actually create those draft emails in your Gmail or Outlook?*
Select one
Automatically, a set number of days before the deadline(Recommended)
For example, a draft appears in your email folder exactly 14 days before the due date, without you doing anything.
Only when I click a button next to the grant
You look at your list in the tool first, then click 'Create Draft' when you are ready to start writing.
Every Monday morning
The tool looks at what is due in the next two weeks and drafts emails for all of them in one go.
Other — your own answer
Who else will need to log in and use this tool?*
Select one
Just me(Recommended)
Only the director/founder logs in; there is no need to manage other accounts, passwords, or permissions.
Me and a volunteer or grant writer
They can log in to write updates and see deadlines, but they cannot access my personal email connection.
Me plus the board
I manage all the drafts and connections, but board members can log in to a read-only screen to see what money is in the pipeline.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-requirements — the document

```
## Overview

This document specifies the software requirements for a lightweight, web-based grant application tracking and automated communication drafting tool. Designed specifically for the **overworked founder** or **solo director** of a small charity, this tool transitions operations from a cluttered, frequently neglected **shared spreadsheet** into a proactive, high-efficiency dashboard. 

The primary value proposition—the **"magic moment"**—is a "drafts waiting" experience. Instead of forcing the user to manually track upcoming milestones and compose updates, follow-ups, or reports from scratch, the application monitors deadlines in the background and automatically generates polished email drafts. These drafts are pushed directly into the user’s integrated email client (Gmail or Outlook) or presented inside the web interface as a fallback.

### Core Principles

*   **No Auto-Send (Strict Boundary):** The system must *never* execute an email send operation. It serves exclusively as an administrative drafting assistant. The founder remains the final authority who reviews, modifies, and manually clicks "Send" within their native email client or dashboard fallback.
*   **Zero-Friction Adoption:** Adding a grant opportunity, defining its deadline, and linking a funder must be executable via a simple form in under 30 seconds.
*   **Minimal Data Footprint:** The application only stores basic, public-facing metadata about grants and funders. No sensitive internal financial statements, beneficiary personal identifying information (PII), or donor banking credentials are collected or stored.

---

## User Roles

The application supports a single user archetype per tenant workspace, focused entirely on ease of use and immediate administrative relief.

### 1. Solo Director / Overworked Founder (Primary User)
The sole operator of the charity's workspace. This user has full administrative privileges over their tenant context, including:
*   Authenticating their business email account (via Google Workspace or Microsoft 365 OAuth 2.0).
*   Manually logging, modifying, and changing statuses of grant applications.
*   Reviewing automatically generated email drafts within the web UI dashboard fallback or their native email client's drafts folder.
*   Copying generated drafts to their system clipboard if integrations are bypassed.

---

## Functional Requirements

### 1. Multi-Tenant Workspace & Access Control
*   **Registration & Authentication:** Users can register an 
```

### myspec-greenfield-v1-requirements — the review board

```
REQUIREMENTS · REVIEW

Needs Revision

The specification outlines a well-conceived single-user, multi-tenant web application for automated email drafting and deadline tracking. However, it cannot be safely handed over to a coding agent due to several critical functional gaps. Most notably, the core automated drafting engine is described only through illustrative examples rather than deterministic rules, and the actual template content for the generated emails is missing entirely. Additionally, the public funder search integration lacks an API provider definition, and there are minor schema mismatches concerning draft status values and missing endpoint declarations.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Vague draft triggering rules and undefined email templates
Confidence score 10/10
Functional Requirements — 3. Automatic Countdown & Draft Triggering
The core automated drafting mechanism relies on vague 'examples' of triggers (such as 'e.g., 7 days before a submission deadline' or 'upon transition to the Reporting Due status') rather than a definitive, complete mapping. Furthermore, no actual email template bodies are specified (e.g., what the 'inquiry check-in' or 'submission notice' must say). An agent would be forced to guess when drafts are generated and what they should contain.
Suggestion: Define an explicit, exhaustive list of state transitions and time thresholds that trigger email draft creation. Provide concrete template texts (subject lines and email bodies) utilizing variables like {{funder_name}} and {{deadline}}.
Missing integration details for public entity search
Confidence score 10/10
Functional Requirements — 2. Grant Opportunity & Deadline Tracking
The Manual Creation Form mentions that the Funder Name field can search public entities. However, no external public search APIs are defined under the Integration Requirements, nor is there any schema or credential information mapped to support this.
Suggestion: Specify which public search API to integrate (e.g., Candid) and include its auth/endpoint details, or state that the funder search should be restricted to a mock database list / purely manual input for this iteration.
Recommendations (2)
Discrepancy in draft status naming
Confidence score 10/10
Non-Functional Requirements — 3. Reliability & Architecture Constraints
The reliability constraints state that upon third-party API failures, the database status for the draft must upd
```

### myspec-greenfield-v1-solution — the round asked

```
When you are tracking these deadlines and reviewing email drafts, how and where are you working?*
Select one
At my desk on a laptop or desktop computer with reliable internet(Recommended)
We will design a web application optimized for a large screen that assumes you are always connected.
On both my computer and my phone, always with internet
We will make sure the layout shrinks beautifully onto a phone screen for quick checks on the go.
On my computer, but I need it to work even without internet (like on a train)
We will build offline storage so you can see your deadlines and write notes without a connection.
Other — your own answer
Who is going to log into this tool on a Monday morning?*
Select one
Just me—I run this charity and handle the grants alone(Recommended)
This keeps things simple: one password, one inbox, and no need to worry about people stepping on each other's toes.
Me and one or two regular volunteers or co-directors
We will add basic account sharing so a couple of people can log in and see the same deadline list.
A team of people that might grow or change quickly
We will build a user management system so you can easily invite, edit, or remove team members.
Other — your own answer
Where do your grant deadlines live right now, and what should we do with that system?*
Select one
In Excel or Google Sheets, and we want to move away from them entirely(Recommended)
We will build an easy one-time importer so you can upload your spreadsheet and never look at it again.
In Excel or Google Sheets, and the new tool must read/write to them constantly
The tool will act as a layer on top of your existing spreadsheet, keeping both perfectly in sync.
In a shared calendar (like Google Calendar or Outlook), which we must keep using
The tool will automatically pull dates from your calendar and put the email reminders directly there.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-solution — the document

```
## Overview

Overworked founders and solo directors of small charities struggle with tracking grant application timelines. Often managing operations through fragmented, neglected spreadsheets, they frequently miss strict deadlines, resulting in lost funding opportunities and compromised relationships with institutional funders. 

The primary value proposition of this application is delivering the **"magic moment"** of a **"drafts waiting"** experience. Instead of forcing an administrative lead to manually track milestones and write updates, follow-ups, or performance reports from scratch, this solution monitors deadlines in the background. It automatically generates high-quality, professional email drafts tailored to specific stages of the grant life cycle. These drafts are pushed directly into the founder's connected Gmail or Outlook Drafts folders, or displayed within a secure sandbox environment on the web dashboard as a fallback.

### Strict Safety Boundaries

The core security and operational boundary of this system is **No Auto-Send**. Under no circumstances does this application contain any code, libraries, or protocols capable of executing an SMTP relay or calling an email-sending API. The human operator is always the final authority who reviews, modifies, and manually clicks "Send" within their native email client or manually copies the content from the fallback sandbox interface. 

This document serves as the absolute technical blueprint for building the application, enforcing strict data isolation, tight OAuth permissions, reliable task scheduling, and failsafe sandbox drafting.

---

## High-Level Architecture Design

The application is built on a modern, decoupled, multi-tenant architecture designed to scale seamlessly while running on cost-effective infrastructure. 

### System Component Map

```
                               +-----------------------------+
                               |      Web Browser Client     |
                               | (Responsive Dashboard & UI) |
                               +--------------+--------------+
                                              |
                                              | HTTPS (JSON / Session Cookie)
                                              v
                               +--------------+--------------+
                               |     Stateless Web Tier      |
                               | (FastAPI / Express / Rails) |
                               +-------+---
```

### myspec-greenfield-v1-solution — the review board

```
SOLUTION · REVIEW

Needs Revision

The specification defines a highly secure, tenant-isolated grant-tracking and auto-drafting platform tailored for small charities. However, it lacks specificity regarding the core technology stack, presenting a choice between three entirely different frameworks (FastAPI, Express, and Rails) which will stall an automated coding agent. Additionally, while the system is built around the generation of email drafts, the actual email templates and copy rules are completely omitted, leaving the agent to invent them. Finally, minor inconsistencies in status enum naming and potentially brittle scheduling logic for the 7-day countdown search query should be resolved to guarantee reliable deployment and execution.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Stack ambiguity in stateless web tier
Confidence score 10/10
High-Level Architecture Design — System Component Map
The specification lists 'FastAPI / Express / Rails' as options for the stateless web tier. For an automated coding agent, this ambiguity is a major gap. The agent requires a single, concrete language and framework decision to proceed with building the application, writing tests, and managing dependencies.
Suggestion: Explicitly define the exact technology stack (e.g., 'FastAPI (Python)' or 'Express (TypeScript)' or 'Ruby on Rails') to be used for the Web Tier and the corresponding Background Worker.
Undefined email templates and generation rules
Confidence score 9/10
System Modules — 4. Draft Composition & Generation Engine
The document specifies that the generator 'constructs standard professional email communications using a localized collection of structural templates' and 'replaces template variables,' but it fails to define the actual templates, their content, or the rules mapping them to specific grant states (e.g., what the 'Drafting' 7-day reminder should say vs the 'Reporting Due' report). An agent will be left to guess or invent the default email subject lines and bodies.
Suggestion: Provide the exact text/markdown template structure and variable names (such as {{funder_name}}, {{prog_name}}, {{deadline}}) for both the 7-day pre-submission reminder and the 'Reporting Due' post-award progress report.
Recommendations (2)
Inconsistent enum formatting in draft status check constraint
Confidence score 8/10
Data Model — Schema Blueprint
In the email_drafts table schema, the status column check constraint use
```

### myspec-greenfield-v1-tasks — the round asked

```
To get this helper tool up and running and actually saving you time next week, what is the absolute bare minimum it needs to do?*
Select one
Manual entry & automatic drafts
You type in the grant names and deadlines yourself, and the tool places draft emails in your Gmail or Outlook.
Auto-import & drafts
The tool reads your existing spreadsheets, finds the dates, and drafts the emails without you typing them in.
A simple deadline calendar
Just a clean web page showing what is due when, without any email drafting features for now.
Other — your own answer
Do we have a specific date on the calendar we need to hit for this to be ready, maybe tied to an upcoming funding cycle?*
Select one
No rush
We want to take our time and get it right; there is no fixed deadline.
Before the next big grant season
We need this ready in 2 to 3 months to help with our next major round of applications.
In the next few weeks
Our current spreadsheets are falling apart and we need this working almost immediately.
Other — your own answer
Who is going to actually build this tool for you, and what are they most comfortable working with?*
Select one
A handy volunteer or staff member
Someone comfortable using simple, ready-made tools like Zapier, Make, Airtable, or basic Google scripts.
A professional software developer
A programmer who will write custom code from scratch to build a unique application.
We don't have a builder yet
We need help finding someone or need to know what skills to look for.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-greenfield-v1-tasks — the document

```
## Overview

This implementation document translates the specifications for the Grant Application Tracker and Draft Generator into a systematic, sequential blueprint. Designed for an automated builder or a developer working within strict constraints, this document guides the development of a secure, multi-tenant web application.

The core objective is to deliver the **"magic moment"**—the "drafts waiting" experience—safely, reliably, and with a **strict boundary of No Auto-Send**. Communication with institutional funders is managed through draft creation (Gmail/Outlook APIs) or a clean, clipboard-compatible sandboxed fallback modal.

The application architecture consists of a stateless web tier, a PostgreSQL database for structured data and token management, a Redis-backed queue for asynchronous background processing, and a highly responsive, streamlined web user interface.

---

## Requirement Coverage

The table below maps the functional and non-functional requirements from the approved specification files directly to the target implementation tasks.

| Requirement Source | Requirement Description | Implementation Task Reference |
| :--- | :--- | :--- |
| **requirements.md (Func 1)** | Multi-Tenant Workspace & Access Control | **Phase 1 (Database & Isolation)** & **Phase 2 (Auth Middleware)** |
| **requirements.md (Func 2)** | Grant Opportunity Manual Creation Form | **Phase 3 (Core UI & CRUD)** |
| **requirements.md (Func 2)** | Lifecycle Status Transitions Machine | **Phase 3 (Lifecycle Logic)** |
| **requirements.md (Func 3)** | Deadline Proximity Monitor / Auto Draft | **Phase 4 (Scheduler & Generation)** |
| **requirements.md (Func 4)** | Google Workspace & Outlook API Drafting | **Phase 5 (OAuth & Sync Workers)** |
| **requirements.md (Func 4)** | Failsafe Sandbox Modal & Clipboard copy | **Phase 6 (UI Fallback Sandbox)** |
| **requirements.md (NFR 1)** | Sub-Second Rendering (<1s) & Async Sync | **Phase 8 (Performance tuning)** |
| **requirements.md (NFR 2)** | AES-256-GCM Token Encryption at Rest | **Phase 2 (Symmetric Encryption Engine)** |
| **requirements.md (NFR 2)** | Least-Privilege OAuth Scopes | **Phase 5 (Identity Scope Configuration)** |
| **requirements.md (NFR 2)** | Session Security (HTTP-only, Strict, Secure) | **Phase 2 (Authentication System)** |
| **requirements.md (NFR 3)** | Stateless Web Tier / Background Queue | **Phase 1 (Container Setup)** & **Phase 4 (Redis Worker)** |
| **requirements.md (NFR 4)** | Boundary Guardrail Tes
```

### myspec-greenfield-v1-tasks — the review board

```
TASKS · REVIEW

Needs Revision

The implementation document outlines a logical 8-phase blueprint for a Grant Application Tracker with automated draft generation, but it contains several critical gaps that will cause a coding agent to fail. Most notably, there is no mechanism to determine whether a generated draft should be pushed to Gmail or Outlook (since the drafts table lacks a provider reference and workspaces can have credentials for both). Additionally, the exact templates and default email copy are completely omitted, and the target development stack is left open with mutually exclusive examples (e.g., Node.js vs Python vs Go, and BullMQ vs Celery). These omissions require structural schema updates and exact content definitions before an automated builder can successfully execute the tasks.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Missing Email Provider Selection Logic for Draft Pushes
Confidence score 10/10
Phase 5: OAuth 2.0 Integration & Sync Workers — Task 5.2: Asynchronous Draft Push Workers
In Task 5.2, the worker is instructed to query oauth_credentials using the workspace context and push drafts. However, a single workspace can have credentials for both GMAIL and OUTLOOK (unique index is on workspace_id, provider). The email_drafts schema in Task 1.2 does not contain a provider column, nor is there any default provider configuration defined in the workspaces table. The agent cannot know which external API to target for a given draft.
Suggestion: Add a provider column (CHECK Enum: 'GMAIL', 'OUTLOOK') to the email_drafts table schema in Task 1.2, and specify how this provider is determined when a draft is initially generated (e.g., based on a workspace default provider, or generating separate drafts for all active credentials).
Missing Content and Copy Specifications for Email Templates
Confidence score 9/10
Phase 4: Cron-like Monitor Daemon & Draft Generation — Task 4.2: Structured Email Template Resolution Engine
Task 4.2 directs the agent to 'Deliver clean, polished, and generic default copy strings appropriate for institutional correspondence' for several presets (Inquiry check-in, Draft Submission reminder, Post-Award Progress Report). Leaving the copywriting to the coding agent results in non-deterministic code, impossible-to-test outputs, and potential placeholders in production copy.
Suggestion: Provide the exact default subject line and body text (including variable placeholde
```
