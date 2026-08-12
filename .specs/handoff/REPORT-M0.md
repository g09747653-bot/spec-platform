# REPORT-M0 — рапорты исполнителя по Milestone 0

> Пишет исполнитель. Новые раунды — секцией сверху. Форма: СТАТУС / СДЕЛАНО / ТЕСТЫ-CI / DECISIONS / BLOCKED / НУЖНО ОТ ЗАКАЗЧИКА / СЛЕДУЮЩИЙ ШАГ.

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
