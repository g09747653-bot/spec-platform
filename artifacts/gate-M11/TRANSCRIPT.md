# M11п gate — what the models said

### the seed bubble

```
I want to build: A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails
```

### interview — the round asked

```
Who is going to open this tool on a Monday morning to manage these grants?*
Select one
The charity founder or director(Recommended)
They wear all the hats, have very little time, and need something incredibly quick and simple.
one-user
high-speed
A part-time volunteer or grant writer
They help out a few hours a week and need clear, step-by-step guidance on what to do next.
multi-user
A board member or trustee
They want a quick, high-level overview of progress rather than daily hands-on tasks.
reporting-heavy
Other — your own answer
How do you track these deadlines right now, and what is the most painful part of that process?*
Select one
A shared spreadsheet (Excel or Google Sheets)(Recommended)
It is tedious to update, nobody looks at it, and it never warns us when a deadline is creeping up.
needs-nudges
Our personal calendars
Deadlines get lost among everyday meetings, and we can't store email drafts inside calendar events.
better-visibility
Mental notes and searching through our inboxes
We rely on memory and inbox searches, which makes us constantly anxious that we missed a deadline.
stress-reduction
Other — your own answer
When this tool drafts a reminder email, who is that email usually meant for?*
Select one
An internal team member or volunteer(Recommended)
Reminding our own team to write their section, gather stats, or finish the budget.
internal-comms
An external partner or reference
Nudging a partner organization or referee to send us their letter of support.
external-comms
The grant-giving foundation itself
Asking the funder for feedback or checking if they received our submitted application.
funder-comms
Other — your own answer
What would make you say, 'Wow, this tool just saved our week'?*
Select one
The drafts appear directly in my Gmail or Outlook drafts folder(Recommended)
I don't have to copy-paste; I just open my email app, review the draft, and hit send.
automated
saves-steps
I get a single 'Monday morning checklist' email
I don't even have to log into a new tool; it just emails me exactly what is due this week and what to say.
no-login-needed
A simple, color-coded countdown dashboard
A visual screen showing green, yellow, and red cards for our upcoming grants so nothing surprises us.
visual-tracker
Other — your own answer
Submit Answers
Answer in your own words instead
```

### the analytical bridge (row `1.2-3`)

```
While you currently track deadlines in "A shared spreadsheet (Excel or Google Sheets)," you want a new "tool that tracks" them, which raises the question of whether we are replacing or syncing with your existing sheets. Additionally, getting drafts to appear "directly in my Gmail or Outlook drafts folder" requires API integrations that can be difficult to set up and maintain for a "small charity." I will ask next how you want to handle your existing spreadsheet data and how we should connect to your email client.
```

### constitution — the round asked

```
When it comes to your emails and spreadsheets, what is the absolute 'red line' this tool must never cross?*
Select one
Never send an email automatically(Recommended)
The tool only places drafts in your email folder; a human must always review and click 'Send'.
safest
Never delete or overwrite spreadsheet rows
It can read your spreadsheet or add new rows, but it can never erase existing history.
data-safety
Other — your own answer
What kind of information will this tool need to see and hold on to?*
Select one
Basic public details and deadlines
Just grant names, due dates, and the email addresses of your team members.
low-risk
Grant values and draft notes(Recommended)
The amount of money you are asking for, plus internal notes about the project plans.
medium-risk
Other — your own answer
To keep this simple and fast to build, what should we deliberately avoid trying to solve right now?*
Select all that apply
Writing the actual grant applications(Recommended)
The tool will not try to generate the proposal text; we do that ourselves.
focused
Tracking the charity's actual bank balance
We will use our existing accounting tools for money; this is just for application deadlines.
focused
Chasing the grant funders themselves
This is purely for internal team reminders, not for emailing the people giving out the money.
internal-only
Other — your own answer
Imagine we are three months past launch. What would make you look at this tool and say, 'This was worth every penny'?*
Select one
The director saves hours of weekly admin(Recommended)
Instead of checking sheets and typing emails, you just review pre-written drafts for 10 minutes a week.
time-saver
We have missed zero deadlines
No grant opportunities slip through the cracks because someone forgot their part.
peace-of-mind
Other — your own answer
Submit Answers
Answer in your own words instead
```

