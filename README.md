# Spec Platform

A hosted web application that turns a plain-language prompt into a complete, versioned,
agent-ready specification bundle through a guided, staged interview:

`Interview → Constitution → Requirements → Solution → Tasks → (optional Quality) → Export`

The whole session lives in one conversation feed: messages, question rounds, stage chips, document
cards and AI review boards. Generation streams and survives a reload; every stage advance is an
explicit human decision, enforced by a state machine rather than by model judgement.

## The specification bundle governs this repository

The project is defined by the documents in [`.specs/`](.specs), and they take precedence over
anything written here:

| File                                        | What it holds                                                  |
| ------------------------------------------- | -------------------------------------------------------------- |
| [`constitution.md`](.specs/constitution.md) | Non-negotiable principles. Conflicts resolve in its favour.    |
| [`requirements.md`](.specs/requirements.md) | What the product does (FR/NFR/DR/IR with acceptance criteria). |
| [`solution.md`](.specs/solution.md)         | How it is built (modules, contracts, decisions).               |
| [`tasks.md`](.specs/tasks.md)               | The plan, with dependencies and traceability.                  |
| [`execution.md`](.specs/execution.md)       | Gates, decision levels, session protocol.                      |
| [`decisions.md`](.specs/decisions.md)       | The decision log, blockers and amendments.                     |

## Getting started

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

`DATABASE_URL` is the only variable required to boot; the rest are validated by
[`src/config/env.ts`](src/config/env.ts) and named individually when missing. Deployment steps are in
[`docs/deployment.md`](docs/deployment.md).

## Локальный режим (для заказчика)

Вся платформа на вашей машине: без облака, без OAuth и без входа — сессия владельца создаётся
автоматически, данные живут в каталоге `.local/db` рядом с проектом и переживают перезапуск.
Ключи моделей читаются из вашего `.env`, как обычно.

Три команды:

```bash
pnpm install
```

```bash
pnpm local:up
```

```bash
pnpm local:down
```

Первая ставит зависимости (нужна один раз). Вторая поднимает базу и приложение и печатает адрес —
`http://127.0.0.1:3000`. Третья гасит всё; данные остаются, следующий `pnpm local:up` продолжит с
того же места.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test:boundaries && pnpm test:unit && pnpm test:e2e
```

All five run in CI and block a merge. `test:e2e` needs the local Postgres-compatible test server:

```bash
pnpm db:test-server
```

## Methodologies

A methodology is a configuration of the workflow graph — its stages, their documents, the file names
they export, their budgets, and the templates the writer follows
([`src/modules/methodologies`](src/modules/methodologies)). Five ship today: MySpec greenfield (the
default) and brownfield, SpecKit greenfield, OpenSpec brownfield, and the MySpec edit workflow.

## NOTICE

This repository vendors document templates from two open-source projects. Each copy lives beside the
licence it is distributed under, in `src/modules/methodologies/templates/`:

| Material                                                             | Source                                                        | Licence                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `templates/*.md` — constitution, spec, plan, tasks                   | [github/spec-kit](https://github.com/github/spec-kit)         | MIT — [`src/modules/methodologies/templates/speckit/LICENSE`](src/modules/methodologies/templates/speckit/LICENSE)   |
| `schemas/spec-driven/templates/*.md` — proposal, spec, design, tasks | [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | MIT — [`src/modules/methodologies/templates/openspec/LICENSE`](src/modules/methodologies/templates/openspec/LICENSE) |

The files are copied verbatim. `src/modules/methodologies/templates/vendored.ts` is generated from
them by `node scripts/build-methodology-templates.mjs`, and a unit test fails the build if the
generated module and the vendored markdown ever disagree.

Templates under `templates/myspec/` are this project's own work and vendor nothing.
