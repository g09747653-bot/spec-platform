# M12п gate — what the models said

### the seed bubble

```
I want to build: A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails
```

### interview — the round asked

```
Who is the main person opening this tool on a Monday morning to check on grants?*
Select one
The Charity Director(Recommended)
They wear five different hats and need a 5-minute bird's-eye view of what is urgent.
quick views
simple UI
A dedicated Grant Writer
A part-time or volunteer writer who focuses heavily on the details of each application.
detail oriented
A rotating volunteer
Different people helper out weekly, so the tool must require absolutely zero training.
foolproof
ultra simple
Other — your own answer
How do you track these deadlines today, and what makes that painful?*
Select all that apply
A shared Google Sheet or Excel file(Recommended)
It is tedious to update, and nobody looks at it until a deadline has already passed.
low engagement
Personal calendars
Deadlines get mixed up with personal appointments, and others can't see them.
siloed info
Post-it notes and memory
We are constantly worried something important is going to slip through the cracks.
high anxiety
Searching through the email inbox
We waste hours digging through sent folders to see if we ever followed up.
wasted time
Other — your own answer
Who are these reminder emails actually being sent to?*
Select one
The grant funders(Recommended)
Nudging foundation officers to check on the status of our submitted application.
external email
Our own team members
Reminding colleagues to write their section or gather documents before the deadline.
internal tasking
Both internal staff and external funders
We need templates for chasing our team and templates for following up with funders.
multi template
Other — your own answer
What is the single thing this tool could do that would make you say, 'This saves my week'?*
Select one
One-click email drafting(Recommended)
It opens my email app with a pre-written, polite nudge message containing the funder's name.
time saver
Proactive email alerts
It emails me a digest of what's due this week so I don't even have to log into a dashboard.
passive use
A simple color-coded timeline
A clean visual layout showing upcoming dates in green, amber, and red.
visual aid
Other — your own answer
Submit Answers
Answer in your own words instead
```

### constitution — the round asked

```
Since this tool helps write emails to your funders, what is the absolute worst thing it could do that we must prevent at all costs?*
Select all that apply
Sending emails automatically(Recommended)
The system must never send an email directly; a human must always review and hit 'Send' from their own inbox.
safety
critical
Exposing your funder list to the public
Anyone on the web being able to search or see who you are asking for money.
privacy
Losing your history of past grants
Accidentally deleting old records when a deadline passes, leaving you with no history.
reliability
Other — your own answer
What level of private or sensitive information will you be typing into this tool?*
Select one
Low: Mostly public info
Funder names, public deadlines, and official office email addresses you could find on Google.
Medium: Personal contacts and relationship notes(Recommended)
Direct email addresses of program officers and private notes like 'John was quiet during our last call.'
realistic
High: Financials and draft proposals
Detailed project budgets, your charity's tax ID numbers, and draft language for upcoming proposals.
Other — your own answer
To get this built quickly, which of these tasks should we deliberately stay out of for now?*
Select all that apply
Writing the actual grant proposals(Recommended)
The tool will not draft the 10-page application itself, only the short follow-up and reminder emails.
simpler
narrow focus
Tracking actual cash and bank accounts
It won't sync with your bank or track whether a grant check has cleared.
no integrations
Storing large PDFs and submission files
It won't act as a hard drive for your past proposal documents; it only stores text and dates.
no file storage
Other — your own answer
Imagine you've been using this tool for three months. What does 'working beautifully' look like for your day-to-day work?*
Select one
Hours saved on follow-ups(Recommended)
You spend 5 minutes sending reminder emails instead of hunting down dates and drafting them from scratch.
productivity
Never missing a deadline
A clean dashboard that ensures zero grant deadlines slip through the cracks unnoticed.
peace of mind
Everyone knowing who is doing what
Board members and co-directors can log in and instantly see which grants are outstanding without emailing you.
teamwork
Other — your own answer
Submit Answers
Answer in your own words instead
```

### the document, as the customer downloads it

