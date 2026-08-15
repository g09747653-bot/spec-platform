# What the live models produced

### interview — the round asked

```
What are the small charity's staff trying to do with this tool?*
Select all that apply
Track application deadlines
The tool helps them see due dates for different grants
Compose reminder emails
It automatically drafts emails to remind them about deadlines
Manage resources
They use it to organize their time and team resources more effectively
Other — your own answer
What is painful about what the staff does today?*
Select all that apply
Manually tracking deadlines
They spend a lot of time checking grant websites and calendars
Missing application deadlines
Sometimes they forget or delay due to busy schedules
Poor communication among team members
They struggle to keep each other updated on deadline progress
Other — your own answer
What would make this tool obviously worth using?*
Select all that apply
Saving time by automating tasks
It allows them to work on other important things
Increasing productivity through better management
Helps the charity submit more applications in less time
Securing better funding outcomes due to timely submissions
Makes them highly unlikely to miss any important deadlines
Other — your own answer
Submit Answers
Answer in your own words instead
```

### constitution — the round asked

```
Which of the following should the deadline tracking tool NEVER do, no matter what?*
Select all that apply
Never track personal information like social security numbers or private correspondence.(Recommended)
Ensuring privacy by not collecting sensitive data.
Never prepare emails that propose changes to grant agreements without a person approving them first.
Prevent the tool from taking actions that could alter legal obligations.
Other — your own answer
How sensitive do you think the data in this tool is?*
Select all that apply
Highly sensitive; any breach would be devastating.
Data includes all financial and personal details of grant recipients.
Normal business data; a breach would impact operations, but is not highly compromising.(Recommended)
Includes basic contact information and project deadlines, nothing more.
Other — your own answer
When launched, which of these features would you tell the tool developers to leave for future updates?*
Select all that apply
Automatic filing of reports directly with grant providers.
This is complex and needs extra security clearance.
Integrating with the charity's accounting software for financial reporting.
Complex integration now would delay launch, compromising time efficiency.
Other — your own answer
Submit Answers
Answer in your own words instead
```

### rev-1 — the document

```
## Project Vision

The project aims to develop a tool that streamlines the process of tracking grant application deadlines and drafting reminder emails for a small charity. The primary goal is to alleviate the administrative burden of manual deadline tracking, ensuring no grant applications are missed due to oversight.

This tool will empower charities to stay organized and compliant with funders' requirements without tying up valuable staff time that could be spent on mission-critical activities such as direct service delivery or fundraising. Overall, it seeks to increase efficiency and trust in the charity's operations, ultimately leading to higher grant win rates and better resource allocation.

## Core Principles

### Transparency
Ensure all aspects of the tool are transparent and comprehensible to end users.
- Clear documentation for both technical staff and end-users about how the system works and integrates with other technologies.
- Regular updates on performance metrics directly within the tool’s interface.

### Integrity 
Preserve user data integrity by providing reliable, error-free operations.
- Consistent data verification processes before actions are taken in the application.
- Automatic backups to prevent data loss and support easy recovery options.

### Accessibility
Make the system easy to use for staff with varying levels of technical expertise.
- Intuitive interfaces that require minimal training.
- Support through manuals, tutorials, and a dedicated help desk.

### Privacy 
Strictly adhere to data privacy regulations and ethical practices.
- Never track personal information beyond what is strictly necessary for operations.
- Provide detailed control over who can access and modify specific segments of the tool’s functionality.

## Technology Constraints

The following constraints inform our technology choices:

1. **Open Source & Commercial Databases**: Utilize either open-source or commercially licensed databases based on performance characteristics, cost efficiency, and license terms that permit embedding.
2. **Front-End Technologies**: Use modern JavaScript frameworks to ensure a responsive user interface across various devices and browsers, supporting web accessibility standards.

## Architecture Constraints

1. **Platform Independence**: Ensure the primary application operates independently of specific operating systems or cloud providers wherever feasible through containerized deployment models like Docker.
   
2. **Modular Archite
```

### rev-1 — the review board

