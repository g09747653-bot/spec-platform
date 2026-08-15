# M9п gate — what the models said

### speckit-greenfield-v1-interview — the round asked

```
When we get this running, who is actually going to open this tool on a Monday morning to check on things?*
Select one
A single founder or volunteer(Recommended)
One person who does almost everything and just needs a quick, clear way to not forget deadlines.
A couple of board members or part-time staff
Two or three people who share the work and need to see who is handling which application.
An outside grant writer
A freelancer we hire occasionally who needs to see what we've assigned to them.
Other — your own answer
How are you keeping track of these due dates right now, and what's the most frustrating part about it?*
Select one
A shared spreadsheet that keeps getting out of date(Recommended)
We try to use Excel or Google Sheets, but we forget to update it, and we have to manually check it constantly.
Personal calendars and phone reminders
Deadlines are buried in personal calendars, meaning details get lost if that person is busy or away.
Flagged emails and sticky notes
We rely on keeping emails 'unread' or writing notes down, which makes it easy to miss a date entirely.
Other — your own answer
When a deadline is coming up and it's time to write a reminder email, how do you want the tool to help you?*
Select one
Show me a draft on the screen that I can copy or click to send(Recommended)
The tool shows the upcoming deadline and provides a ready-to-go email draft right there on the dashboard.
Email the draft directly to me
The tool sends an email to my personal inbox saying 'Here is your draft for the upcoming deadline' so I can forward it.
Send it automatically without me reviewing it
The tool should just email the relevant team member or partner automatically when the date gets close.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the round asked

```
What is the most important thing this tool should never forget to do?*
Select all that apply
Always show which grant applications are due on any given day.
User needs clear visibility of deadlines at all times.
Never send emails without permission.
Maintains user control over communications.
Always include the full grant application text when drafting reminder emails.
Ensures drafts contain accurate background information
Make sure every task related to a grant is completed before showing any reminders for that grant.
User might feel overwhelmed if all pending tasks are shown.
Always provide the template with default values filled out according to current application status.
Helps users quickly review or revise their drafts
Never create emails directly, only help draft them.
Ensures the user keeps control of final email composition
Other — your own answer
How sensitive is the information this tool will handle?*
Select all that apply
Non-sensitive: Names of grant-makers and due dates, but no financial details.
Primarily administrative contact and schedule data.
Sensitive: Includes financial information about the charity’s budget.
Requires handling sensitive fiscal data carefully
Extremely Sensitive: Involves donor and beneficiary personal data.
Necessitates strict privacy measures
Other — your own answer
What should this tool avoid doing initially?*
Select all that apply
Do not handle grant applications that are overdue.
Starts by focusing on upcoming opportunities.
Avoid integrating with external email clients automatically; allow manual copying instead.
Keeps control and ease-of-use considerations balanced
Stay away from managing the full lifecycle of applications (submit, review responses).
Sticks to monitoring deadlines and drafting emails initially
Other — your own answer
Submit Answers
Answer in your own words instead
```

### speckit-greenfield-v1-constitution — the document

```
# DonationReminder Constitution

## Core Principles

### I. Library-First

Every feature starts as a standalone library; Libraries must be self-contained, independently testable, and documented. Each library requires clear purpose—no organizational-only libraries allowed.

### II. CLI Interface

Every library exposes functionality via a command-line interface; Input/output uses plain text protocols (stdin/inputs → stdout, errors → stderr); Supports both JSON and human-readable formats interchangeably.

### III. Test-First (NON-NEGOTIABLE)

Test-driven development is mandatory: Tests written first → User approval if necessary → Expected failures seen in implemented code → Then implement code; Follow the Red-Green-Refactor cycle strictly at all times.

### IV. Integration Testing

Focus on testing integration areas like new library contract tests, contract changes between components, inter-service communication protocols, and shared schema compatibility across libraries.

### V. Simplicity