```
## Project Vision

The objective of this project is to liberate small charity directors from the administrative burden of tracking grant applications via chaotic, static spreadsheets. For a small charity, securing funding is a matter of survival, yet tracking deadlines and manually composing follow-ups or reporting reminders steals critical time away from community-facing impact. 

This tool provides a central, intuitive dashboard focused on tracking upcoming deadlines and generating highly contextualized reminder emails with a single click. The success of this tool over its first three months will be measured strictly by the time saved for the Director—reducing the weekly overhead of checking deadlines and drafting emails from hours to minutes.

### What the Product is Not
* **Not a proposal writer:** The tool will absolutely not draft new grant proposals, write impact reports from scratch, or act as an AI copywriter for initial submissions. Writing proposals is strictly out of scope.
* **Not a bulk email sender:** It is not a marketing or automated outreach platform.

---

## Core Principles

* **Human-in-the-Loop (Absolute No-Go on Auto-Send):** Under no circumstances shall the platform automatically send emails to external funders. Funders are the charity's most critical relationships; every single communication must be explicitly reviewed, edited, and sent manually by the Director.
* **One-Click Draft Value:** The core value proposition is the rapid generation of highly relevant email drafts. The user experience must prioritize getting the user from a deadline alert to a high-quality email draft in a single click.
* **Simplicity and Focus over Feature Creep:** The interface must be optimized for a single, non-technical user (the Charity Director). Avoid complex configurations, multi-user permissions hierarchies, or nested navigation structures.
* **Low Maintenance Overhead:** Designed for a small charity, the system must require virtually zero ongoing technical administration, self-healing where possible, and using stable, proven technologies.

---

## Technology Constraints

* **Frontend & Backend Stack:** To minimize deployment friction and operational costs, the application will be built as a single unified TypeScript codebase using Next.js (App Router). 
* **Database:** A lightweight PostgreSQL database hosted on a managed database tier (e.g., Supabase or Neon) or SQLite (for local/self-hosted pathways) to keep infrastructure costs negligible whil
```

### constitution — the document

```
## Project Vision

The objective of this project is to liberate small charity directors from the administrative burden of tracking grant applications via chaotic, static spreadsheets. For a small charity, securing funding is a matter of survival, yet tracking deadlines and manually composing follow-ups or reporting reminders steals critical time away from community-facing impact. 

This tool provides a central, intuitive dashboard focused on tracking upcoming deadlines and generating highly contextualized reminder emails with a single click. The success of this tool over its first three months will be measured strictly by the time saved for the Director—reducing the weekly overhead of checking deadlines and drafting emails from hours to minutes.

### What the Product is Not
* **Not a proposal writer:** The tool will absolutely not draft new grant proposals, write impact reports from scratch, or act as an AI copywriter for initial submissions. Writing proposals is strictly out of scope.
* **Not a bulk email sender:** It is not a marketing or automated outreach platform.

---

## Core Principles

* **Human-in-the-Loop (Absolute No-Go on Auto-Send):** Under no circumstances shall the platform automatically send emails to external funders. Funders are the charity's most critical relationships; every single communication must be explicitly reviewed, edited, and sent manually by the Director.
* **One-Click Draft Value:** The core value proposition is the rapid generation of highly relevant email drafts. The user experience must prioritize getting the user from a deadline alert to a high-quality email draft in a single click.
* **Simplicity and Focus over Feature Creep:** The interface must be optimized for a single, non-technical user (the Charity Director). Avoid complex configurations, multi-user permissions hierarchies, or nested navigation structures.
* **Low Maintenance Overhead:** Designed for a small charity, the system must require virtually zero ongoing technical administration, self-healing where possible, and using stable, proven technologies.

---

## Technology Constraints

* **Frontend & Backend Stack:** To minimize deployment friction and operational costs, the application will be built as a single unified TypeScript codebase using Next.js (App Router). 
* **Database:** A lightweight PostgreSQL database hosted on a managed database tier (e.g., Supabase or Neon) or SQLite (for local/self-hosted pathways) to keep infrastructure costs negligible whil
```

### constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The constitution document outlines a lightweight, highly focused Next.js dashboard designed to help charity directors manage grant deadlines with a strict human-in-the-loop email drafting system. However, several architectural and implementation gaps need revision before an agent can cleanly build the application. Most notably, the document introduces a direct contradiction between the restriction on SMTP/email services and the proposal of magic link authentication. Additionally, there is a lack of security specifications for the public-facing iCalendar subscription endpoint, and potential client-side failure modes are unaddressed for mailto: URI character limits and SQLite state persistence on serverless hosts.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Security Constraints — Authentication
Confidence score 9/10
NextAuth Magic Links Contradicts No-SMTP Restriction — The authentication section specifies supporting magic links using NextAuth.js. However, sending magic links requires a transactional email service or SMTP setup. This directly conflicts with the decoupled drafting constraint in the Architecture section, which states that the application will explicitly not include SMTP configuration or transactional email servers. Without resolving this, the developer will be unable to implement magic links.
Suggestion: Either restrict the authentication options to OAuth providers only (like Google Workspace login) to completely bypass SMTP needs, or explicitly permit a transactional email provider (such as Resend or Postmark) exclusively for security-related transactional mail like auth tokens.
Integration Points — Calendar Feed Export
Confidence score 9/10
Missing Security Specification for iCalendar Feed — The document mandates a read-only iCalendar (.ics) subscription feed so the director can sync deadlines. However, external calendar applications (such as Google Calendar or Outlook) fetch feeds in the background and cannot authenticate via standard NextAuth session cookies. The specification fails to define how this endpoint is secured, which risks either leaving charity deadline data completely public or making the feed impossible to subscribe to.
Suggestion: Specify that the iCalendar endpoint should authenticate subscriptions using a unique, un-guessable token passed as a query parameter (e.g., /api/calendar?token=unique_token_here) mapped to the user record
```
