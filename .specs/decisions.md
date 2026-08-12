# Decisions Log — журнал решений исполнителя

> Ведётся исполнителем по правилам `.specs/execution.md` §2 (уровень 1) и §4 (BLOCKED).
> Формат строки решения: `D-<n> | task <N> | <решение> | <почему> | <что НЕ затронуто: AC/контракты>`
> Формат блокировки: `BLOCKED task <N>: <симптом> / <2 подхода> / <гипотеза>`

## Решения (уровень 1)

D-1 | task 1 | `typecheck` = `tsc --noEmit`; запрет на *явную* аннотацию `any` обеспечивает ESLint-гейт задачи 2, а не компилятор | у TypeScript нет опции, отклоняющей явный `any`: `strict`/`noImplicitAny` ловит только неявный (проверено: неявный `any` → exit 2, явный `const x: any = 1` → exit 0). Оба гейта блокирующие в CI (задача 8), поэтому «сборка падает на намеренном `any`» выполняется на уровне CI | AC задачи 1 и 2 выполнены целиком; контракты solution.md не затронуты

D-2 | task 1 | TypeScript закреплён на 5.9.3, а не на текущем latest 7.0.2 | `typescript-eslint@8.67` (механизм, которым constitution требует запрещать `any`) объявляет peer `typescript >=4.8.4 <6.1.0`; на TS 7 type-aware правила не работают | стек не меняется — constitution требует «TypeScript (strict mode)» без версии; переход на TS 7 возможен, когда typescript-eslint его поддержит

D-3 | task 2 | `tsconfig.json` внесён в `.prettierignore` | Next.js переписывает и переформатирует этот файл на каждом `next dev`/`next build`, из-за чего `format:check` падал бы после любого запуска сборки | AC задачи 2 («несформатированный файл валит `format:check`») проверено на обычном файле; `.specs/` и `CLAUDE.md` также исключены, чтобы форматтер не переписывал ТЗ

D-4 | task 3 | Границы модулей закодированы через `eslint-plugin-import-x` (правило `import-x/no-restricted-paths`), а не `eslint-plugin-import` | `eslint-plugin-import@2.32` не поддерживает ESLint 10 (peer `^2..^9`); import-x — поддерживаемый форк с тем же правилом и peer `^10.0.0` | solution.md допускает «`import/no-restricted-paths` (or `eslint-plugin-boundaries`)»; таблица разрешённых рёбер закодирована один раз в `eslint.boundaries.js`

D-5 | task 3 | Фикстуры нарушений лежат в `src/modules/<module>/__fixtures__/`, проверяются отдельным скриптом `pnpm test:boundaries` (ESLint Node API), исключены из tsconfig и из обычного `pnpm lint` | правило `no-restricted-paths` срабатывает по реальному пути файла, поэтому фикстура обязана лежать внутри проверяемого модуля; отдельный скрипт не требует Vitest (задача 4 идёт после 3) и в CI это отдельный шаг, как и предписано задачей 8 | правило и `basePath` импортируются обоими конфигами из `eslint.boundaries.js` — расхождение конфигураций невозможно

D-6 | task 5 | Edge покрыт проектом `chromium` (задокументировано в `playwright.config.ts`) | Edge построен на Chromium и Playwright управляет им тем же движком; NFR-011 (4 браузера) отображается на 3 проекта Playwright | NFR-011 AC-1/AC-2 не ослаблены: Chrome+Edge → chromium, Firefox → firefox, Safari → webkit

D-7 | task 6 | Начальная миграция сгенерирована как `drizzle-kit generate --custom` (пустой SQL-файл) | схема таблиц появляется только в задаче 11; `drizzle-kit generate` на пустой схеме не создаёт файл, а AC требует закоммиченный файл миграции и чистое применение `db:migrate` | AC задачи 6 выполнены: файл в репозитории, `db:migrate` применяется к чистой БД и создаёт журнал миграций Drizzle

D-8 | task 7 | Переменные окружения будущих milestone (`AUTH_*`, ключи провайдеров, `BLOB_READ_WRITE_TOKEN`, `WEB_SEARCH_API_KEY`, `SENTRY_DSN`) объявлены в Zod-схеме как optional; обязательным для M0 является `DATABASE_URL`; для числовых/перечислимых настроек заданы дефолты из solution.md | ключи выдаются заказчиком на своих milestone (правило 5 задания сессии); требовать их сейчас — значит блокировать загрузку приложения до M1/M3 | таблица Configuration из solution.md покрыта целиком; IR-X2 и NFR-006 AC-1 не ослаблены; на своём milestone переменная переводится в обязательные

D-9 | task 10 | Tailwind CSS v4 с CSS-first конфигурацией (`@import 'tailwindcss'` + `@theme` в `globals.css`, плагин `@tailwindcss/postcss`), файл `tailwind.config.ts` не создаётся | в v4 конфиг живёт в CSS; отдельный JS-конфиг — legacy-режим | AC задачи 10 («shell рендерится со стилями Tailwind, без внешней runtime-зависимости компонентов») выполнено; `_Touches:_` — ориентир, а не контракт

