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

## Контур доставки (`loop/`, для заказчика)

Второе приложение этого репозитория — автономный контур доставки: он принимает машинный бандл,
режет вехи, раздаёт задания исполнителям в Docker-контейнерах и показывает происходящее на
локальном дашборде. Своя база (SQLite в `loop/.data`), своя конфигурация, своя поверхность —
с платформой он встречается ровно в одном месте, в схемах бандла (`fixtures/spec-bundle/`).

**Системное требование: Docker Desktop должен быть запущен.** Контур говорит с ним через
именованный канал `\\.\pipe\docker_engine`; без Docker исполнителей запускать негде.

Настройка — один раз:

```bash
cp loop/.env.example loop/.env
```

Заполните три обязательные переменные (`ANTHROPIC_API_KEY`, `PORT`, `WORKSPACE_ROOT_PATH`);
остальные проверяются, только если заданы. Дальше (сборка + продакшен-сервер — тем же способом
контур живёт на гейтах и в собственной E2E; `PORT` передаётся переменной окружения процесса,
из `loop/.env` его читает сам контур, но не выбор порта Next):

```bash
PORT=3100 pnpm loop:serve
```

Дашборд откроется на `http://127.0.0.1:<PORT>` — по-русски, без входа и без пароля: контур слушает
только петлевой адрес, и на нём никого, кроме вас. База создаётся при первом запуске сама.

### Задумка из Telegram (приёмка Программы А)

1. Поднимите всё: мост подписки `pnpm --filter @spec-platform/loop bridge`; платформу с адаптерной цепочкой `LLM_PROVIDER_ORDER=ollama,google OLLAMA_BASE_URL=http://127.0.0.1:8091/v1 OLLAMA_CONTEXT_LENGTH=200000 LLM_REQUEST_TIMEOUT_MS=600000 pnpm local:up` (окно и предел запроса — Anthropic-класса: без первого платформа пакует под олламские 4096, без второго роняет звено на генерациях длиннее минуты); контур `PORT=3100 SPEC_PLATFORM_API_BASE=http://127.0.0.1:3000 pnpm loop:serve` с заполненными в `loop/.env` `TELEGRAM_BOT_TOKEN` и `TELEGRAM_OWNER_CHAT_ID` — и Docker Desktop.
2. Напишите своему боту задумку проекта ТЕКСТОМ и нажмите «🚀 Запустить» под его ответом.
3. Дальше руки не нужны: алерты о каждом звене придут в чат, финальный — «Проект завершён»; готовый продукт лежит в каталоге из алерта «Бандл получен» (голосовые отложены решением владельца — бот ответит именованно).

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test:boundaries && pnpm test:unit && pnpm test:e2e
```

Контур проверяется своими наборами, и оба входят в те же обязательные работы CI:

```bash
pnpm loop:typecheck && pnpm loop:test && pnpm loop:e2e
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