### constitution — the document

```
## Project Vision

The purpose of this product is to provide a focused, lightweight web application for a solo charity director struggling with a messy spreadsheet. It tracks grant deadlines and drafts internal reminder emails. 

Unlike bloated enterprise grant-management platforms designed for large grantmakers or complex multi-team grantseekers, this application is custom-tailored for a solo user to optimize their personal efficiency and ensure they never miss critical milestones.

The "magic moment" of the application is its seamless integration with the user’s email provider. It automatically populates fully composed reminder drafts in the user’s email client, keeping the charity on track without forcing the user to manually track deadlines or draft correspondence from scratch.

### Out of Scope
* **No Grant Writing:** The system will not write, edit, format, or generate the actual grant proposals or application materials.
* **No Funder Communication:** This tool is strictly for internal tracking and team coordination. It does not interface with, send messages to, or track relationships with external grantmakers.

---

## Core Principles

* **Manual Review Only (Draft, Never Auto-Send):** Under no circumstances shall the application automatically send emails to anyone. All emails must be generated as drafts, requiring a manual, intentional click by the solo director to review and send.
* **Internal Reminders Only:** Email drafts must be addressed solely to the internal charity team (the solo director and key internal volunteers or board members) to serve as task nudges.
* **Extreme Simplicity Over Customization:** Avoid complex multi-tenant workflows, granular permission hierarchies, and heavy configuration. The tool is designed to replace a "messy spreadsheet" for a single coordinator; adding layers of enterprise settings defeats this purpose.
* **Frictionless Onboarding:** Adding, editing, and updating grant metadata must be fast and simple, minimizing administrative friction so the solo director saves measurable time.

---

## Technology Constraints

* **Backend Framework:** A lightweight, production-ready framework with first-class scheduling support (e.g., Python with FastAPI/Django or Node.js/TypeScript with Express).
* **Frontend:** A responsive, mobile-friendly interface built with a clean CSS utility library (e.g., Tailwind CSS) to ensure the solo director can easily view deadlines and manage drafts on a phone or desktop.
* **Database:** A lig
```

### constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The constitution document defines a clear vision for a lightweight grant deadline tracking tool, but suffers from significant architectural ambiguities and gaps that would prevent a coding agent from building it successfully. Specifically, the technology stack is left open-ended with multiple options, the core business logic and templates for drafting email reminders are undefined, and the authentication flow for a single-user system remains ambiguous. Tightening these specifications by committing to a single stack, outlining the exact draft triggering rules, and defining user provisioning will make the specification actionable.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (3)
Technology Constraints
Confidence score 9/10
Ambiguous tech stack choices leave architecture undecided — The backend framework, database, and background worker technologies are defined using options ('e.g., Python with FastAPI/Django or Node.js/TypeScript with Express', 'such as PostgreSQL or SQLite', 'such as Celery, Node-Cron, or pg-boss'). A coding agent cannot construct a cohesive application without a finalized, concrete technology stack choice.
Suggestion: Explicitly select and mandate a single backend framework (e.g., Node.js/TypeScript with Express), a single database (e.g., PostgreSQL), and a specific background task runner (e.g., pg-boss), removing all optional alternatives.
Architecture Constraints — Background Worker/Scheduler
Confidence score 9/10
Undefined trigger logic and email draft templates — While the Testing section mentions 'checking if the scheduler correctly identifies grants due in 30, 14, or 7 days', the core requirements do not actually define the scheduler rules for when email drafts must be generated, nor do they specify the subject line or body content templates for the generated draft emails.
Suggestion: Explicitly state the rules for reminder generation (e.g., 'Drafts must be generated exactly 30, 14, and 7 days prior to the deadline') and define the default email subject and body template structure including dynamic placeholders for grant name, funder name, deadline, and notes.
Security Constraints — User Authentication
Confidence score 8/10
Ambiguity regarding registration and single-user isolation — The product is designed for a 'solo charity director' and avoids multi-tenant complexity, but the authentication requirements (magic links or Argon2id session cooki
```
