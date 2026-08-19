# JSON-раунд на кандидате гейтовой модели (профиль скорости, 2026-08-16)

Модель `gemini-3.5-flash` у провайдера `google`, окно 16384. Через настоящего агента, то есть вместе
со слоями Р-1: терпимый разбор, детерминированный ремонт, один пересэмпл.

| прогон | вызовов модели | исход | вопросов | ремонт | секунд | претензии |
|---|---|---|---|---|---|---|
| round-1 | 1 | **round** | 4 | нет | 15.4 | — |
| round-2 | 1 | **round** | 5 | нет | 13.3 | — |
| round-3 | 1 | **round** | 4 | нет | 11.4 | — |

Столбец «ремонт» — сработал ли детерминированный ремонт набора (лишние рекомендации, размеры
списков). «да» здесь не отказ: черновик был пригоден после ремонта, и ремонт оставляет строку
в логе (задача 131).

## Режим «Concrete»: те же прогоны под скриптованной рубрикой (задача 144, §4)

Стадия `solution`, профиль `non-technical`, `style: concrete` — стиль обязан вытеснить регистр
профиля, а не сложиться с ним. Рубрика считается по **сырому** черновику: то, что схема
молча отбрасывает (выдуманная ссылка, чужой слаг), обязано быть названо.

Зелено = ноль **блокирующих** находок. «сов.» — совещательные: их читают, по ним не блокируют.

| прогон | вызовов | исход | вопросов | second-person | forbidden-vocabulary | question-shape | spravka-asymmetry | секунд |
|---|---|---|---|---|---|---|---|---|
| concrete-1 | 1 | **round** | 5 | ✓ | ✓ | 12 сов. | ✓ | 24.2 |
| concrete-2 | 1 | **round** | 5 | ✓ | ✓ | 12 сов. | ✓ | 35.6 |
| concrete-3 | 1 | **round** | 5 | ✓ | ✓ | 10 сов. | ✓ | 36.1 |

### Находки построчно

- **concrete-1** · `rubric-decision-opener-data-source-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «Where do you currently store your grant details that this tool needs to work alongside?».
- **concrete-1** · `rubric-decision-opener-devices-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «On which of your devices will you and your team access this tool?».
- **concrete-1** · `rubric-decision-opener-offline-capability-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «What do you need the tool to do when you do not have an active internet connection?».
- **concrete-1** · `rubric-decision-opener-user-scale-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How many of you will need to log into this tool to track your grants?».
- **concrete-1** · `rubric-need-shape-data-source-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «external_data_integration».
- **concrete-1** · `rubric-need-shape-data-source-2` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «database_choice».
- **concrete-1** · `rubric-need-shape-devices-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «target_platforms».
- **concrete-1** · `rubric-need-shape-devices-2` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «responsive_design_needs».
- **concrete-1** · `rubric-need-shape-email-delivery-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «email_integration_mechanism».
- **concrete-1** · `rubric-need-shape-offline-capability-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «offline_support_level».
- **concrete-1** · `rubric-need-shape-user-scale-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «user_concurrency».
- **concrete-1** · `rubric-need-shape-user-scale-2` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «authentication_needs».
- **concrete-2** · `rubric-decision-opener-database-setup-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «Where do you want to store your grant application data?».
- **concrete-2** · `rubric-decision-opener-offline-behavior-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How must this tool behave when you lose your internet connection?».
- **concrete-2** · `rubric-decision-opener-target-devices-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «On which devices do you and your team plan to open this tool?».
- **concrete-2** · `rubric-decision-opener-user-count-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How many of you will log in to use your tracking tool?».
- **concrete-2** · `rubric-need-shape-database-setup-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «data storage engine».
- **concrete-2** · `rubric-need-shape-database-setup-2` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «existing systems integration».
- **concrete-2** · `rubric-need-shape-email-integration-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «email system integrations».
- **concrete-2** · `rubric-need-shape-offline-behavior-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «offline capabilities».
- **concrete-2** · `rubric-need-shape-target-devices-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «device support».
- **concrete-2** · `rubric-need-shape-target-devices-2` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «responsive design requirements».
- **concrete-2** · `rubric-need-shape-user-count-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «scale and multi-user support».
- **concrete-2** · `rubric-recommended-everywhere` (advisory) — Every question in the round carries a recommendation, which is the interviewer answering the whole round on the person’s behalf. Найдено: «5 of 5 questions».
- **concrete-3** · `rubric-decision-opener-device-usage-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «On which devices do you plan to open and use this tool most of your working day?».
- **concrete-3** · `rubric-decision-opener-existing-data-sync-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «Where does the data about your grant applications live today that you need this tool to sync with?».
- **concrete-3** · `rubric-decision-opener-offline-capability-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «What do you need the tool to do when you lose your internet connection?».
- **concrete-3** · `rubric-decision-opener-user-scale-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How many of you will need to log into this tool to manage your grant applications?».
- **concrete-3** · `rubric-need-shape-device-usage-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «Determine primary device form factors and screen size constraints».
- **concrete-3** · `rubric-need-shape-email-integration-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «Identify external email service integrations and API dependencies».
- **concrete-3** · `rubric-need-shape-existing-data-sync-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «Identify legacy databases, spreadsheets, or CRMs that require synchronization».
- **concrete-3** · `rubric-need-shape-offline-capability-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «Determine offline usability constraints and local state syncing complexity».
- **concrete-3** · `rubric-need-shape-user-scale-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «Assess user scale and multi-tenant authentication complexity».
- **concrete-3** · `rubric-recommended-everywhere` (advisory) — Every question in the round carries a recommendation, which is the interviewer answering the whole round on the person’s behalf. Найдено: «5 of 5 questions».

### Чего рубрика не решает

Зелёная таблица выше не означает, что проверено всё: ниже — то, что текстом не решается и
остаётся судейскому проходу гейта 146.

- **whether a question should be `single` or `multiple`** — Semantics rather than text: «retry · quarantine · log · exit non-zero» add up, «in a terminal · on a schedule» exclude each other, and no reading of the words separates the two. It stays with the judge pass of gate 146.
- **whether an option carrying a note actually names a technology** — A label names a technology when it has a home page of its own, which is a fact about the world. The decidable neighbours are checked: an escape option carrying a note (`decorated-escape`), a question where every option carries one (`uniform-decoration`), a slug outside the closed set, and a link off the vendor’s own host.