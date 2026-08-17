# GrantTracker Constitution
## Core Principles

### I. Reliability-First
All data handling must ensure accuracy and trustworthiness; Data sources must be validated against multiple formats; Deadlines must be cross-referenced with calendar systems; No assumptions allowed without explicit verification

### II. Automated Reminders
Every grant application must trigger scheduled email drafts; Templated emails must include customizable fields; Email scheduling must align with deadline thresholds; Support for multiple email formats (plaintext, HTML)

### III. Test-First (NON-NEGOTIABLE)
TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced; All CLI outputs must pass schema validation

### IV. Spreadsheet Integration
Primary data source must be synchronized with Excel/Google Sheets; Support for CSV/ODS formats; Data validation rules enforced; Schema changes require backward compatibility guarantees

### V. User-Centric Design
Interface must be accessible to non-technical users; Error messages must be actionable; Documentation must include tutorial walkthroughs; UX reviewed by charity administrators

## Additional Constraints
Technology stack requirements: Python 3.10+, SQLite 3.35+, Pandas 1.5+, SMTP TLS; Compliance standards: GDPR, ISO 27001; Deployment policies: Containerized microservices; Security requirements: Input sanitization, rate limiting

## Development Workflow
Code review requirements: All PRs must pass automated testing; Reviewers must verify compliance with core principles; Testing gates: Unit tests ≥90%, integration tests ≥80%; Deployment approval process: Staged rollouts with rollback protocols; Documentation gates: API docs updated with every release

## Governance
Constitution supersedes all other practices; Amendments require documentation, approval, migration plan; All PRs/reviews must verify compliance; Complexity must be justified; Use [GUIDANCE_FILE] for runtime development guidance

**Version**: 1.0.0 | **Ratified**: 2025-06-13 | **Last Amended**: 2025-06-13