Keep development simple by starting small and expanding with necessity rather than adding features ahead of time based only on speculation. (YAGNI: You Aren't Gonna Need It)

## Security Requirements

In addition to the core principles, all code must adhere to strict security practices:
1. Implement input validation consistently.
2. Use secure coding standards for data handling and storage.
3. Conduct regular security audits.

## Development Workflow

1. Code reviews must verify compliance with this constitution.
2. Quality gates ensure that every pull request meets the predefined standard before deployment.
3. Documentation of all features is mandatory and must be included in the code review process.
4. All developers are required to attend bi-weekly training sessions on security best practices.

## Governance

This constitution supersedes any other procedures or conventions within DonationReminder. Amendments require thorough documentation, a formal approval from the development team lead, and a clear migration plan for implementation.

**Version**: 1.0.0 | **Ratified**: September 30, 2023 | **Last Amended**: N/A
```

### speckit-greenfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The document lacks clarity on the exact nature of integration testing and leaves room for interpretation on how to implement CLI interface requirements in a way that ensures all aspects are consistently adhered to by developers.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Ambiguous Scope of Tests
Confidence score 9/10
IV. Integration Testing
The guidance for integration testing does not specify what constitutes acceptable test coverage, nor how to determine if the tests adequately cover new library contract tests and changes between components.
Suggestion: Define clear criteria or specific types of scenarios that should be covered by each type of test mentioned in this section.
Lack of Implementation Guidelines for CLI
Confidence score 8/10
II. CLI Interface
The requirements for the command-line interface are stated vaguely, without clear guidelines on how to implement support for both JSON and human-readable formats simultaneously or what constitutes interoperable protocols.
Suggestion: Provide examples or best practices for implementing a versatile CLI that supports both output formats seamlessly based on input given by the user.
Recommendations (2)
Ambiguous Governing Document Reference
Confidence score 7/10
# DonationReminder Constitution
It is not clear whether 'DonationReminder Constitution' refers to this document or an external governance policy.
Suggestion: Explicitly state that the constitution specifically pertains to internal development practices within a project named DonationReminder.
Undefined Basic Security Practices
Confidence score 8/10
## Security Requirements
Core security requirements are general and do not outline what specific steps should be taken regarding validation, coding standards, and audit processes to ensure compliance.
Suggestion: Detail basic principles such as avoiding hard-coded keys and validating all inputs, and specify any recommended tools or procedures for conducting audits on regular intervals.
Accept feedback
Request changes
Ignore
```

### speckit-greenfield-v1-requirements — the round asked

```
What are the main actions someone should be able to do with this tool?*
Select all that apply
Add a new grant application to track
User adds information about a grant they want to apply for
Update and manage deadlines for applications
User sets due dates, checks progress against deadlines
Check an overview of upcoming grants
User sees a summary of all upcoming grant deadlines
Generate drafts of reminder emails
Tool automatically provides the text to copy and send for reminders about approaching deadlines
Share access with collaborators or guests
User allows other team members (or even trusted friends) to view or update information in the tool
Other — your own answer
What should happen automatically without the user asking?*
Select all that apply
Send reminders to users about upcoming deadlines
Tool sends email or in-app alerts when a deadline is coming up
Update application status based on submission date
Tool marks grant applications as submitted automatically after the user inputs that date
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-interview — the round asked

```
What are the users of this tool trying to achieve with it on a Monday morning?*
Select all that apply
Draft reminder emails for upcoming deadlines
Users would use the tool primarily to draft reminder emails for grant application deadlines coming up in the week.
Track the status of grant applications
Users would rely on the tool to keep an overview of which applications have been submitted and their current state.
Other — your own answer
What process do users follow currently for preparing reminder emails for grant deadlines?*
Select all that apply
Manually tracking dates and writing email drafts
Users manually log due dates in a spreadsheet or calendar, then draft reminder emails individually.
Using pre-written email templates
Users use standardized templates but still spend time inserting specific details for each grant.
Other — your own answer
What is the most frustrating part of this current process?*
Select all that apply
Time-consuming to draft emails individually
Each reminder email for every grant needs dedicated time, even though emails are often very similar.
Relying on memory or checking multiple sources for deadlines
Risk of overlooking upcoming deadlines due to scattered information tracking.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the round asked

```
What absolute rules should the tool follow?*
Select all that apply
Prevent any sensitive information from being leaked or misused
Ensures data security and compliance with privacy laws
Only communicate with grant agencies, no direct email to applicants
Limits the tool's scope to interactions with official bodies
Never replace manual tasks that bring value, like crafting emails by hand
Preserves human judgment and creativity in processes where it's important
Always respect the exact deadlines provided without any adjustments
Ensures deadlines are met precisely as given
Other — your own answer
What kind of information will this tool manage?*
Select all that apply
Private organization data like application status and deadlines
Includes sensitive details about each grant application's lifecycle
Public contacts of grant agencies and templates for standard letters
Contains basic public information to facilitate communication
Confidential staff notes and meeting minutes related to applications
Includes internal communications that should be kept strictly confidential
Other — your own answer
What tasks or features does the tool not need to support initially?*
Select all that apply
Track application progress beyond just deadlines
Exclude features that monitor the entire status of applications
Manage other documents besides reminder emails
Does not include functionality for storing or tracking related documentation
Connect with external application management systems
Avoid integrating directly with third-party platforms until proven necessary
Other — your own answer
Submit Answers
Answer in your own words instead
```

### myspec-brownfield-v1-constitution — the document

```
# Change Proposal: Grant Application Reminder Tool

## Context

The small charity currently tracks grant application deadlines manually, which is often time-consuming and prone to inaccuracies. This manual process involves keeping separate notes, emails, or spreadsheets for different grants and their respective due dates. Charity staff spend considerable time drafting reminder emails for upcoming deadlines without any dedicated tool to organize these tasks seamlessly with their existing workflow.

## Proposed Change

The proposed change introduces a specialized tool that streamlines tracking grant application deadlines and automatically drafts reminder emails when necessary. This automates the process of manually checking grants and composing reminders, thereby minimizing the risk of missing important submission dates. The new system aims to offer centralized management for all active grant applications with due diligence notifications tied directly to email drafting capabilities, aiming to reduce manual administrative overhead.

## Scope

This project will exclusively focus on developing a tool that:

- Tracks active grant application deadlines.
- Automatically drafts and sends reminder emails based on specified intervals before each deadline.
- Ensures data privacy in compliance with the charity's constitution regarding private data handling and restriction against data leakage.

This change does not encompass:

- Managing post-award compliance or financial reporting for awarded grants.
- Implementing broader management functions such as donor relationships, program tracking, or fundraising activities.
- Developing a comprehensive grant management software suite for other nonprofit functionalities.

## Impact

The proposed change will impact the following areas of the existing system:

- **Data Layer:** Integration with the charity's database to fetch, update and store information on active grants to ensure the tool can retrieve deadlines accurately and send reminders promptly. The integration must also enable secure access while adhering to data privacy policies.
  
- **Workflow Automation:** Workflow automation will enhance the manual task of sending reminder emails to trigger these actions automatically through system-defined rules before submission due dates.

### Interfaces
- Users will interact directly with the application interface for entering and managing grant deadlines, as well as setting reminder preferences. The tool's interface should be s
```

### myspec-brownfield-v1-constitution — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The document provides an incomplete risk assessment and does not specify acceptance criteria for the proposed system.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Inadequate Risk Assessment
Confidence score 8/10
Risks & Open Questions — Risks
The 'Data Security' risk mentions compliance but there is no specified requirement or validation method to ensure secure data handling. The scope needs a detailed security specification and testing approach.
Suggestion: Include specific criteria for data encryption, access controls, logging, and regular audits to mitigate the Data Security risk thoroughly.
Missing Acceptance Criteria
Confidence score 8/10
Proposed Change — Scope
There are no clear acceptance criteria that specify how success of a developed tool will be verified. The proposal states various functionalities but lacks concrete conditions for testing these features in an assessment.
Suggestion: Detail specific test cases verifying the automatic drafting and sending of reminder emails, data integrity during synchronization with existing systems, user interface intuitiveness and accessibility.
Recommendations (1)
Clarify Data Synchronization
Confidence score 7/10
Risks & Open Questions — Open Questions
The document poses the data synchronization question without a clear recommendation or approach. This leaves open how to ensure synchronization occurs securely and efficiently.
Suggestion: Recommend that development team research existing integration protocols between the charity's database and potential CRMs, ensuring they adhere to privacy policies while enabling seamless update of grant information in real-time.
Accept feedback
Request changes
Ignore
```

### myspec-brownfield-v1-requirements — the round asked

```
What do users of this tool do with grant deadlines?*
Select all that apply
Check when their application deadlines are.
Users need to see upcoming and past due dates for grants they're applying for.
Add new grant applications with deadlines.
New opportunities may come up that weren't in the initial list.
Edit existing application deadlines.
A deadline can be postponed, or details of an opportunity might change.
Remove applications from tracking.
An organization might decide not to pursue an opportunity anymore.
Other — your own answer
How does the tool help users after they mark a deadline?*
Select all that apply
Draft reminder emails.
Automatically generates content for an email that reminds about a specific grant.
Send email reminders automatically.
Sends the drafted reminder email at a predetermined time before each deadline by default.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### Edit — the Describe prefill

```
I want to update spec constitution.md to 
```