D-11 | task 5 | Локальный запуск Firefox не чинится; матрица браузеров проверяется на CI (ubuntu-latest), локальные прогоны допустимы как `chromium`+`webkit` | вердикт Архитектора в START_HERE раунда 2: время на машинную неисправность не тратится; см. `BLOCKED task 5` ниже | конфигурация Playwright не ослаблена — все три проекта остаются в `playwright.config.ts` и обязательны на CI; NFR-011 и SC-12 не затронуты

D-10 | task 10 | Примитивы shadcn/ui внесены в репозиторий вручную (`src/modules/web/ui/*`) вместо запуска `shadcn init` | CLI тянет свой набор зависимостей и переписывает конфиги проекта; solution.md требует именно вендоринга: «Components are vendored into the repo, so there is no third-party runtime to track» | внешней runtime-зависимости компонентов нет; `class-variance-authority`/`clsx`/`tailwind-merge` — build-time утилиты стилей, как в исходных шаблонах shadcn/ui

## BLOCKED

BLOCKED task 5 (частично, только локальный прогон): проект `firefox` в `pnpm test:e2e` падает с `browserType.launch: spawn UNKNOWN`; в журнале Windows — `Activation context generation failed ... Dependent Assembly mozglue version="1.0.0.0" could not be found`. Проекты `chromium` и `webkit` проходят.
/ Подход 1: `playwright install --force firefox` — переустановка не помогла; проверены зависимости бинарника (`winldd`): все VC-runtime DLL резолвятся, `mozglue.dll` присутствует и содержит встроенный манифест с точно совпадающим `assemblyIdentity`, mark-of-the-web отсутствует. Подход 2: установлен независимый Playwright 1.55.1 с Firefox build 1490 в отдельной директории — тот же `spawn UNKNOWN`, то есть дефект не в конкретной сборке.
/ Гипотеза: ограничение самой рабочей машины (SxS-активация / политика запуска процессов, AV-EDR или AppLocker), а не дефект репозитория. Конфигурация Playwright содержит все три проекта и не ослаблена; матрица из трёх браузеров подлежит проверке на CI (ubuntu-latest, задача 8), где сборка Firefox для Linux штатная. См. пункт в «НУЖНО ОТ ЗАКАЗЧИКА» рапорта.

BLOCKED task 8: пайплайн `.github/workflows/ci.yml` написан, все его шаги прогнаны локально и зелёные, но CI ни разу не запускался — `git push` в `https://github.com/g09747653-bot/spec-platform` отклонён с `remote: Repository not found`.
/ Подход 1: `gh repo view g09747653-bot/spec-platform` → `Could not resolve to a Repository`; аутентифицированный аккаунт — `DictorBob` (scopes: repo, workflow), то есть прав на push хватило бы. Подход 2: `gh api users/g09747653-bot` → пользователь существует, тип User, публичных репозиториев нет; поиск по владельцу недоступен. То есть репозиторий либо не создан, либо `DictorBob` не добавлен в коллабораторы.
/ Гипотеза: не закрыт первый пункт чек-листа execution.md §6 («GitHub-репозиторий (пустой, с main)») либо не выдан доступ. Локально сделано всё, что можно без доступа: репозиторий инициализирован, коммит `670f709` на ветке `main` готов, `origin` прописан — после выдачи доступа достаточно одного `git push -u origin main`. Обходной путь (создать репозиторий под другим владельцем) не применялся сознательно.

BLOCKED task 9: конфигурация деплоя в репозитории готова (`vercel.json`: `pnpm db:migrate && pnpm build`), но оба AC — preview-деплой на preview-ветку БД и применение миграций до подачи трафика в проде — наблюдаемы только в проекте Vercel, доступа к которому нет; Vercel CLI на машине не установлен, аккаунт не подключён.
/ Подход 1: `vercel --version` → команда не найдена; учётных данных Vercel в окружении нет. Подход 2: задача разложена на репозиторную и дашбордную части — репозиторная выполнена и закоммичена, дашбордная выписана пошаговым чек-листом в `docs/deployment.md` (переменные по окружениям, как проверить оба AC по журналу сборки и по `drizzle.__drizzle_migrations`).
/ Гипотеза: не закрыт пункт чек-листа execution.md §6 («Аккаунт Vercel + подключение репозитория»); зависит от задачи 8, так как Vercel подключается к тому же репозиторию.

## Backlog («идеи заодно» — записывать, не реализуя)

- Ужесточить `no-restricted-properties` для `process.env` до полного запрета в `src/**` после того, как в M1 появятся серверные экшены (сейчас исключение — только сам загрузчик и конфиги инструментов).
- Добавить в `pnpm test:boundaries` фикстуру на запрет импорта репозиториев из `web` — реальные каталоги `repositories/` появляются в задачах 13 и 17, зона в `eslint.boundaries.js` уже заведена.
- Рассмотреть переход на TypeScript 7 после появления поддержки в typescript-eslint (см. D-2).

## Amendments (заполняет Архитектор после утверждения заказчиком)

A-1 | constitution → Coding Standards | «mandatory PR review» в v1 исполняется как обязательный зелёный CI на PR (branch protection) + гейт-приёмка Архитектора на каждом milestone; required approvals = 0 | утверждено заказчиком 2026-08-12 | основание: single-executor модель execution.md §2
