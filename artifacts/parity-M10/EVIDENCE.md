# Наблюдения парити-прогулки (задача 128)

Собрано `e2e/parity-M10.spec.ts` на детерминированном стабе. Колонка «эталон» — текст
`.specs/research/myspec-parity-reference.md`; дампов их страниц в репозитории нет, поэтому
сравнение идёт с описанием, а не со скриншотом (см. шапку спеки).

| пункт | эталон говорит | у нас наблюдается | скрин |
|---|---|---|---|
| `1.1-1` | вся сессия живёт в одной непрерывной ленте чата, никаких «страниц стадий» | лента `feed` присутствует на странице сессии: 1; страниц стадий в маршрутах нет | `01-seeded-session.png` |
| `1.1-3` | каждое сообщение несёт data-msg-id, data-msg-role, data-msg-stage, data-msg-substage, data-msg-snippet | у сообщения пользователя: `data-msg-id`, `data-msg-role`, `data-msg-stage`, `data-msg-substage`, `data-msg-kind`, `data-testid` | `01-seeded-session.png` |
| `1.2-1` | seed-сообщение шаблонное: «I want to build {название}. My project description is: …» | первое сообщение ленты: «I want to build A tool that tracks which of a small charity’s grant…. My project description is: A tool that tracks whic» | `01-seeded-session.png` |
| `1.1-4` | заголовок анкеты «Round N — K questions», капс, разрежённый трекинг | заголовок: «ROUND 1 — 2 QUESTIONS» | `02-question-round.png` |
| `1.1-5` | у вопроса — текст, красная звёздочка обязательности, подпись «Select one» / «Select all that apply» | в карточке встречается: «*», «Select one», «Select all that apply» | `02-question-round.png` |
| `1.1-6` | опция = радио/чекбокс + название + пометка (Recommended) + однострочное описание | пометка «(Recommended)» присутствует в карточке | `02-question-round.png` |
| `1.1-7` | всегда есть вариант Other со свободным вводом | элементов `mcq-other-*`: 2 | `02-question-round.png` |
| `1.1-8` | внизу — кнопка Submit Answers | `mcq-submit` подписана «Submit Answers» | `02-question-round.png` |
| `1.1-9` | после отправки форма остаётся в ленте в disabled-состоянии с зафиксированным выбором | в зафиксированном раунде отключённых полей: 0; выбранное значение видно как `answered-value`: 2 | `03-round-answered-fixed.png` |
| `1.1-10` | стадийный чип по центру ленты: «Constitution · Collecting ──▶ Constitution · Generating» | первый чип ленты: «Interview ──▶ Constitution · Collecting» | `04-stage-chip.png` |
| `1.1-11` | карточка документа: название стадии, путь specs/<bundle>/constitution.md (моно), бейдж Approved, Rev N со второй ревизии, кнопка Preview | путь: «specs/a-tool-that-tracks-which-of-a-small-charity-s-gr/constitution.md»; ревизия: «Rev 1»; кнопка предпросмотра: 0 | `05-document-card.png` |
| `1.1-11a` | бейдж Approved (success) на карточке документа | `document-approved` на странице: 1 | `05-document-card.png` |
| `1.3-1` | бейдж вердикта Needs Revision (amber) или Pass (success) + подпись «<Stage> review» | вердикт: «Needs Revision» | `06-review-board.png` |
| `1.3-2` | абзац-сводка ревью | `review-summary`: «The constitution covers the ground it should, but two points would leave a coding agent guessing and…» | `06-review-board.png` |
| `1.3-3` | две группы: Must Fix (N) — отмечены по умолчанию; Recommendations (N) — сняты по умолчанию | «Must Fix (2)» — отмечено 2 из 2; «Recommendations (1)» — отмечено 0 из 1 | `06-review-board.png` |
| `1.3-4` | пункт: чекбокс · «Секция — подсекция» · Confidence score X/10 с тултипом · проблема · курсивное «Suggestion: …» | в доске встречается: «Confidence», «Suggestion» | `06-review-board.png` |
| `1.3-5` | три кнопки: Accept feedback / Request changes / Ignore | «Accept feedback», «Request changes», «Ignore» | `06-review-board.png` |
| `1.1-3a` | data-msg-role="user|ai" | у ответа роль записана как «assistant» (эталон пишет «ai») | `07-free-chat-in-review.png` |
| `1.2-4` | свободный чат работает в любой точке; ответ приходит тем же чатом с data-msg-substage="review", стадия не ломается | ответ несёт stage=«constitution», substage=«review»; доска ревью на месте: 1 | `07-free-chat-in-review.png` |
| `1.1-2` | пузырь пользователя справа (rounded-2xl rounded-tl-sm, приглушённый фон), проза ИИ слева | у блока пользователя выравнивание «justify-end (справа)», у блока ИИ «по левому краю» | `07-free-chat-in-review.png` |
| `1.1-11b` | на карточке документа — кнопка Preview (глаз) | на завершённой сессии карточек с `document-preview-toggle`: 3 (на текущем документе содержимое показано целиком, без переключателя) | `08-session-complete.png` |
| `1.2-5` | после Interview создаётся бандл («Project bundle created: …»), имя из описания | имя бандла в панели завершения: «a-tool-that-tracks-which-of-a-small-charity-s-gr» | `08-session-complete.png` |
| `1.1-13` | финал ленты: панель Session completed (Bundle: имя — N spec files generated; Edit, Download) | бандл: «a-tool-that-tracks-which-of-a-small-charity-s-gr»; файлов: «4»; кнопки: `completion-edit`, `completion-download` | `08-session-complete.png` |
| `1.1-14` | панель «Build with your favourite tool»: Lovable / Bolt / Replit / Generate AI Prompt | `build-with` присутствует: 1; `generate-ai-prompt`: 1 | `08-session-complete.png` |
| `1.5-1` | per-chat model picker в композере: Auto + конкретные модели; выбор сохраняется на чат | пикер предлагает: «Auto», «deterministic-stub» | `08-session-complete.png` |
| `1.5-2` | композер: attach, @-ссылки на файлы, slash-команды, пикер модели, отправка | attachment-input=1, model-picker=1, chat-send=1; меню слэш-команд по «/»: открывается | `08-session-complete.png` |
| `1.5-3` | сайдбар (resizable ~280px): Specs, Local Workspace (Mount folder), Attachments | specs-panel=1, local-workspace=1, mount-folder=1, attachments-panel=1, sidebar-resize=1 | `09-sidebar.png` |
| `1.5-4` | проектная страница: вкладки Generate | Edit, поиск, фильтры Active/Archived/All, строка чата с бейджами и статусом, карточка MCP Servers | tab-generate=1, tab-edit=1, chat-search=1, filter-active=1, filter-archived=1, filter-all=1, chat-methodology=1, chat-bundle=1, chat-status=1, chat-age=1, mcp-card=1, mcp-add-server=1 | `10-project-page.png` |
| `1.4-3` | Edit-режим: методология «MySpec edit-workflow v1», три шага Reference → Describe → Review | step pills: «1 Reference → 2 Describe → 3 Review → 4 Complete»; бейдж методологии: «MySpec
·
Edit
·
V1» | `11-edit-reference.png` |
| `1.4-4` | префилл «I want to update spec {bundle} to …» | поле Describe открывается на «I want to update spec constitution.md, requirements.md, solution.md and tasks.md to » | `12-edit-describe.png` |
| `1.4-1` | четыре методологии генерации = четыре конфигурации графа (+ Auto) | пикер предлагает: `methodology-picker`, `methodology-auto`, `methodology-myspec-greenfield-v1`, `methodology-myspec-brownfield-v1`, `methodology-speckit-greenfield-v1`, `methodology-openspec-brownfield-v1` | `13-methodology-picker.png` |
| `1.4-2-myspec-greenfield-v1` | step pills рендерятся из графа выбранной методологии, активный подсвечен | «1 Interview → 2 Constitution → 3 Requirements → 4 Solution → 5 Tasks → 6 Complete» | `14-pills-myspec-greenfield-v1.png` |
| `1.4-2-myspec-brownfield-v1` | step pills рендерятся из графа выбранной методологии, активный подсвечен | «1 Interview → 2 Proposal → 3 Requirements → 4 Tasks → 5 Complete» | `15-pills-myspec-brownfield-v1.png` |
| `1.4-2-speckit-greenfield-v1` | step pills рендерятся из графа выбранной методологии, активный подсвечен | «1 Interview → 2 Constitution → 3 Specify → 4 Plan → 5 Tasks → 6 Complete» | `16-pills-speckit-greenfield-v1.png` |
| `1.4-2-openspec-brownfield-v1` | step pills рендерятся из графа выбранной методологии, активный подсвечен | «1 Explore → 2 Proposal → 3 Specs → 4 Solution → 5 Tasks → 6 Complete» | `17-pills-openspec-brownfield-v1.png` |
| `1.5-5` | тема dark/light через localStorage, переживает перезагрузку | было «light», стало «dark», после перезагрузки «dark» | `18-theme-toggled.png` |
| `1.5-6` | загрузочный экран с анимированным брендовым SVG; тосты; поверхность «Connection lost» | brand-loader=1 (в покое), toast-viewport=1 (в покое), connection-lost=0 (в покое) | `18-theme-toggled.png` |