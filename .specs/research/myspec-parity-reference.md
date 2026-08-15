# Реверс-инжиниринг app.myspec.dev — итоговый разбор
*Архитектор · 2026-08-14 · источники: 7 HTML-дампов авторизованных страниц (включая полностью завершённую сессию) + 2 скриншота (меню методологий, меню моделей) + дамп нашего приложения для контраста*

---

## Часть 1. Что теперь известно ДОСТОВЕРНО

### 1.1 Главное открытие: весь продукт — это одна чат-лента

Никаких «страниц стадий». Вся сессия от первого сообщения до готового бандла живёт в одной непрерывной ленте чата. Внутри неё чередуются пять типов блоков:

1. **Обычные сообщения** — пузырь пользователя справа (`rounded-2xl rounded-tl-sm`, приглушённый фон), проза ИИ слева (typography-класс `chat-prose prose`). Каждое сообщение несёт `data-msg-id`, `data-msg-role="user|ai"`, `data-msg-stage`, `data-msg-substage`, `data-msg-snippet` — по этим атрибутам работает навигация по ленте.
2. **Анкеты-раунды** — встроенные прямо в сообщение ИИ формы: заголовок «Round N — K questions» (капс, разрежённый трекинг), затем вопросы. Каждый вопрос: текст + красная звёздочка обязательности, подпись «Select one» / «Select all that apply», список опций-кнопок. Опция = радио/чекбокс + название + пометка `(Recommended)` + однострочное описание + (иногда) тег-чипы (`programming · compiled · static-typed …`). Всегда есть вариант **Other** (свободный ввод). Внизу — кнопка **Submit Answers**. После отправки форма остаётся в ленте в disabled-состоянии с зафиксированным выбором.
3. **Стадийные чипы перехода** — pill по центру ленты: `Constitution · Collecting  ──▶  Constitution · Generating` (слева «откуда», анимированные тире dash-flow, стрелка, справа «куда» в цвете primary). Градиентная рамка primary/20.
4. **Карточки документов** — `rounded-xl border bg-surface`: название стадии (primary), путь `specs/<bundle>/constitution.md` (моно), бейдж **Approved** (success) и, начиная со второй ревизии, **Rev N**; кнопка Preview (глаз).
5. **Карточки ревью** — см. 1.3, это ядро сервиса.

Финал ленты: панель **Session completed** (Bundle: имя — 4 spec files generated; кнопки Edit и Download) + панель **«Build with your favourite tool»** с кнопками Lovable / Bolt / Replit / Generate AI Prompt.

### 1.2 Механика интервью и стадий (по завершённой сессии)

- Seed-сообщение всегда шаблонное: «I want to build {название}. My project description is: {описание}».
- Число раундов **адаптивно**: в наблюдаемой сессии Interview = 3 раунда (5+5+4 вопросов), Constitution = 2, Requirements = 2, Solution = 2, Tasks = 1.
- **Вопросы генерируются от контекста, а не из фиксированного списка.** Между раундами ИИ пишет короткий аналитический мостик, где: фиксирует противоречия ответов («вы выбрали near-instant в интервью и 500–800ms сейчас — это разные системы»), ловит физические конфликты («laptop 4090 — это 16GB, а не 24»), и строит следующий раунд вокруг этих конфликтов. Это не косметика — это наблюдаемое поведение в каждом переходе.
- Свободный чат работает в любой точке: пользователь посреди ревью спросил по-русски «что я должен выбрать?» — модель ответила объяснением интерфейса и рекомендацией, не сломав стадию. Ответ пришёл тем же чатом с `data-msg-substage="review"`.
- После Interview создаётся бандл («Project bundle created: local-voice-assistant») — имя генерируется из описания.
- Переход стадий подтверждается пользователем: Accepted → следующая стадия начинает свой Collecting-раунд.

### 1.3 Review-цикл — то, чего у нас нет вообще, и что делает их сервис «умным»

После каждой генерации документа автоматически запускается **AI-ревью** (substage Review). Карточка ревью:

