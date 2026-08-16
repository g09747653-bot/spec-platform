# GrantTracker Constitution

## Core Principles

### I. User-Centric Design  
Every feature must prioritize the needs of charity administrators and trustees; interfaces must be intuitive, require no technical training, and support common workflows like spreadsheet-based deadline tracking. Visual design must ensure accessibility for users with color blindness or low vision.

### II. Data Reliability  
The tool must accurately synchronize with external data sources (e.g., spreadsheets) and never lose or misinterpret deadlines; all data changes must be auditable via a version history; automated reminders must include a manual override for edge cases.

### III. Automation with Control  
Automated email drafting is mandatory, but users must have full control to edit, delay, or cancel reminders; no "black box" AI-generated content—drafts must be templated and customizable via plain text.

### IV. Integration Capabilities  
The tool must support importing deadlines from CSV/Excel files and exporting logs to common formats (PDF, Excel); must integrate with email clients (Outlook, Gmail) via API or plugin, and allow manual entry as a fallback.

### V. Simplicity in Features  
No "bells and whistles"—focus on deadline tracking, reminder scheduling, and email drafting. Features must be added only after user demand is proven via surveys or usage analytics.

## Additional Constraints

- **Technology Stack**: Use open-source tools (e.g., Python, React) to minimize costs and ensure long-term maintainability.  
- **Compliance**: Must comply with GDPR for any personal data handling (e.g., trustee emails).  
- **Deployment**: Host as a SaaS with free tier for small charities (<10 users); no on-premises deployment options.  
- **Performance**: Must load <2 seconds on mobile devices with 3G connectivity.  

## Development Workflow

- **Code Reviews**: All PRs must include a "user impact" statement explaining how the change affects administrators or trustees.  
- **Testing Gates**: Automated tests must cover 100% of user flows (import, reminder scheduling, email drafting). Manual testing required for edge cases (e.g., deadline conflicts).  
- **Release Process**: Features require approval from at least two charity stakeholders (non-technical) before deployment.  

## Governance

This Constitution supersedes all other practices. Amendments require:  
1. Documentation of the change in a public GitHub gist.  
2. Approval by a majority of the project’s core contributors.  
3. A migration plan for existing users.  

All PRs must include a compliance check confirming adherence to Core Principles. Complexity must be justified via a "user pain" metric (e.g., "X hours wasted per month on spreadsheet errors"). Use [GUIDANCE_FILE] for runtime development guidance.  

**Version**: 1.0.0 | **Ratified**: 2025-06-13 | **Last Amended**: 2025-06-13