```
CONSTITUTION · REVIEW

Needs Revision

The constitution document includes several useful sections such as Vision, Core Principles, Technology Constraints, Architecture Constraints, Testing Approaches, Coding Standards, Security Constraints, Performance Targets, and Integration Points. However, some parts are either vague or leave gaps that could confuse the development process.

Ticked points are the ones a rewrite would apply. Nothing advances until you decide.

Must Fix (2)
Ambiguous update frequency
Confidence score 8/10
Core Principles — Transparency
The section mandates 'regular updates on performance metrics directly within the tool’s interface' but does not specify a frequency or criteria for what constitutes regularity.
Suggestion: Define specific intervals and conditions under which performance metric updates should appear, such as weekly reports during business hours starting from Monday to Friday.
Undefined end-to-end scenarios
Confidence score 9/10
Testing Approaches — End-to-End (E2E) Testing
'Perform thorough end-to-end scenarios...' is too vague and doesn't spell out what 'thorough' entails or provide specific criteria for defining comprehensive user interactions.
Suggestion: Enumerate examples of expected use cases as E2E scenarios, such as 'from logging in to completing a grant application reminder setup,' and establish detailed success benchmarks for these flows.
Recommendations (2)
Lack of specific syntax rules
Confidence score 7/10
Coding Standards — Code Style Guidelines
The document mentions adhering to 'consistent code style guidelines' without specifying which coding conventions should be followed or how they will be enforced.
Suggestion: Recommend a well-known style guide like ESLint for the project and include rule sets in development documentation.
Vague permission boundaries
Confidence score 7/10
Security Constraints — Access Control Restrictions
The requirement to implement 'role-based permission systems' is too broad; specifics are needed on how different user roles will be defined and accessed.
Suggestion: Define detailed role maps specifying access entitlements for each permission level, such as admin, manager, developer etc... along with documentation of how authentication will enforce these rules.
Accept feedback
Request changes
Ignore
```

### rev-2 — the document

```
## Project Vision

The project aims to develop a tool that streamlines the process of tracking grant application deadlines and drafting reminder emails for a small charity. The primary goal is to alleviate the administrative burden of manual deadline tracking, ensuring no grant applications are missed due to oversight.

This tool will empower charities to stay organized and compliant with funders' requirements without tying up valuable staff time that could be spent on mission-critical activities such as direct service delivery or fundraising. Overall, it seeks to increase efficiency and trust in the charity's operations, ultimately leading to higher grant win rates and better resource allocation.

## Core Principles

### Transparency
Ensure all aspects of the tool are transparent and comprehensible to end users.
- Clear documentation for both technical staff and end-users about how the system works and integrates with other technologies.
- Regular updates on performance metrics directly within the tool’s interface.

### Integrity 
Preserve user data integrity by providing reliable, error-free operations.
- Consistent data verification processes before actions are taken in the application.
- Automatic backups to prevent data loss and support easy recovery options.

### Accessibility
Make the system easy to use for staff with varying levels of technical expertise.
- Intuitive interfaces that require minimal training.
- Support through manuals, tutorials, and a dedicated help desk.

### Privacy 
Strictly adhere to data privacy regulations and ethical practices.
- Never track personal information beyond what is strictly necessary for operations.
- Provide detailed control over who can access and modify specific segments of the tool’s functionality.

## Technology Constraints

The following constraints inform our technology choices:

1. **Open Source & Commercial Databases**: Utilize either open-source or commercially licensed databases based on performance characteristics, cost efficiency, and license terms that permit embedding.
2. **Front-End Technologies**: Use modern JavaScript frameworks to ensure a responsive user interface across various devices and browsers, supporting web accessibility standards.

## Architecture Constraints

1. **Platform Independence**: Ensure the primary application operates independently of specific operating systems or cloud providers wherever feasible through containerized deployment models like Docker.
   
2. **Modular Archite
```

### rev-2 — the review board

```
CONSTITUTION · REVIEW

Pass

The revised constitution addresses both the specified requirements for enumerated end-to-end testing scenarios and inclusion of a specific code style guide like ESLint. The document adheres to the technical instructions provided without introducing new issues.

The reviewer found nothing to raise. Nothing advances until you decide.

Accept feedback
Request changes
Ignore
```

### cycle 1 — what the writer said it was folding in

```
I am incorporating undefined end-to-end scenarios by listing specific examples such as "logging in to completing a grant application reminder setup" and including detailed success benchmarks for these workflows. Additionally, I recommend adopting ESLint with specified rule sets to address the lack of specific syntax rules in code style guidelines. These changes are mechanical, and I am not making any decisions on behalf of the user beyond what was directed.
```