- Бейдж вердикта: **Needs Revision** (amber) или **Pass** (success) + подпись «Constitution review».
- Абзац-сводка ревью.
- Две коллапсируемые группы: **Must Fix (N)** — цвет danger, все пункты **отмечены чекбоксом по умолчанию**; **Recommendations (N)** — сняты по умолчанию.
- Каждый пункт: чекбокс · заголовок «Секция — подсекция» · **Confidence score X/10** с бейджем и тултипом («How certain the AI reviewer is that this feedback is accurate…») · абзац проблемы · курсивный абзац «Suggestion: …».
- Три кнопки: **Accept feedback** (закрыть ревью, идти дальше как есть) / **Request changes** (переписать документ по отмеченным пунктам) / **Ignore** (отбросить фидбек).
- При Request changes: модель одним абзацем говорит, что именно сложила и какие решения приняла сама («On voice-cloning you didn't specify — I've made the call that…»), затем чип Generating → карточка **Rev N+1** → **повторное ревью проверяет именно выбранные пункты** («Verifying the revision against the four items you selected») и может принести новые пункты, порождённые самой правкой.
- Цикл повторяется до Pass + Accepted. В наблюдаемой сессии: Constitution — 6 ревизий, Requirements — 4, Solution — 2, Tasks — 2.

Качество ревью — главная содержательная сила продукта: он находил реальные инженерные дефекты (отсутствие эхоподавления при always-on listening; конфликт бюджета латентности 700ms VAD против 500–800ms end-to-end; побитые кросс-ссылки FR; нарушение собственного правила стабильности идентификаторов), с трассировкой правок по всему документу.

### 1.4 Четыре методологии = четыре конфигурации графа стадий

Из скриншотов + дампов:

| Методология | Шаги |
|---|---|
| MySpec generate-workflow v1 (Greenfield) | Interview → Constitution → Requirements → Solution → Tasks → Complete |
| MySpec generate-brownfield v1 | Interview → Proposal → Requirements (+ Tasks optional) → Complete |
| SpecKit generate-greenfield v1 | Interview → Constitution → Specify → Plan → Tasks → Complete |
| OpenSpec generate-brownfield v1 | Explore → Proposal → Specs → Solution → Tasks → Complete |

Плюс **Edit-режим** (отдельный класс чатов): методология «MySpec edit-workflow v1», три шага **Reference → Describe → Review** («Reference spec files → describe changes → review and apply suggested edits»), префилл «I want to update spec {bundle} to …».

Step pills в шапке чата рендерятся из графа выбранной методологии: нумерованные круги, активный подсвечен, «Step 1: Interview · 1/5» дублируется в заголовке.

### 1.5 Модели, композер, сайдбар, проектная страница

