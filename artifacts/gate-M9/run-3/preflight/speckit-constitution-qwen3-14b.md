# GrantTracker Constitution

## Core Principles

### I. User-Centric Design  
Every feature must directly support the fundraisers' workflow; No interface complexity beyond basic spreadsheet-style data entry and email drafting; Prioritize speed of implementation over technical debt accumulation.

### II. Data Sovereignty  
Deadline data remains the charity's responsibility; Tool must import/export data via plain-text CSV; No automatic synchronization with external systems without explicit user configuration.

### III. Human-in-the-Loop (NON-NEGOTIABLE)  
All email drafting must be explicitly triggered by user action; No automated sending allowed; Emails must be viewable in the tool before dispatch, with clear "Send" and "Cancel" controls.

### IV. Test-First  
Critical paths (deadline tracking, email drafting) require 100% test coverage; Tests must validate both data flows and UI interactions; Acceptance criteria must include manual verification by fundraisers.

### V. Minimalist Architecture  
Use only open-source libraries with no external dependencies; Favor client-side JavaScript for UI; Backend must run on standard Python/Flask stack with SQLite; No cloud services allowed.

## Additional Constraints

Technology stack must be:  
- Frontend: Vanilla HTML/CSS/JavaScript (no frameworks)  
- Backend: Python 3.10+ with Flask  
- Database: SQLite (file-based, no server required)  
- Hosting: Static files served from GitHub Pages; Backend runs locally on fundraiser's machines  

Compliance requirements:  
- No data transmission over internet without explicit user action  
- All emails must be draftable offline and sent via charity's existing email client  
- Must support manual entry of deadlines from physical spreadsheets  

## Development Workflow

All changes require:  
1. Manual test plan documenting how user workflows will be validated  
2. Code review by maintainer (no external reviewers)  
3. Test coverage report showing ≥85% branch coverage for critical paths  
4. Approval from charity's IT lead for any third-party library inclusion  

Quality gates:  
- No new features allowed without demonstrable benefit to deadline tracking accuracy  
- Email templates must pass "readability check" (Flesch-Kincaid score ≥60)  
- All UI changes must be approved by both fundraisers in advance  

## Governance

This Constitution overrides all other practices; Amendments require:  
1. Written proposal from maintainer  
2. Approval by both fundraisers  
3. Migration plan ensuring zero data loss  

All code must comply with:  
- [PRINCIPLE_1_NAME] (User-Centric Design)  
- [PRINCIPLE_3_NAME] (Human-in-the-Loop)  
- [SECTION_2_NAME] (Additional Constraints)  

**Version**: 1.0.0 | **Ratified**: 2023-11-01 | **Last Amended**: [LAST_AMENDED_DATE]