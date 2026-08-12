# Deployment (task 9)

Implements the Deployment & Operations section of `.specs/solution.md`: one Vercel project,
production plus per-PR preview deployments, migrations applied by a deploy step.

The repository side is done — `vercel.json` runs `pnpm db:migrate` before `pnpm build`, so
**pending migrations are applied before the new build is served**. The rest is Vercel project
configuration, which lives in the Vercel dashboard rather than in this repository. This file is
the exact checklist for it.

## 1. Connect the repository

Import `g09747653-bot/spec-platform` as a new Vercel project. Framework preset: Next.js.
Leave the build and install commands untouched — `vercel.json` already supplies them.

## 2. Environment variables

Set these as **server-side** variables. None may be prefixed `NEXT_PUBLIC_`: no value here is
allowed to reach a client bundle (constitution S1; NFR-006).

| Variable       | Production                                   | Preview                                   |
| -------------- | -------------------------------------------- | ----------------------------------------- |
| `DATABASE_URL` | Neon **production** branch connection string | Neon **preview** branch connection string |

The preview environment must point at the preview branch, so a pull request never migrates or
writes to production data. Everything else in the Configuration table of `solution.md` is
optional until its milestone (`.specs/decisions.md` D-8) and is added then:

- Milestone 1 — `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID/_SECRET`, `AUTH_GITHUB_ID/_SECRET`
- Milestone 3 — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- Milestone 5 — `BLOB_READ_WRITE_TOKEN`, `WEB_SEARCH_API_KEY`
- Milestone 8 — `SENTRY_DSN`

`AUTH_URL` differs per environment and must match the deployment's own origin.

## 3. Migration deploy step

Already wired: `vercel.json` → `"buildCommand": "pnpm db:migrate && pnpm build"`.

Because `scripts/db-migrate.mjs` takes its target purely from `DATABASE_URL`, the same command
migrates the preview branch for a preview deployment and the production branch for a production
deploy — no branching logic, no second script.

A failing migration fails the build, so a broken migration never reaches traffic.

## 4. Verifying the acceptance criteria

Both criteria are observable in the Vercel dashboard once the project exists:

1. **A pull request produces a preview deployment bound to the preview database branch.**
   Open a pull request; confirm the preview deployment's build log shows `Migrations applied.`
   and that the Neon **preview** branch is the one that gained the migration row
   (`select * from drizzle.__drizzle_migrations`).
2. **Production deploy applies pending migrations before serving traffic.**
   Merge to `main`; the same line must appear in the production build log, before the Next.js
   build output, against the production branch.

## 5. Notes

- `.vercel/` is git-ignored; do not commit local project linkage.
- Generation route handlers will need an extended `maxDuration` (solution.md — Scaling Strategy).
  That is set per route in Milestone 3 when the streaming handler exists, not globally here.
