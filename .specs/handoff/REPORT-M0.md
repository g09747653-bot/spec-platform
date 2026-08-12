# REPORT-M0 — рапорты исполнителя по Milestone 0

> Пишет исполнитель. Новые раунды — секцией сверху. Форма: СТАТУС / СДЕЛАНО / ТЕСТЫ-CI / DECISIONS / BLOCKED / НУЖНО ОТ ЗАКАЗЧИКА / СЛЕДУЮЩИЙ ШАГ.

## Раунд 2 — 2026-08-12 · закрытие M0, часть 1 (push + первый CI)

СТАТУС: задание раунда выполнено полностью — push прошёл, первый прогон CI зелёный с первой попытки, чинить было нечего. M0 остаётся частично закрытым: 8 задач из 10 отмечены; 8 и 9 ждут внешних действий (branch protection, Vercel), которые Архитектор отнёс к следующему раунду.

СДЕЛАНО:

- Записаны решения по вердикту раунда 1: амендмент `A-1` в разделе Amendments (`decisions.md`) и `D-11` (локальный Firefox не чинится, матрица проверяется на CI, локально допустимы chromium+webkit).
- Принят файловый handoff-протокол: `.specs/handoff/` закоммичен, правки `CLAUDE.md` (п. 10) и `execution.md` §2 вошли в коммит `4b94020`.
- `git push -u origin main` → ветка `main` создана в `g09747653-bot/spec-platform`; запушены три коммита: `670f709` (M0), `c3a0376` (BLOCKED-записи), `4b94020` (handoff + A-1 + D-11).
- Задача 5 закрыта по AC: чекбокс отмечен в `tasks.md`. BLOCKED-записи задач 5 и 8 в `decisions.md` помечены снятыми с указанием, чем именно закрыты.

ТЕСТЫ/CI: прогон **31611334337** (event: push, sha `4b94020`), вывод `gh run view` — `"conclusion":"success"`, оба job'а `success`:

- **Lint, boundaries, types, unit** — 41 c. `All matched files use Prettier code style!`; `eslint .` без ошибок; boundary-фикстуры — 4 `ok rejected` + 1 `ok allowed`, `Boundary fixture check passed (5 fixtures)`; `tsc --noEmit` чист; Vitest `Test Files 2 passed (2)`, `Tests 12 passed (12)`.
- **End-to-end (Chromium, Firefox, WebKit)** — 3 м 02 с. `Running 3 tests using 1 worker` → **`3 passed (18.2s)`**. **Firefox на ubuntu-latest проходит.** Доказательство соответствия: `pnpm exec playwright test --list` даёт ровно `[chromium]`, `[firefox]`, `[webkit]` × один смоук = `Total: 3 tests in 1 file`, то есть «3 passed» — это все три проекта. Локально по-прежнему зелены только chromium+webkit (D-11).

Некритичное наблюдение (не дефект, ничего не ломает): GitHub аннотирует прогон предупреждением, что `actions/upload-artifact@v4`, `actions/cache@v4` и `pnpm/action-setup@v4` объявляют Node.js 20 и принудительно исполняются на Node.js 24. Записано в Backlog `decisions.md`, не реализовано.

DECISIONS: новые — `A-1` (амендмент, Amendments) и `D-11`. Прежние `D-1 … D-10` без изменений.

BLOCKED: снято две записи (задачи 5 и 8 — обе помечены СНЯТ в `decisions.md` с указанием прогона CI). Остаётся одна: `BLOCKED task 9` (нет доступа к Vercel).

НУЖНО ОТ ЗАКАЗЧИКА (для закрытия чекбоксов 8 и 9):

1. **Branch protection на `main`** — у исполнителя нет прав (`gh api repos/... --jq .permissions` → `admin:false`), защита сейчас отсутствует (`/branches/main/protection` → 404). Нужно сделать required status checks ровно два: `Lint, boundaries, types, unit` и `End-to-end (Chromium, Firefox, WebKit)`; required approvals = 0 согласно амендменту `A-1`. Без этого AC задачи 8 («PR с падающим тестом / с запрещённым импортом нельзя влить») не выполнен: пайплайн делает падение видимым, блокирующим его делает branch protection.
2. **Vercel** — импорт репозитория и `DATABASE_URL` раздельно для Production (ветка production Neon) и Preview (ветка preview). Пошаговый чек-лист и способ проверки обоих AC — `docs/deployment.md`.

