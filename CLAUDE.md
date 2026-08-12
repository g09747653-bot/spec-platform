# CLAUDE.md

Проект описан спецификационным бандлом в `.specs/`:
- `constitution.md` — нерушимые принципы; при любом конфликте выигрывает он;
- `requirements.md` — что делает продукт (FR/NFR/DR/IR с критериями приёмки);
- `solution.md` — как устроено (модули, контракты, KSD-решения);
- `tasks.md` — план работ с зависимостями и трассировкой;
- `execution.md` — операционный слой: гейты, уровни решений, протоколы (не меняет ТЗ);
- `decisions.md` — журнал решений, блокировок и амендментов.

Правила работы:
1. Прочитай документы в порядке: constitution → requirements → solution → tasks.
2. Выполняй задачи из tasks.md по порядку номеров с учётом зависимостей; выполнив задачу, отметь её чекбокс.
3. Идентификаторы требований и номера задач не перенумеровывай.
4. Тесты — часть каждой задачи: задача не готова, пока её тесты не зелёные.
5. Не расширяй объём: идеи «сделать заодно» записывай в Backlog файла `.specs/decisions.md`, не реализуя.
6. В начале каждой сессии перечитай constitution.md, текущий milestone в tasks.md и хвост decisions.md. Одна сессия — не более одного milestone.
7. Завершив milestone — остановись, дай краткий рапорт и жди приёмки. Следующий milestone начинай только после команды «принято».
8. Решения уровня 1 (в рамках заданных контрактов) фиксируй строкой в decisions.md. Всё, что меняет AC, интерфейс из solution.md или constitution.md, — не твой уровень: остановись и спроси (см. execution.md §2, §5).
9. Задача не сдвигается после 2 подходов — пометь BLOCKED в decisions.md и возьми следующую Parallel-safe задачу текущего milestone; таких нет — остановись с рапортом. Красный CI = стоп до зелёного.
10. Handoff-протокол (execution.md §2): точка входа каждой сессии — `.specs/handoff/START_HERE.md` (пишет Архитектор; фраза заказчика «Прочитай … и исполни» = утверждённый вердикт). Останавливаясь, пиши полный рапорт новой секцией сверху в `.specs/handoff/REPORT-M<N>.md` и коммить его; в чат — ровно две строки: статус одной фразой и путь к рапорту.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
