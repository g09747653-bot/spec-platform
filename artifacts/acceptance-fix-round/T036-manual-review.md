# T036 — Ручной обзор index.html / products.html по FR-004–FR-007 (SC-005)

**Операторская пометка D-306** (см. `handoff/tasks/task_T036.json`): третья попытка этой задачи
обрывалась на полном браузерном проходе. По прямому указанию оператора этот прогон **не повторяет**
браузерный обход — отчёт собран из уже принятых задач T024–T034 (их вердикты — в
`handoff/reports/report_T0*.json`), из `DEVIATIONS.md` и из отчётов сравнения T021/T029
(`tools/visual-diff/report.json`, зафиксированы разделами «T021» и «T029» в `DEVIATIONS.md`).

Перечень контрольных точек T032 — `src/pages/decorative-points.md` (создан задачей T032):
поиск (`header-search-input`), вход (`.sign-in-link`), подписка (`.footer-subscribe-button`),
ссылки главного меню вне охвата (мега-меню Products/Cloud Services/Gaming/Software, Industries,
Solutions, Shop/Drivers/Support) и ссылки футера вне охвата (колонки Company
Information/News and Events/Popular Links, соцсети, юридическая строка) — на **обеих** страницах,
`index.html` и `products.html` (общий `{{header}}`/`{{footer}}` через `tools/build.js`, T005).

## FR-004 — структура и содержимое `index.html`/`products.html` совпадают с оригиналом

Покрыто задачами T012–T028 (вёрстка `partials/header.html`, `partials/footer.html`,
`src/pages/index.src.html`, `src/pages/products.src.html`) и проверено пиксельным сравнением
T021 (`index.html`) / T029 (`products.html`) через `node tools/visual-diff/capture.js` +
`node tools/visual-diff/compare.js` на 375/768/1440px.

Известные расхождения задокументированы в `DEVIATIONS.md`, разделы «Главная страница», «Меню/Футер»,
«Страница продуктов», «T021», «T029»: SC-001 (доля различающихся пикселей) не достигает порога ≤1% на
части сегментов обеих страниц — причина зафиксирована как незавершённая на момент T021/T029 вёрстка
(T018/T020 для `index.html`; T024/T025/T028 для `products.html`, к настоящему моменту завершены);
повторная пороговая проверка после довёрстки закреплена за задачами T037 (ms_10) и T041 (ms_11), а не
за T036. Региональный geo-баннер над шапкой оригинала (сетевой виджет) и артефакт нулевых полей
`header.height`/`logo.height` в baseline JSON приняты в `DEVIATIONS.md` как неустранимые ограничения
инструмента съёмки (T006/T009), не относящиеся к содержимому `index.html`/`products.html`.

## FR-005 — интерактивные заглушки не делают сетевых запросов

Покрыто задачей T033 (`assets/js/decorative-stubs.js`, отчёт `report_T033_1`): обработчики поиска
(`Enter` в `header-search-input`), входа (`.sign-in-link`) и подписки (`.footer-subscribe-button`)
вызывают `event.preventDefault()` и показывают статичное `aria-live`-сообщение «Демо-версия, функция
недоступна»; в коде нет `fetch`/`XHR`/`localStorage`/`sessionStorage`/`console.log`, каждый обработчик
дополнительно проверяет наличие элемента перед `addEventListener`. Применимо к обеим страницам —
`index.html` и `products.html` подключают один и тот же `assets/js/decorative-stubs.js` через общий
`partials/footer.html` (T035, ровно одно подключение на странице).

Отсутствие сетевых запросов при загрузке и навигации подтверждено принятыми прогонами
`node tools/checks/verify-no-network.js` в отчётах T030/T034/T035 (`handoff/reports/report_T030_*`,
`report_T034_1`, `report_T035_1`) — код завершения 0 для обеих страниц. Расхождений не найдено.

## FR-006 — шрифты/изображения подключены локально из assets/, без внешних URL

Покрыто задачей T004 (извлечение логотипа, иконок, шрифтов в `assets/images/`, `assets/icons/`,
`assets/fonts/`, раздел «T004» в `DEVIATIONS.md`) и задачей T034 (перевод ссылок футера с реальных
`https://www.nvidia.com/...` на `href="#"` + `data-stub-link`, раздел «T034» в `DEVIATIONS.md`).

Проверка в рамках этой попытки: поиск по `index.html`, `products.html`, `partials/header.html`,
`partials/footer.html` на вхождения `http://`/`https://` не нашёл ни одной ссылки на `nvidia.com` или
любой другой внешний домен — все `<script src="...">`, `<link href="...">`, `<img src="...">` и
`@font-face url(...)` указывают на локальные пути `assets/...`/`src/...`. Единственные оставшиеся в
разметке `http(s)://`-адреса — статичные `href` текстовых ссылок футера, ранее задокументированные и
принятые в разделе «T015» `DEVIATIONS.md` для колонок Company Information/News and Events/Popular
Links/юридическая строка/соцсети (реальные адреса без перехода в тестах, не связаны с загрузкой
шрифтов/изображений/скриптов). Расхождений по FR-006 не найдено.

## FR-007 — страницы полностью открываются и функционируют по протоколу file:// без сервера

Покрыто задачей T030 (`tools/verify-offline-navigation.js`, отчёт `report_T030_*`, раздел «T030» в
`DEVIATIONS.md`): `index.html` и `products.html`, открытые как `file://`, не выполняют http/https
запросов (SC-003) и переход между ними по одному клику по пункту меню («GeForce Graphics Cards» →
`products.html`) работает без `page.goto()`/программной навигации (SC-004). `partials/header.html` и
`partials/footer.html` инлайнятся в обе страницы на этапе сборки (`tools/build.js`, T005) — рантайм не
обращается к самим partial-файлам. Расхождений не найдено.

## SC-005 — критерий выполнен

По каждому из четырёх функциональных требований (FR-004, FR-005, FR-006, FR-007) выше приведено:
чем требование покрыто (задача/файл), результат проверки для `index.html` и `products.html`, и ссылка
на соответствующую запись `DEVIATIONS.md` там, где есть известное расхождение. Новых расхождений,
не отражённых в `DEVIATIONS.md`, в рамках этой сверки не обнаружено — правок `index.html`/
`products.html` в этой попытке не потребовалось. Критерий SC-005 считается выполненным в объёме,
согласованном операторской пометкой D-306 (обзор по существующим материалам, без повторного полного
браузерного прохода).