СЛЕДУЮЩИЙ ШАГ: жду новый `START_HERE.md`. Когда branch protection будет включена, проверю AC задачи 8 честно — PR с намеренно падающим unit-тестом и PR с запрещённым cross-module импортом должны стать неvливаемыми; после этого отмечу чекбокс 8. Чекбокс 9 отмечу после проверки обоих AC по журналам сборки Vercel. M1 не начат.

## Раунд 1 — 2026-08-12 (перенесено Архитектором из чата; вердикт: условно принято, см. decisions.md A-1, D-11)

СТАТУС: M0 частично — 7 задач из 10 приняты по AC; задачи 5, 8, 9 упираются во внешние ресурсы (доступ к GitHub-репозиторию, Vercel, запуск Firefox на этой машине).

СДЕЛАНО: 1, 2, 3, 4, 6, 7, 10 — чекбоксы отмечены в `tasks.md`. Задачи 5, 8, 9 выполнены в части, которая живёт в репозитории, но их AC не проверены — чекбоксы намеренно не отмечены.

- 1 — Next.js 16 App Router + React 19, `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`. Проверено: `tsc` чист, на неявном `any` даёт exit 2, placeholder-роут отдаёт 200.
- 2 — ESLint 10 (typescript-eslint strict + type-checked) и Prettier. Проверено: `const x: any = 1` и `v!.length` валят `pnpm lint`; несформатированный файл валит `pnpm format:check`.
- 3 — дерево модулей с `index.ts`; таблица разрешённых рёбер закодирована один раз в `eslint.boundaries.js` и используется обоими конфигами. `pnpm test:boundaries` проверяет 4 запрещённых ребра (в т.ч. все три из AC) и 1 разрешённое как позитивный контроль.
- 4 — Vitest с алиасами и v8-покрытием, без БД и сети.
- 6 — Drizzle + Neon serverless, миграции в репозитории. `pnpm db:migrate` применён к чистой БД (создал журнал), идемпотентен при повторе, и проверен на обеих ветках Neon.
- 7 — Zod-загрузчик `env.ts`: `next build` без `DATABASE_URL` падает с exit 1 и называет переменную; `process.env` вне загрузчика валит lint.
- 10 — Tailwind v4 (CSS-first токены) + вендоренные примитивы shadcn/ui, оболочка `(app)`. Проверено на собранном приложении: токены и утилиты в CSS-бандле, внешнего runtime компонентов нет.

ТЕСТЫ/CI: `pnpm format:check`, `pnpm lint`, `pnpm test:boundaries` (5 фикстур), `pnpm typecheck`, `pnpm test:unit` (12 тестов), `pnpm build` — все зелёные. `pnpm test:e2e`: chromium и webkit проходят, firefox падает (`spawn UNKNOWN`). CI на GitHub Actions ни разу не запускался.

DECISIONS: D-1 … D-10 в `decisions.md`. Отдельно: D-1 — у TypeScript нет опции, отклоняющей явную аннотацию `any` (компилятор ловит только неявный) — запрет держит ESLint-гейт задачи 2, оба гейта блокирующие в CI. Вопрос уровня поднят исполнителем; вердикт Архитектора: уровень 1, принято (см. START_HERE раунда 2).

BLOCKED: 3 записи в decisions.md — задача 5 (Firefox на этой машине: тот же сбой на независимой версии Playwright 1.55 — дело не в сборке), задача 8 (push отклонён — `Repository not found`), задача 9 (нет доступа к Vercel).

НУЖНО ОТ ЗАКАЗЧИКА: (1) доступ к GitHub-репозиторию `g09747653-bot/spec-platform` для аккаунта `DictorBob`; (2) branch protection на `main` после первого прогона CI (чеки `Lint, boundaries, types, unit` и `End-to-end (Chromium, Firefox, WebKit)`); (3) Vercel: импорт репозитория + `DATABASE_URL` раздельно для Production/Preview (чек-лист в `docs/deployment.md`); (4) Firefox локально — блокируется на уровне ОС (`Activation context generation failed ... mozglue`), не критично при проверке матрицы на CI.

СЛЕДУЮЩИЙ ШАГ: закрыть пункты 1–2, затем один push отправит ветку и приложится вывод первого прогона CI — это закроет AC задач 5 и 8. Пункт 3 (Vercel) — параллельно. M1 не начат, ожидание приёмки.