- **Per-chat model picker** в композере: Auto, Claude Sonnet 5 / Opus 5 / Haiku 4.5, Gemini 3.6 / 3.5 Flash / Lite, GPT-5.6 Luna / Terra / Sol. В одном чате наблюдался GPT-5.6 Sol, в другом Claude Opus 5 — выбор сохраняется на чат.
- **Композер**: contenteditable, кнопка attach, @-ссылки на файлы, slash-команды, пикер модели, кнопка отправки с брендовым градиентом.
- **Сайдбар** (resizable, ~280px): секции **Specs** (бандлы со статусом Completed), **Local Workspace** (кнопка Mount folder — монтирование локальной папки), **Attachments** (вставленные картинки с размерами файлов).
- **Проектная страница**: имя + описание-тултип + Share; вкладки чатов **Generate | Edit**, поиск, фильтры Active/Archived/All; строка чата = название + бейдж методологии «MySpec · Greenfield · V1» + бейдж бандла + статус Completed + «Last message 3d ago». Карточка **MCP Servers** (0/3, Add server, разделение per-project / User Profile).
- **Прочее**: тема dark/light через localStorage `myspec-theme`; sonner-тосты; модалка «Connection lost»; загрузочный экран с анимированным брендовым SVG (#5939e2, #02dede, #a249f9); палитра поверхностей #09090b–#121214, primary blue/violet; дизайн-токены `--color-primary/-surface/-foreground…`, типографика text-h3/body/caption/label; React Router SPA c hydration через streamController; PostHog; auth.myspec.dev; platform.myspec.dev; Sanity CMS.

## Часть 2. Что осталось честно НЕИЗВЕСТНЫМ

Дампы — это DOM, не трафик. Не видно: серверных API-контрактов и формата стриминга; текстов их промптов; схемы БД; биллинга и лимитов; реализации Mount folder (по признакам — File System Access API) и MCP-runtime; как именно Lovable/Bolt/Replit-кнопки передают бандл (вероятно — генерация промпта + deeplink). **Эти вещи мы не копируем — мы воспроизводим наблюдаемое поведение поверх нашего бэкенда**, который в части durable streaming/восстановления, вероятно, уже сильнее их клиентского streamController.

## Часть 3. Гэп-анализ: наше приложение против оригинала

Сохраняем (наши активы, маппятся напрямую):
- **transition-table как чистая машина состояний** → расширяется до конфигурируемых графов = движок методологий;
- **durable streaming + resume + Р-2** → стриминг генерации документов в ленту;
- **DecisionIntentResolver** → это в точности их Accept/Request changes/Ignore + чекбоксы, у нас уже есть 4-слойный резолвер;
- **failover-цепочка провайдеров** → фундамент model picker (Auto = наша цепочка);
- **экспорт ZIP, ревизии с immutability-триггерами** → их Rev N уже почти есть в нашей БД (spec_revisions).

Строим заново / впервые:
1. Chat-first поверхность: единая лента, 5 типов блоков, data-msg-навигация (сейчас у нас стадии = панели вне чата — главный разрыв).
2. Review-цикл с Must Fix/Recommendations, чекбоксами, confidence, Rev-циклом (нет вообще).
3. Методологии (4 графа + Edit-workflow) и step pills из графа (у нас один фиксированный маршрут).
4. Анкеты-раунды с (Recommended)/Other/Select-all и адаптивной генерацией вопросов от противоречий (частично: у нас вопросы есть, но не в этой форме и без мостиков-анализа).
5. Сайдбар Specs/Local Workspace/Attachments; проектная страница Generate|Edit + фильтры + MCP-карточка; Share.
6. Композер: contenteditable, attach, @-файлы, slash, per-chat model picker.
7. Completion-панель + «Build with your favourite tool».
8. Визуальный слой: их дизайн-система (токены, типографика, чипы, карточки) — **со своей палитрой и брендом** («уникальный оттенок своего»).

## Часть 4. Амендмент А-2 — перестройка оставшегося плана

Принцип: M0–M5 не трогаем (фундамент используется весь). M6 закрывается своим ходом (раунд 5). Прежние M7–M9 переформатируются в парити-программу.

- **M6 · раунд 5 (немедленно):** починить замороженный переход «Перейти к конституции» (in-flight transition wall — все контролы disabled, «Rendering…»); liveness-тест обязан покрывать in-flight состояния; внятная копия вместо «Этот шаг пока недоступен». Гейт проходит **исполнитель сам** (см. ниже).
- **M7 · Chat-first ядро:** единая лента чата поверх нашей state-machine; блоки: сообщения, анкеты-раунды (Recommended/Other/Select-all/Submit → disabled-фиксация), стадийные чипы, карточки документов Rev N, стриминг документов в ленту; data-msg-атрибуты.
- **M8 · Review-цикл:** генерация AI-ревью после каждого документа (Must Fix/Recommendations, confidence, Suggestion), чекбоксы, Accept/Request changes/Ignore через DecisionIntentResolver, Rev-цикл с повторной верификацией выбранных пунктов, свободный чат в любой точке стадии.
- **M9 · Методологии и IA:** методологии как конфигурации графа (4 generate + 1 edit), step pills из графа; сайдбар (Specs/Attachments; Local Workspace — заглушка «Mount folder» с честным «скоро», либо File System Access API если влезает); проектная страница (Generate|Edit, поиск, фильтры, бейджи, MCP-карточка как UI-каркас); композер (@-файлы, slash, model picker поверх нашей цепочки, Auto = failover).
- **M10 · Визуальный слой и финал:** дизайн-токены и типографика по образцу с собственной палитрой/логотипом/лоадером; completion-панель, Download/Edit, «Build with your favourite tool» (Generate AI Prompt — наша версия); тема, тосты, Connection lost; финальный парити-прогон по чек-листу из Части 1.

**Новое операционное правило (в execution.md, по директиве заказчика):** все гейт-проверки выполняет исполнитель сам — Playwright E2E + скриншоты + видео/трейсы как артефакты в репо; рапорт ссылается на артефакты; заказчик в тестировании не участвует. Красный прогон = milestone не сдан.

**Карта режимов:** M6r5 — high; M7, M8 — MAX (архитектурно самые ёмкие); M9 — high; M10 — high + один ultracode red-team прогон парити-чек-листа в конце.

**Оценка:** M6r5 ≈ 1 сессия; M7 ≈ 1–2; M8 ≈ 1–2; M9 ≈ 1–2; M10 ≈ 1. Итого 5–8 сессий исполнителя до полного парити.

Вне объёма (Backlog): реальный MCP-runtime, реальный Mount folder (если не File System Access за час), Share-ссылки, биллинг, «улучшенная методология ТЗ» заказчика — отдельная работа после парити, как и оговорено.

---

## Часть 5 (дополнение по требованию заказчика). Официальная документация и родословная

### 5.1 У них есть публичная документация — blog.myspec.dev

Найден их блог с 4 продуктовыми анонсами и 13 гайдами. Ключевое из анонсов:

- **«Introducing the Next Generation of MySpec»** (07.07.2026) — описывает редизайн, который мы видели в дампах: Greenfield/Brownfield/Auto (Auto сам рекомендует workflow), чат-интервью, mount локального workspace, MCP-инструменты, выбор Claude/GPT/Gemini. Ревью описано как «continuous validation»: при проблемах система «enters a clarification workflow instead of making assumptions».
- **«Greenfield Workflow»** (14.07.2026): полный конвейер Setup → выбор workflow (v0 / v1 / SpecKit) → интервью → clarification-раунды → генерация → AI-review → refinement → export. Бандл v1 — **пять** компонентов: Introduction (vision) + Constitution + Requirements + Plan + Tasks. Подтверждены **режимы просмотра документа: Outline / Preview / Raw / Diff**, папки/архив/корзина, роли онбординга (Developer, QA, BA, PM, Solution Architect).
- **«Brownfield Workflow»** (21.07.2026): два brownfield-конвейера (MySpec: Interview→Proposal→Requirements «для быстрых итераций»; OpenSpec: полный — для крупных изменений). MCP используется для дискавери: «discover relevant specifications, inspect project files, retrieve supporting documentation». Прямо написано: документы «are never applied automatically» — Approve/Request Changes с сохранением истории ревью; «AI Recommendations with priority scores» (это наши confidence-баллы); на стадии Tasks — вопрос «How would you like to proceed?» вместо yes/no.
- **«Public Links, More AI Models»** (28.07.2026): Share = снапшот-ссылка read-only (срок 1–30 дней, revoke/refresh, ZIP-скачивание, без аккаунта). Announcements-инбокс в аватаре (EN/JA/ZH). Точный список моделей с контекстами: Opus 5 / Sonnet 5 (1M), Gemini 3.6 Flash / 3.5 Flash-Lite (1M), GPT-5.6 Luna / Terra / Sol (400K).
- **Гайд «Vibe Specify'ing» (Edit-флоу)**: Edit → +Edit; три типа правок (additive/corrective/refinement); кросс-файловая консистентность («AI understands the dependencies and updates all relevant files simultaneously» — лечит «spec drift»); **Diff Preview** (зелёные/красные строки) из сайдбара; откат фразой «Go back to previous step»; история версий через глаз-Preview; десктоп 768px+, мобильная версия — «Q3 2026».
- **Гайд «Getting started»**: онбординг, панель Attachments (PDF/DOCX/TXT), «AI Quality Scoring: the system scores its own requirements», экспорт ZIP → положить в `.specs/` в корне репо → скормить агенту.

### 5.2 «С чего слизали» — подтверждено, и это открытый код

- **SpecKit-методология = github/spec-kit** (официальный open-source тулкит GitHub). Их «SpecKit generate-greenfield v1» — это прямое воспроизведение фаз `/speckit.constitution → /speckit.specify → /speckit.plan → /speckit.tasks → implement`. В репо лежат **готовые шаблоны всех документов** (spec-template с user stories, `[NEEDS CLARIFICATION]`-маркерами и чек-листами; plan-template с конституционными гейтами; tasks-template с `[P]`-маркерами параллельности) и манифест философии `spec-driven.md`. Всё это можно вендорить напрямую — лицензия открытая.
- **OpenSpec-методология = Fission-AI/OpenSpec** (open source). Их «OpenSpec generate-brownfield v1» — воспроизведение конвейера `proposal.md → specs/ (requirements+scenarios) → design.md → tasks.md → archive`. Тоже с готовыми шаблонами и слэш-командами (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`).
- **MySpec v0 = их собственная исходная методология**: «Interview → Constitution → Requirements → Solution → Tasks» — **ровно та, по которой сгенерирован наш `.specs/`-бандл**. Наблюдение заказчика подтверждено документально: наш план написан их продуктом по их же v0-конвейеру. Мы, по сути, строим v1-продукт по спеке, составленной его v0-версией.

Практическое следствие для M9: конфигурации методологий не нужно реверсить из дампов — стадийные шаблоны и промпт-структуры берём из первоисточников (github/spec-kit, Fission-AI/OpenSpec), а UI-обвязку — из дампов. Это снимает главный риск этапа.

### 5.3 Дополнения к А-2 по итогам исследования

1. **M9 +** вендоринг шаблонов spec-kit/OpenSpec как конфигураций графа; document viewer Outline/Preview/Raw/Diff; v1-бандл с Introduction.
2. **M10 +** Generate AI Prompt (готовый промпт для Cursor/Claude/Copilot со ссылками на одобренные документы); Diff Preview в Edit-флоу.
3. **Backlog (перед бетой):** Public Links-снапшоты (1–30 дней, revoke), Announcements-инбокс, роли онбординга, локализация.
4. Auto-режимы: Auto-модель = наша failover-цепочка (уже есть), Auto-workflow = рекомендация методологии по описанию (дёшево, одна классификация).

Источники: blog.myspec.dev (анонсы 07/14/21/28.07.2026, гайды 00–13), github/spec-kit (spec-driven.md, шаблоны), Fission-AI/OpenSpec, dev.to/myspec.

---

## Часть 6. Что MySpec добавил поверх spec-kit/OpenSpec — где проходит граница «сырьё vs разработка»

Вопрос заказчика (2026-08-14): «если они взяли готовый исходник spec-kit — что они добавили своего и как улучшили? Нам нужно не скопировать spec-kit, а продолжить разработку с того места, где их текущая версия».

Spec-kit и OpenSpec — это шаблоны документов + слэш-команды, исполняемые внутри чужого кодового агента. Ни интерфейса, ни сервера, ни состояния, ни собственного ИИ-поведения. Собственная разработка MySpec — четыре слоя поверх этого сырья:

1. **Интервью-движок** (их разработка, копируем поведение): адаптивные раунды структурированных анкет с (Recommended)-вариантами и аналитические мостики между раундами — модель фиксирует противоречия ответов пользователя и физические конфликты и строит следующий раунд вокруг них. В spec-kit уточнения — это текстовые маркеры `[NEEDS CLARIFICATION]`; структурированных анкет и мостиков там нет.
2. **Ревью-цикл** (их главная интеллектуальная собственность): независимый ИИ-ревьюер каждого документа (Must Fix / Recommendations, confidence, Suggestion), цикл ревизий с повторной верификацией выбранных пунктов, до Pass. В spec-kit есть чек-листы внутри шаблонов и `/speckit.analyze` (проверка согласованности артефактов), но нет продуктизированного ревьюера с историей ревизий и находками уровня «отсутствует эхоподавление при always-on listening».
3. **Хостед-состояние**: durable-сессии, стриминг, возобновление, история ревизий, approvals. У spec-kit — файлы в репо.
4. **Продуктовая обвязка**: мульти-методологии (конкурентные spec-kit и OpenSpec обёрнуты как режимы), мульти-модели per-chat, Edit-флоу с кросс-файловой консистентностью, шаринг, MCP-дискавери, viewer с diff.

**Следствие для M7–M10:** шаблоны стадий вендорим из первоисточников (сырьё), а разработка = слои 1, 2, 4 (слой 3 у нас уже есть и сильнее). Цель — текущий v1 их сайта, не spec-kit. Эталон поведения слоёв 1–2 — полная стенограмма завершённой сессии (Часть 1): промпты интервьюера и ревьюера калибруются до совпадения с ней.

**Честные пределы парити (зафиксировано для заказчика):** механика и UI копируются полностью; глубина находок ревьюера зависит от модели — их ревьюер работает на Opus 5 / GPT-5.6, наша текущая цепочка — бесплатный Gemini + локальный qwen 14B. Парити по качеству контента потребует хотя бы одного оплаченного топ-ключа; вопрос ставится на гейте M8 с расчётом стоимости. Их точные промпты недоступны — воспроизводим поведение итерациями против стенограммы.
