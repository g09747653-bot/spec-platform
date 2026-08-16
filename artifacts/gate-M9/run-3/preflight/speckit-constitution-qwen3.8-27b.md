# GrantWatch Constitution

## Core Principles

### I. Human-in-the-Loop (NON-NEGOTIABLE)

The tool drafts reminder emails; it never sends them. Every outbound message must be opened, reviewed, and dispatched by a named human before it leaves the system. This rule is absolute and cannot be overridden by configuration, automation, or "send-all" convenience features. The system's role ends at the point of a readable, editable draft sitting in a human's outbox or review queue.

Rationale: A missed character in a grantor's name, a wrong deadline, or an awkward tone can jeopardise a funding relationship. No amount of template quality removes the need for a human eye before words leave the organisation.

### II. Deadline Reliability

The single job of the product is to ensure no grant deadline is missed. Every application record carries a due date, and the system must surface that date unambiguously well before it passes. Alerting logic is the critical path; everything else is secondary. A bug that hides or miscalculates a deadline is treated as a release-blocking defect, regardless of severity in conventional triage terms.

Minimum surfacing requirements:

- A per-application due date visible on the main list view.
- A countdown or "days remaining" indicator at a glance.
- A drafted reminder generated at least 14 calendar days before the due date and again 3 days before, unless the user has already marked the reminder as sent.

### III. One-Maintainer Simplicity

Exactly one person maintains this codebase. There is no engineering team, no on-call rota, and no budget for paid observability. Consequently:

- The codebase must be navigable in under fifteen minutes by a developer who has not seen it before.
- No service may require a separate deployment pipeline, a non-free managed service, or a dependency that has fewer than two active maintainers.
- Every new feature or abstraction must answer: "Can the sole maintainer debug, revert, and extend this in under an hour, without consulting external documentation?"
- YAGNI is enforced. No multi-tenancy, no plugin system, no microservice boundary, no real-time websocket layer.

### IV. Data Sovereignty & Portability

The charity owns its grant data. The tool is a convenience layer, not a data store the charity cannot leave.

- The system must export all application records, notes, and reminder history as a plain CSV or JSON file at any time, with one click.
- No feature may create a hard dependency on a proprietary API whose terms change without notice. If a third-party service is used (e.g., a free email provider), the interface is an adapter that can be swapped or removed.
- The primary data source today is a spreadsheet. Import must work from that spreadsheet format (`.xlsx` or `.csv`) and remain functional until the in-tool form is adopted.

### V. Zero-Cost by Default

There is no infrastructure budget. The default deployment must cost the charity nothing.

- The system must be self-hostable on a single free-tier VM, a Raspberry Pi, or a local machine behind a tunnel.
- No paid database, no paid queue broker, no paid email-send API. Outbound reminders are drafted as `.eml` files or plain-text strings that the human pastes into their existing email client.
- If a free-tier service (e.g., a no-cost email relay) is used, its rate limits and data-retention policy must be documented in the README and must not be a single point of failure.

## Security & Privacy Requirements

Grant records contain sensitive information: grantor names, amounts requested, the charity's internal strategy notes, and potentially financial accounts. The following rules apply:

- All data at rest must be encrypted. On a self-hosted instance this means the filesystem or volume-level encryption the host OS provides; on a free-tier hosted instance the platform's default disk encryption suffices.
- Authentication: a single user (or two, for the two fundraisers) with strong password or TOTP. No open endpoints. No API keys stored in the frontend.
- No application data may be transmitted to a third party in cleartext. If an outbound email relay is used, it must support TLS.
- PII minimisation: store only the fields needed to track a deadline and draft a reminder. Do not collect or retain more than the charity already holds in its spreadsheet.
- Audit log: every draft created, edited, or marked-as-sent is timestamped with the acting user. Retain at least one full grant cycle (12 months).

## Development Workflow & Quality Gates

Given a single maintainer and a tiny user base, the process is lean but non-negotiable on the critical path.

**Commit and branching:**

- Trunk-based development. No long-lived feature branches; no PRs that live longer than four working days.
- Every commit message states the user-visible effect in plain English.

**Testing gates (must pass before any merge to main):**

- Unit tests cover all deadline arithmetic, date-offset logic, and reminder-scheduling rules. Target: 100 % branch coverage on these modules.
- A golden-file test verifies that a canonical set of inputs (application name, due date, days remaining) produces the expected reminder text.
- An integration test confirms that the "draft" action writes a file whose MIME type, `To`, `Subject`, and body match the spec, and that no `send` or `deliver` call is made anywhere in the code path.

**Release process:**

- A release is cut when the maintainer runs the full test suite locally, confirms the CSV export round-trips, and tags the commit.
- The release artefact is a single static bundle (compiled frontend + server) that deploys with one `docker run` or one `curl | bash` command. No CI/CD pipeline beyond building that artefact.
- Before each release the maintainer completes a two-question checklist: (1) Can a user export all data and lose nothing? (2) Is there any code path that transmits an email without a human intervening? If the answers are yes and no, ship.

**Review:**

- Because there is one maintainer, every non-trivial change (touching deadline logic, email drafting, or auth) is reviewed as a written change summary saved in `docs/changelog.md` before the commit is pushed. The summary must state what changed, why, and which tests cover it.

## Governance

1. **Supremacy.** This Constitution takes precedence over any README, ADR, issue comment, or maintainer preference. Where a proposed feature or fix conflicts with a principle above, the principle wins unless the Constitution itself is amended.

2. **Amendment procedure.** To change or add a principle:
   - The proposer writes a short amendment document in `docs/constitution-amendments/` stating the motivation, the exact text change, and any migration or compatibility impact.
   - Because the user base is two people, the amendment is ratified when both part-time fundraisers (or their delegate) sign off in writing.
   - The amendment is merged as a single commit, the version number below is incremented, and the changelog notes the date and summary.

3. **Compliance check.** At the start of every work session the maintainer re-reads Section I (Human-in-the-Loop) and Section II (Deadline Reliability) and confirms that the task at hand does not violate either. If it does, the task is paused and the design is revisited.

4. **Guidance file.** Day-to-day implementation questions that the Constitution does not resolve (e.g., "which free-tier host?") are answered in a companion file, `docs/build-guidance.md`. That file is advisory; it cannot override this document.

5. **Scope guard.** The product serves two part-time fundraisers at one charity with roughly forty applications per cycle. Any proposal to add multi-organisation tenancy, a public grant database, or a marketplace is out of scope by default and requires a full Constitution amendment before any engineering time is spent.

**Version**: 1.0.0 | **Ratified**: 2025-07-19 | **Last Amended**: 2025-07-19