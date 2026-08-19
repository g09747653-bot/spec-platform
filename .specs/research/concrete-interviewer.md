# «Concrete» — третий регистр интервью: связующий проект

*Задача 144 · ансамблевый прогон (ultracode): четыре кандидата, три судьи · сведено 2026-08-19*

> **Это не итог обсуждения, а то, что едет.** Победил кандидат `voice`; на него привиты запреты
> `implementation` (с починкой), правило отбрасывания `usage`, перечисление форм опции и обязательная
> опция-отказ `reference`, плюс две строки, которых не написал никто (анти-меню поставщиков и запрет
> первого лица). Где кандидаты расходились — выбор сделан и обоснован одной строкой; §6 перечисляет
> отвергнутое. Спорить по существу — только через `decisions.md`.
>
> Источники: `.specs/tasks.md` задача 144; `.specs/research/video-demo-2026-08-18.md` §5 и §6
> (справки на опциях и голос эталонного интервьюера); директива заказчика 2026-08-18 («никаких «что
> должен чувствовать муравей»»).

---

## 0. Граница

Документ задаёт **текст промпта и его детерминированную проверку**. Что он трогает и чего не трогает:

| Трогает | Не трогает |
|---|---|
| третий блок в слот `{{audienceRules}}` (`assets/interview.ts`) | `PLAIN_RULES` и `TECHNICAL_RULES` — байт в байт как были |
| три необязательных поля опции в общем system-шаблоне `interview.questions.v3` | запрет над слотом (документы/спецификации/процесс) — он выше регистра и действует на все три |
| три необязательных поля `QuestionOption` + закрытое множество слагов | `recommended`, `tags`, `allowOther`, границы раунда — контракт D-188/v3 не ужесточается |
| скриптованная рубрика (новый модуль `agents/interview/concrete-rubric.ts`) | язык контента (У-1) — его дописывает ассемблер, регистр о нём молчит |

**Выбор режима.** «Concrete» — не третий `AudienceProfile`, а вторая ось: заказчик сказал «стиль
выбирается при создании чата **рядом** с профилем аудитории». Значит `INTERVIEW_STYLES =
['default','concrete']` живёт в `projects/interview-style.ts` рядом с `audience.ts`, а селектор
становится двухаргументным:

```ts
export function audienceRules(audience: string, style?: string): string {
  return style === 'concrete' ? CONCRETE_RULES : (AUDIENCE_RULES[audience] ?? PLAIN_RULES);
}
```

Стиль **вытесняет** профиль, а не складывается с ним: «They are not technical» + «name the actual
technology» — это раунд, который хеджирует каждую опцию в категорию, то есть ровно тот дефект, на
который жалуется заказчик. Называть технологию нетехническому читателю здесь не страшно по одной
причине: в этом регистре названная технология всегда приходит со справкой, то есть опция объясняет
себя сама.

**Чего этот слот не достаёт.** Видео §6 — это реплика *между* раундами, её пишет
`interview.bridge.v1`, у которого `variables: ['context','unmetNeeds']` и никакого
`{{audienceRules}}`. Ни один регистр туда не дотягивается. AC задачи 144 говорит про «lint над
текстом раунда», и раунд — это то, что мы здесь закрываем; голос мостика в объём 144 не входит и
уходит строкой в `decisions.md` (D-220 ниже), а не молча.

---

## 1. `CONCRETE_RULES`

Вставляется в `src/modules/prompts/assets/interview.ts` рядом с двумя нетронутыми регистрами. Та же
форма: массив коротких строк, `.join(' ')`.

```ts
/**
 * The concrete register (task 144; директива заказчика 2026-08-18; видео §5–6).
 *
 * The other two registers choose a vocabulary. This one chooses a *subject*: what to build, how it
 * should be built, and how the person will use it once it runs — and nothing else. The prohibitions
 * are the load-bearing half, because the customer's complaint («что должен чувствовать муравей») was
 * not that the words were too hard; it was a question with no answer that changes anything, asked
 * through an invented character. That shape of question is one both existing registers permit, so it
 * has to be banned by name.
 *
 * Selected by style, not by audience (see `audienceRules`): it replaces the profile's register
 * rather than composing with it.
 */
const CONCRETE_RULES = [
  'They want the build pinned down, not explored.',
  'Ask only three kinds of thing: what to build, how they want it built, and how they will use it',
  'once it runs. Address them as "you" in every question and in every option, and sound the same in',
  'round three as in round one: vary what you ask about, never how you ask it. Every option is',
  'something you say to them, never something they say back — no label and no description in the',
  'first person. Never ask what someone else would feel, want or notice, never invent a persona, a',
  'story or a scene to ask through, never ask for an adjective, never put a decision into a',
  'metaphor. Ask about use as observable behaviour — what they run first, how often they come back,',
  'what they do the day it breaks — never about mood, motivation or personality. Every question',
  'settles one thing they could decide today and a builder could act on tomorrow, and no two',
  'questions in a round settle the same thing; drop any question whose answers would all leave the',
  'built thing identical. Never ask for a number they would have to go and measure, and never',
  'assume a decision they have not yet taken. Every option is something that can be chosen and then',
  'done — a named technology, a mechanism, a limit, an order of work — never a category, a theme or',
  'an adjective, and never "a balance of both". Do not build a question out of interchangeable',
  'products: where the options would differ only in the name on the bill, that is a setting, not a',
  'question. Name technologies where they commit the build to something different — a different',
  'data model, a different place it runs, a different failure — and give every such question one',
  'option that declines: "No preference — recommend the best fit".',
].join(' ');
```

**Порядок предложений — не редакторский, а по частоте отказа.** Сначала предмет (три вида вопросов),
потом голос (второе лицо, постоянство между раундами, запрет первого лица), потом запрет
персонажей — это отчётный дефект и он должен стоять до правил об опциях, — потом положительная
половина «как будут пользоваться», потом фильтр ценности вопроса, потом форма опции, и последним
анти-меню, потому что оно ограничивает всё предыдущее.

**Девять строк из девятнадцати — запреты.** Регистр нельзя изложить положительно: его провал
(персонаж-фикция) — это не ошибка словаря, которую уже ловит список тем, а *форма* вопроса, которую
оба существующих регистра разрешают.

**Цена.** 1709 символов против 397 у `TECHNICAL_RULES` и 262 у `PLAIN_RULES` — ≈430 токенов на
system-промпт каждого раунда Concrete. Промпт интервью на порядок меньше генерационного, в окно
гейтовой модели (`qwen3:8b`, 16384) он входит с запасом; строку измерения держим в рапорте гейта 146,
потому что урок «окно не держит генерационный промпт» уже стоил одного прогона.

Спорные места, по строке на каждое:

- **«и в каждой опции», а не только «в каждом вопросе»** — три кандидата из четырёх сами уронили
  первое лицо именно в опции («I pass an endpoint», «Pick one for me»), так что область действия
  правила расширена туда, где оно ломается.
- **«Every option is something you say to them, never something they say back»** — этой строки не
  написал никто; она добавлена, потому что «обращайся на «вы»» эмпирически не покрывает ярлык опции.
- **«never assume a decision they have not yet taken»** вместо кандидатского «or a decision they have
  not taken» — буквальное чтение оригинала запрещало спрашивать обо всём нерешённом, то есть обо всём
  ценном; чинится одним словом.
- **«drop any question whose answers would all leave the built thing identical»** — взято дословно у
  `usage`: это единственная формулировка критерия, которая говорит модели, что *делать*, когда вопрос
  не проходит.
- **«no two questions in a round settle the same thing»** — единственная строка панели, ловящая
  наложение осей, которое испортило три из четырёх образцовых раундов; в рубрике у неё есть
  разрешимый двойник (§4, правило 3.4).
- **Анти-меню поставщиков** — не написал никто, а гравитация справки тянет ровно туда: при seed'е «S3
  совместимое хранилище» API задан посылкой, и «какой провайдер» меняет строку по умолчанию и сноску
  в счёте.
- **Обязательная опция-отказ** — из `reference`: она одновременно даёт человеку выход из допроса и
  оставляет в каждом технологическом вопросе гарантированный контрольный случай без справки.
- **Про уровень словаря не сказано ничего** — намеренно: стиль вытесняет профиль (§0), и если однажды
  ассемблер начнёт склеивать, а не заменять, блок останется совместим с обоими регистрами.
- **Регистр не упоминает справки** — их разрешает общий блок ниже по промпту, и он самотриггерный
  («опция называет технологию»); упоминание здесь только удлинило бы блок.

---

## 2. Правки промпт-ассета `interview.questions.v3`

Файл `src/modules/prompts/registry.ts`, ассет `INTERVIEW_QUESTIONS`. Две правки в `system`, две новые
переменные. Регистры при этом не трогаются: справка — свойство опции, а не регистра, и живёт в общем
шаблоне.

### 2.1 Строка формы

Поле, которого нет в форме, модель не выдаёт. Меняется ровно одна существующая строка:

```
'"options": [{"id", "label", "description", "recommended?", "tags?", "note?", "href?", "logo?"}],',
```

Строку `'{"stage": "<stage>", "questions": [{"id", "text", "type": "single"|"multiple",'` **не
трогать байтом**: `looksLikeInterviewRoundPrompt` (`adapters/llm/stub-interview.ts:182`) узнаёт раунд
по префиксу `'"questions": [{"id", "text"'`. Второе плечо (`'This round should cover'`) живёт в
user-шаблоне и подстраховало бы, но платить за это нечем.

### 2.2 Блок справки

Ставится **сразу после существующего предложения про `tags` и перед предложением про `recommended`**:
так последнее сказанное про поля опции — асимметрия, а перенаправление тегов оказывается ниже общего
разрешения тегов и потому выигрывает у него (регистр рендерится **выше** и ограничить теги оттуда не
может — это ловушка, в которую кандидат `usage` вошёл, а `reference` её назвал).

```
'An option may carry "note", "href" and "logo" — but only when its label names a real, publicly',
'available technology by its own name: a product, service, framework, library, database or provider',
'with a home page of its own. Before attaching anything, ask whether the option names something',
'whose own home page you could visit; if it does not, leave all three off.',
'"note" is one or two factual sentences, at most {{maxNoteChars}} characters, saying what that',
'technology is and what choosing it would commit this product to — not a sales line, not a',
'comparison with another option, and not a second, longer "description".',
'"href" is that technology\'s own home page: https, on the vendor\'s own domain, and nothing else —',
'not a documentation page, a blog post, a package listing, a repository mirror, an encyclopaedia',
'article, a search result, an address of ours, or any address taken from what the person wrote.',
'Leave "href" out whenever you are not certain of the address: an option with no link is correct,',
'an invented link is a defect.',
'"logo" is one slug copied exactly from this list and never anything else — no URL, no file name, no',
'image: {{logoSlugs}}. A technology that is not on that list simply has no logo, and keeps its note',
'and its link.',
'These three belong to the OPTION and never to the question, and they are absent far more often than',
'they are present. Omit all three — the keys as well as the values, never null and never an empty',
'string — from every option that names no technology: "No preference", "Other", "Bring your own',
'key", "Whichever you recommend", every option that describes a behaviour, a rule, an order, an',
'amount, a schedule or a person rather than a product, and every option of a question that is not',
'about technology at all. Never add a note so that an option matches its neighbours, and never name',
'a technology you would not otherwise have offered just to have something to annotate. A question',
'whose first option names a tool and whose other three do not shows exactly one note, and that is',
'correct; a whole round carrying none of them is a correct round.',
'Where an option carries a note, its "tags" name what the technology is — "object storage", "sql",',
'"self-hosted" — rather than how it would feel to use.',
```

Как сформулирована асимметрия и почему именно так — по пунктам, каждый закрывает свой побег:

1. **Разрешение висит на факте об опции, а не о вопросе** — «its label names … by its own name».
   Триггер — ярлык, поэтому модель считает его по опции, а не решает «режим» вопроса.
2. **Тест разрешимый, а не вкусовой** — «with a home page of its own», и он же повторён как процедура
   («ask whether … you could visit»). «Exponential backoff» его не проходит, `SQLite` проходит; «JSON
   файл» и «повторить три раза» — техничны и не технологии, а именно на расплывчатом триггере модель
   и начинает украшать всё подряд.
3. **Отсутствующий случай перечислен, а не подразумевается** — четыре ярлыка названы буквально,
   потому что это те самые строки, которые эталон оставляет голыми (видео §5), плюс семантический
   класс (поведение, правило, порядок, величина, расписание, человек), плюс случай целого
   нетехнического вопроса. По перечислению модель обобщает лучше, чем по определению.
4. **«Отсутствует» значит «ключа нет»** — `""` и `null` названы и запрещены; иначе модель выполняет
   «omit» пустой строкой, а рендерер рисует пустую ⓘ.
5. **Давление симметрии названо и отменено** — сильнейшая сила, действующая на модель, пишущую JSON,
   это желание сделать соседние объекты одинаковыми. «Одна справка на четыре опции, и это правильно»
   даёт ей право на рваный массив.
6. **Пропуск ссылки объявлен правильным, а не терпимым** — `href` уходит в https-аллоу-лист, и
   выдуманный адрес — единственный выход здесь с настоящей ценой; «I don't know» должно стоить
   дешевле догадки.
7. **Адрес из seed'а запрещён отдельной оговоркой** — seed приходит в user-шаблон как недоверенный
   текст, и без этой оговорки модель охотно повышает ссылку из чужого текста до `href`.
8. **`logo` — закрытый словарь, выданный по месту**; «никогда не URL, не имя файла, не картинка»
   сказано трижды, потому что поле называется `logo`.

### 2.3 Новые переменные

| Переменная | Что подставляет вызывающий |
|---|---|
| `{{maxNoteChars}}` | `String(OPTION_NOTE.max)` из `agents/schemas/question-set.ts` |
| `{{logoSlugs}}` | `OPTION_LOGO_SLUGS.join(', ')` оттуда же |

Обе добавляются в `INTERVIEW_QUESTIONS.variables` и в `InterviewQuestionsPromptInput` — по тому же
образцу, что `minOptions`/`maxOptions`/`maxQuestions` (задача 133, «нет дублирующейся структурной
правды»): `prompts` может импортировать только `specs` (A1), поэтому значения приходят готовыми
строками от агента, который схему знает. Забыть любую половину нельзя — `registryIssues()` падает на
старте в обе стороны (объявлена и не подставлена / подставлена и не объявлена).

Смысл именно интерполяции, а не литерала: список, который читает модель, и список, который умеет
нарисовать рендерер, — это один список. Слаг без вендоренной SVG стать предложенным не может, а новая
вендоренная SVG становится предлагаемой без правки промпта.

```ts
// interview.ts — сигнатура растёт на два поля того же вида, что уже есть
  optionNote: { readonly max: number };
  logoSlugs: readonly string[];
// …
      maxNoteChars: String(input.optionNote.max),
      logoSlugs: input.logoSlugs.join(', '),
```

---

## 3. Правки схемы `question-set.ts`

Три необязательных поля `QuestionOption`, одна константа длины, одно закрытое множество слагов и одна
таблица вендорских хостов. Всё — **по контракту совместимости D-188/v3**: поля необязательны, каждый
раунд, записанный до правки, остаётся валидным и рисуется как раньше.

```ts
/**
 * Справка на опции (task 144; видео §5).
 *
 * Три поля, и все три — свойство ОПЦИИ. Их валидация устроена как у `recommended` и `tags`, с одним
 * добавлением: значения, которые модель могла выдумать, **отбрасываются, а не роняют раунд**. Раунд
 * репарируется один раз и затем выбрасывается с `DRAFT_INVALID`; галлюцинированная ссылка не имеет
 * права стоить живой прогулке целого раунда — она стоит своего чипа.
 */
export const OPTION_NOTE = { max: 240 } as const;

/** Закрытый набор слагов: ровно то, что рендерер вендорит инлайновой SVG. */
export const OPTION_LOGO_SLUGS = [
  'anthropic',
  'openai',
  'openrouter',
  'nextjs',
  'react',
  'neon',
  'mongodb',
  'sqlite',
] as const;

export type OptionLogoSlug = (typeof OPTION_LOGO_SLUGS)[number];

/** Собственный домен вендора: слаг сам себе аллоу-лист для ссылки. */
const LOGO_HOSTS: Readonly<Record<OptionLogoSlug, readonly string[]>> = Object.freeze({
  anthropic: ['anthropic.com'],
  openai: ['openai.com'],
  openrouter: ['openrouter.ai'],
  nextjs: ['nextjs.org'],
  react: ['react.dev', 'reactjs.org'],
  neon: ['neon.com', 'neon.tech'],
  mongodb: ['mongodb.com'],
  sqlite: ['sqlite.org'],
});

/** Домашняя страница и ничего кроме: https, без учётки, порта, запроса, якоря; не глубже сегмента. */
const HomePageUrl = z
  .string()
  .trim()
  .max(200)
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.hostname.includes('.') &&
      url.pathname.split('/').filter(Boolean).length <= 1
    );
  }, 'href must be a vendor home page over https');

export const QuestionOption = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    recommended: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(24)).max(4).optional(),
    /** Справка: что это за технология и к чему обязывает её выбор. */
    note: z.string().trim().min(1).max(OPTION_NOTE.max).optional().catch(undefined),
    /** Ссылка на её собственный сайт. Недоверенный ввод: не прошло — выброшено. */
    href: HomePageUrl.optional().catch(undefined),
    /** Слаг из закрытого набора. Не URL, не имя файла. */
    logo: z.enum(OPTION_LOGO_SLUGS).optional().catch(undefined),
  })
  .transform((option) => {
    const { note, href, logo, ...rest } = option;

    // Ссылка или логотип без справки — украшение: сама справка и есть то, ради чего они висят.
    if (note === undefined) return rest;

    // Слаг знает свой домен: ссылка на чужом хосте при известном логотипе — догадка, а не адрес.
    const host = href === undefined ? null : new URL(href).hostname.replace(/^www\./, '');
    const trusted =
      logo === undefined ? href !== undefined : host !== null && (LOGO_HOSTS[logo] ?? []).includes(host);

    return {
      ...rest,
      note,
      ...(trusted && href !== undefined ? { href } : {}),
      ...(logo === undefined ? {} : { logo }),
    };
  });
```

Обоснование каждого слага — критерий один: **технология, которую эталон в своих же вопросах реально
предлагает опцией** (видео §5, кадры 57–75, кроп в полном разрешении). Список закрыт этими восемью и
не расширяется «на всякий случай»:

| Слаг | Где виден у эталона |
|---|---|
| `anthropic` | опция вопроса о провайдере модели; чипы `ai · llm · provider · api · foundation-model · reasoning · commercial` |
| `openai` | соседняя опция того же вопроса, тот же набор чипов |
| `openrouter` | третья опция того же вопроса — шлюз, рядом с `Bring-your-own-key` без логотипа |
| `nextjs` | опция вопроса о фреймворке; чипы `framework · react · ssr · frontend · meta-framework · javascript · web` |
| `react` | соседняя опция того же вопроса |
| `neon` | опция вопроса о хранилище; чипы `authentication · cloud-computing-platform · database · storage` |
| `mongodb` | соседняя опция того же вопроса |
| `sqlite` | она же, чипы `sql · database · db` |

Технология вне набора (в §5 это `PostgreSQL` на своём сервере) **сохраняет справку и ссылку и теряет
только логотип** — деградация поштучная, а не всем блоком: половина справки, которая полезна,
не должна уходить вместе с половиной, которая декоративна.

`OPTION_NOTE` — **новая** константа: сегодня в `question-set.ts` нет ничего про длину справки (два
кандидата описывали её как существующую правду — её нет). 240 символов ≈ две фактические фразы; ⓘ —
всплывающая справка, а не второй абзац описания.

Что **не** меняется и почему: `recommended` остаётся «не больше одной на вопрос», хотя видео §5
показывает `(Recommended)` сразу на нескольких опциях одного вопроса эталона. Расхождение реальное,
но правка каскадом идёт в рендер бейджа и в v3-контракт; оно уходит строкой в таблицу сверки гейта
146, а не в эту задачу.

---

## 4. Скриптованная рубрика

Новый модуль `src/modules/agents/interview/concrete-rubric.ts` + `concrete-rubric.test.ts`, по духу
`specs/lint/lint-spec.ts`: **всё, что решается чтением текста, решается кодом, а не вызовом модели.**
Измерение всегда доступно, всегда даёт один и тот же ответ дважды, ничего не стоит и переживает
исчерпанную цепочку провайдеров — а это ровно тот момент, когда рубрика нужнее всего.

### 4.0 Контракт модуля

```ts
export const CONCRETE_CHECKS = [
  'second-person',
  'forbidden-vocabulary',
  'question-shape',
  'spravka-asymmetry',
] as const;

export type ConcreteCheck = (typeof CONCRETE_CHECKS)[number];

export interface ConcreteFinding {
  check: ConcreteCheck;
  /** Стабилен между прогонами: правило + место. */
  id: string;
  severity: 'blocking' | 'advisory';
  questionId: string;
  optionId?: string;
  message: string;
  /** Найденный фрагмент — чтобы рапорт гейта читался без исходника. */
  evidence: string;
}

export interface ConcreteRubricInput {
  /** Сырой черновик модели, ДО схемы: схема молча отбрасывает мусор, рубрика обязана его назвать. */
  draft: unknown;
  /** Он же после `validateQuestionSetDraft`, когда валиден. */
  set: QuestionSet | null;
  /** Язык контента сессии (У-1), ISO 639-1, или null. */
  language: string | null;
  /** Seed сессии — для правила 4.6. */
  initialPrompt: string;
}

export function checkConcreteRound(input: ConcreteRubricInput): ConcreteFinding[];
```

Порядок находок стабилен: сортировка по индексу в `CONCRETE_CHECKS`, затем по `id` через
`localeCompare` — как в `lintSpecDocument`. Две прогонки над одними байтами дают одну доску.

### 4.1 Нормализация и границы слова

`norm(text)` = NFC → нижний регистр → `ё`→`е` → типографские апострофы и тире в ASCII → схлопывание
пробелов. Токенизация — по `/[^\p{L}\p{N}']+/u`.

**Границы слова считать через `\b` нельзя**: в JS `\b` определена через `\w` = `[A-Za-z0-9_]`, то есть
для кириллицы она стоит между каждой буквой и следующей. Все лексиконные совпадения ищутся
**по токенам**, а не регулярками по строке; словарная запись — либо точный токен (`вы`), либо префикс
с `*` (`чувств*`), который сравнивается через `token.startsWith`. Это же убивает целый класс ложных
срабатываний: токен `персональные` не равен токену `персона` и префиксом не является.

Многословные записи (`acceptance criteria`, `критерии приёмки`) ищутся как последовательность токенов.

### 4.2 Выбор языка

`lang = input.language ?? 'en'`. Лексиконы заданы для `en` и `ru`. Для языка без лексикона выполняются
только языконезависимые проверки (§4.5, §4.6) и выпускается одна находка
`rubric-language-unsupported` (advisory) с названием языка — **молчание не читается как «зелено»**.

Для `ru` уточнение по `.specs/research/ru-interface-voice.md` §0: стандарт хрома явно выводит тексты
вопросов и опций из-под себя, поэтому предпочтение «по возможности без местоимения» на вопросы **не
распространяется** — в контенте «вы/ваш» желательны, и проверка 4.3.1 вправе их требовать.

### 4.3 Проверка `second-person`

**4.3.1 `second-person-question` (blocking).** Текст каждого вопроса содержит хотя бы один маркер
второго лица.

- `en`: `you`, `your`, `yours`, `yourself`, `yourselves`.
- `ru`: `вы`, `вас`, `вам`, `вами`, `ваш*`; **плюс** глагольная форма 2 л. мн. ч. — токен, отвечающий
  `/(ете|ёте|ите)$/u`, у которого предыдущий токен **не** предлог из набора `{в, во, на, о, об, обо,
  при, по}` (это отсекает предложный падеж: «в отчёте», «на сайте», «при запуске») и который не
  входит в стоп-лист существительных.
  Глагольное плечо вторично: оно снижает ложные срабатывания, а не заменяет местоимение.

**4.3.2 `first-person-voice` (blocking).** Ни `text` вопроса, ни `label`, ни `description`, ни `note`
опции не содержат маркера первого лица.

- `en`: `i`, `i'm`, `i'll`, `i've`, `my`, `me`, `mine`, `we`, `we're`, `our`, `ours`, `us`, `let's`.
- `ru`: `я`, `мне`, `меня`, `мной`, `мой*`, `моя`, `моё`, `мои*`, `мы`, `нам`, `нас`, `нами`, `наш*`,
  `давайте`.

Это правило поймало бы три кандидата из четырёх на их же образцовых раундах (`"No default — I pass an
endpoint every run"`, `"In a container beside my other services"`, `"Pick one for me and say why"`).

**4.3.3 `second-person-coverage` (advisory).** Меньше половины `description` раунда несут маркер
второго лица — голос держится в вопросах и осыпается в опциях.

### 4.4 Проверка `forbidden-vocabulary`

Область: `text`, `label`, `description`, `note`.

**4.4.1 `persona-and-feeling` (blocking).** Лексикон А:

- `en`: `feel`, `feels`, `feeling*`, `imagine`, `envision`, `persona*`, `delight*`, `emotion*`,
  `mood`, `vibe`, `magical`, `metaphor`, и биграммы `as a user`, `user journey`, `user story`,
  `picture a`, `think of it as`.
- `ru`: `чувств*`, `ощущ*`, `представьте`, `вообразите`, `персонаж*`, `персона`, `настроени*`,
  `атмосфер*`, `эмоци*`, `волшебн*`, `каково`, биграмма `путь пользователя`.

**4.4.2 `our-artifacts` (blocking).** Тот запрет, который стоит над слотом и до сих пор никем не
измерялся:

- `en`: `constitution`, `specification*`, `spec`, `specs`, `milestone*`, `artifact*`, `roadmap`,
  биграммы `acceptance criteria`, `the plan`, `this plan`, `the document`, `this document`,
  `spec file`.
- `ru`: `конституци*`, `спецификаци*`, `артефакт*`, `веха`, `вехи`, биграммы `критерии приёмки`,
  `этот документ`, `раздел документа`.

Одиночные `plan`, `format`, `section`, `план`, `формат`, `раздел` **в лексикон не входят**: это
законные продуктовые слова («тарифный план», «формат экспорта»), а линтер, который ругается на
законное слово, выключают за день (доктрина `lint-spec.ts`). Ловятся определённые биграммы — то есть
разговор именно про *наш* документ.

**4.4.3 `hedge-option` (blocking).** Нормализованный `label` совпадает с одним из: `both`, `either`,
`it depends`, `a mix of both`, `a balance of both`, `a combination of the two`, `somewhere in
between`, `all of the above`, `none of the above`; `ru`: `оба`, `и то и другое`, `зависит от
ситуации`, `что-то среднее`, `всё перечисленное`. Санкционированный отказ (`^no preference\b`,
`^без предпочтений`) исключён явно.

**4.4.4 `duplicate-escape` (blocking).** Авторская опция, чей `label` нормализуется в `other`,
`something else`, `other (please specify)`, `другое`, `иное`: свободный ввод рисуется из
`allowOther`, ровно один на вопрос, и конкурирующая опция его дублирует (это сказано в докблоке
схемы).

### 4.5 Проверка `question-shape`

| id | severity | Предикат |
|---|---|---|
| `question-mark` | blocking | `text` заканчивается на `?` (или `？`) |
| `option-description` | blocking | у каждой опции непустой `description` — агенту-кодеру приходит `id + description`, и пустое описание делает ответ нечитаемым |
| `duplicate-decision` | blocking | два вопроса раунда делят элемент `informationNeeds` (после `trim` + нижнего регистра) — разрешимый двойник правила «no two questions settle the same thing» |
| `measured-number` | blocking | `text` содержит `how many`/`how much` (`сколько`) **и** каждый `label` начинается с числа (`/^\D{0,3}\d/`) — это и есть спрошенное измерение; «how often do you come back» с поведенческими опциями сюда не попадает |
| `question-length` | advisory | `text` длиннее 160 символов |
| `need-shape` | advisory | элемент `informationNeeds` не отвечает `/^[a-z0-9]+(-[a-z0-9]+)*$/` — нужды это ключи учёта, а не проза |
| `decision-opener` | advisory | `text` не начинается ни с одной санкционированной рамки: `which`, `what should`, `what happens`, `how should`, `how will you`, `how do you want`, `where should`, `who will`, `who runs`, `in what order`, `when`; `ru`: `какой/какая/какие/каким`, `что должно`, `что произойдёт`, `как должно`, `как вы`, `где должно`, `кто будет`, `в каком порядке` |
| `recommended-everywhere` | advisory | каждый вопрос раунда несёт `recommended` — интервьюер ответил за человека на весь раунд |

`decision-opener` держится advisory сознательно: это скриптовый прокси к «только вопросы про
реализацию и использование», и грамматика эталона (`«In what order should the work be sequenced?»`,
`«Who will execute this plan?»`, `«What metadata should each task carry?»`) в него укладывается, но
законная перестановка слов — нет. Ложный минус здесь читают, а не блокируют.

**Чего рубрика не решает и не притворяется, что решает.** Правильность `type: single` против
`multiple` — семантика: «повторить · карантин · лог · выйти с ненулевым кодом» складываются, а «в
терминале · по расписанию» исключают друг друга, и текстом это не разделить. Это остаётся предметом
судейского прохода гейта 146 и названо здесь, чтобы никто не принял зелёную рубрику за проверку
кардинальности.

### 4.6 Проверка `spravka-asymmetry`

Работает **по сырому черновику**: схема (§3) молча отбрасывает негодные значения, а рубрика обязана
сказать, что модель их выдала.

| id | severity | Предикат |
|---|---|---|
| `note-required-for-link` | blocking | есть `href` или `logo`, нет `note` |
| `empty-extras` | blocking | `note`/`href`/`logo` присутствуют как `""` или `null` |
| `unknown-logo` | blocking | `logo` вне `OPTION_LOGO_SLUGS` |
| `foreign-host` | blocking | при известном `logo` хост `href` (без `www.`) не из `LOGO_HOSTS[logo]` |
| `href-shape` | blocking | `href` не проходит `HomePageUrl`: не https, есть учётка/порт/запрос/якорь, путь глубже одного сегмента, хост без точки |
| `seed-borrowed-href` | blocking | хост `href` встречается в `initialPrompt` — недоверенный ввод, поднятый моделью из чужого текста в ссылку |
| `decorated-escape` | blocking | ярлык вида `^no preference`, `^bring your own`, `^whichever you recommend`, `^other`, `^без предпочтений`, `^свой ключ`, `^другое` несёт любое из трёх полей |
| `uniform-decoration` | blocking | у вопроса ≥3 опций и **каждая** несёт `note` — обязательная опция-отказа либо отсутствует, либо украшена |
| `note-markup` | blocking | `note` содержит `<`, `](` или `http` |
| `note-repeats-description` | advisory | коэффициент Жаккара по содержательным токенам `note` и `description` ≥ 0.6, либо один входит в другой |
| `note-too-short` | advisory | `note` короче 40 символов — не говорит ничего сверх ярлыка |

**Не-правило, записанное явно, чтобы его не добавили потом:** раунд без единой справки находкой
**не является**. Асимметрия — свойство опции; вопрос про политику отказов, где нет ни одной
технологии, обязан быть голым целиком.

### 4.7 Как рубрика применяется

- **AC «3 живых раунда»**: гейт 146 гоняет `checkConcreteRound` над каждым выданным раундом живой
  прогулки; зелено = ноль `blocking`; `advisory` попадают в рапорт списком, а не в вердикт.
- **Юнит**: `concrete-rubric.test.ts` держит оба образцовых раунда §5 (ноль находок) и по одной
  порченой копии на правило — идентификаторы находок сверяются точно, как в `lint-spec.test.ts`.
- **Регистр**: случаи третьего блока — в `assets/interview-topics.test.ts`, рядом с существующими:
  `style: 'concrete'` кладёт в `system` строку `vary what you ask about`, **не** кладёт ни
  `They are not technical`, ни `comfortable with engineering vocabulary`, и по-прежнему несёт
  `Never ask about documents`; неизвестный стиль откатывается на профиль; `{{logoSlugs}}` рендерится
  непустым.
- **Стаб**: в `adapters/llm/stub-interview.ts` — раунд Concrete по образцу `recommend()`/`tagged()`:
  одна опция с полной справкой, одна голая **в том же вопросе**, и справка длиной ≥160 символов.
  Стаб, пишущий только короткие строки, проходит и сломанную вёрстку — урок стоил одного прогона.

---

## 5. Два образцовых раунда

Seed обоих: **«An internal tool that turns incoming customer email into draft replies our support
team edits and sends»**. Оба проверены `validateQuestionSetDraft` без репарации и всеми правилами
§4 (`ALL CHECKS PASS`); они же — фикстуры теста рубрики и материал стаба.

Раунды нарочно разные по стадии и по плотности справок: `solution` — плотный, `tasks` — **пустой**,
потому что «раунд без справок — правильный раунд» должно быть доказуемо, а не только разрешено.

### 5.1 Стадия `solution`, раунд 2

4 вопроса, 18 опций, 9 со справкой против 9 голых, самая длинная справка — 218 символов.

```json
{
  "stage": "solution",
  "questions": [
    {
      "id": "q-provider",
      "text": "Which provider should the drafting run through when you first switch it on?",
      "type": "single",
      "options": [
        {
          "id": "anthropic",
          "label": "Anthropic Claude",
          "description": "One vendor, called directly: one key to hold, one SDK to keep current, one place to look when a draft comes back wrong.",
          "note": "Anthropic makes the Claude family of models and sells access to them directly through its own API. Choosing it means a single vendor, a single key, and a model line-up you follow rather than choose from.",
          "href": "https://www.anthropic.com",
          "logo": "anthropic",
          "tags": ["llm provider", "direct api", "one key"]
        },
        {
          "id": "openai",
          "label": "OpenAI",
          "description": "The same shape of integration, against the vendor most of the surrounding tooling was written for.",
          "note": "OpenAI makes the GPT family and sells access through its own API. Choosing it means the widest set of libraries and examples to borrow from, and the same single-vendor dependency any direct integration carries.",
          "href": "https://openai.com",
          "logo": "openai",
          "tags": ["llm provider", "direct api", "broad tooling"]
        },
        {
          "id": "openrouter",
          "label": "OpenRouter",
          "description": "One key reaches many vendors: you can change model later without touching the app, and a third party sits in the path.",
          "recommended": true,
          "note": "OpenRouter is a paid gateway that puts many vendors' models behind one key and one API shape. Choosing it means changing model is a config edit, and that someone else sits between you and whoever serves the request.",
          "href": "https://openrouter.ai",
          "logo": "openrouter",
          "tags": ["gateway", "many vendors", "one key"]
        },
        {
          "id": "byo-key",
          "label": "Bring your own key",
          "description": "Each person pastes the key for whatever account they already have; nothing is billed centrally and no key is stored for the team."
        },
        {
          "id": "no-preference",
          "label": "No preference — recommend the best fit",
          "description": "The default is chosen for you and written down with the reason; it stays changeable later."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["model-provider", "vendor-lock-in"]
    },
    {
      "id": "q-store",
      "text": "Where should your team's drafts and their history live?",
      "type": "single",
      "options": [
        {
          "id": "sqlite",
          "label": "A SQLite file on the machine that runs it",
          "description": "Nothing else to install or pay for; a backup is a file copy, and only that one machine can read it.",
          "note": "SQLite is a SQL database that lives in a single file on disk, with no server to install or keep running. Choosing it means backups are a file copy, and everything reading the data sits on the machine holding that file.",
          "href": "https://sqlite.org",
          "logo": "sqlite",
          "tags": ["embedded", "single file", "sql"]
        },
        {
          "id": "neon",
          "label": "Neon, a hosted Postgres",
          "description": "Ordinary SQL that several machines can reach at once, on someone else's hardware and someone else's bill.",
          "recommended": true,
          "note": "Neon runs PostgreSQL as a managed service, with storage separated from compute so an idle database costs little. Choosing it means ordinary SQL, and a third party holding the mail your team drafts against.",
          "href": "https://neon.com",
          "logo": "neon",
          "tags": ["managed postgres", "sql", "hosted"]
        },
        {
          "id": "mongodb",
          "label": "MongoDB",
          "description": "Each draft stored whole, with whatever fields it happens to have; reporting across drafts gets harder later.",
          "note": "MongoDB stores records as documents rather than rows, and Atlas is the hosted version its makers run. Choosing it means no schema to agree on up front, and no joins on the day you want them.",
          "href": "https://www.mongodb.com",
          "logo": "mongodb",
          "tags": ["document store", "flexible schema", "hosted"]
        },
        {
          "id": "self-run-postgres",
          "label": "PostgreSQL on a server you already run",
          "description": "The customer mail never leaves your own hardware, and the upgrades and backups are yours to do.",
          "note": "PostgreSQL is the open-source SQL database most of this list runs or imitates. Choosing it on your own server means nobody else holds the data, and that upgrades, backups and uptime become your work.",
          "href": "https://www.postgresql.org",
          "tags": ["self-hosted", "sql", "your backups"]
        },
        {
          "id": "no-preference",
          "label": "No preference — recommend the best fit",
          "description": "The default is chosen for you and written down with the reason; it stays changeable later."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["persistence-layer", "data-residency"]
    },
    {
      "id": "q-key-handling",
      "text": "How should it get hold of the provider key on the machine you run it on?",
      "type": "single",
      "options": [
        {
          "id": "env-var",
          "label": "From an environment variable set by whoever deploys it",
          "description": "Nothing to type after the first setup, and the key is readable by anything else running as that user."
        },
        {
          "id": "os-keychain",
          "label": "From the operating system's keychain, unlocked at login",
          "description": "The key never sits in a file you could accidentally copy; a machine nobody logs into cannot unlock it."
        },
        {
          "id": "first-run-prompt",
          "label": "Typed once on first run and kept in a file only that user can read",
          "description": "One prompt and then never again, at the cost of a key in plain text on disk."
        },
        {
          "id": "every-start",
          "label": "Asked for every time it starts",
          "description": "Nothing is stored anywhere, and it cannot start on its own after a reboot."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["credential-storage"]
    },
    {
      "id": "q-surface",
      "text": "How should your team open the queue of drafts?",
      "type": "single",
      "options": [
        {
          "id": "nextjs-app",
          "label": "A page in the browser, served by Next.js",
          "description": "One address anyone on the team opens; you host a server, and the screen and its API ship together.",
          "recommended": true,
          "note": "Next.js is a React framework that renders pages on the server and brings its own routing and build. Choosing it means one codebase for the screen and its API, and a deployment target that expects a Node process.",
          "href": "https://nextjs.org",
          "logo": "nextjs",
          "tags": ["react framework", "server rendered", "web"]
        },
        {
          "id": "react-spa",
          "label": "A React app talking to a small API",
          "description": "The screen can be hosted as plain files anywhere, and the API behind it becomes a second thing to build and run.",
          "note": "React is the library the interface itself would be written in; on its own it draws the screen and nothing else. Choosing it alone means a separate API to build, and a page that is blank until its script loads.",
          "href": "https://react.dev",
          "logo": "react",
          "tags": ["frontend", "single page", "javascript"]
        },
        {
          "id": "mail-client-plugin",
          "label": "Inside the mail client they already have open",
          "description": "Nobody learns a new screen; you are then bound to what that client's plugins are allowed to do."
        },
        {
          "id": "cli",
          "label": "A command on one machine, run when someone wants a batch",
          "description": "Least to build and nothing to host; only the person at that machine can work the queue."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["primary-surface", "team-access"]
    }
  ]
}
```

Что раунд демонстрирует намеренно:

- **`no-preference` голый внутри полностью технологического вопроса** — асимметрия там, где модели
  сильнее всего хочется её сломать; и то же самое с `byo-key`, буквально одной из строк видео §5.
- **`self-run-postgres`: справка и ссылка есть, логотипа нет** — слаг вне закрытого набора, и поле
  отваливается поштучно, а не тянет за собой полезную половину.
- **`q-key-handling` — технический вопрос без единой справки**: ключ из переменной среды, из
  keychain, из файла — это поведение, а не продукты. Это тот трудный случай, ради которого в §2
  написан семантический класс исключений.
- **`q-surface`: две справки из четырёх опций в одном вопросе** — справка привязана к опции, не к
  вопросу.
- **`q-provider` переживает анти-меню**: три опции различаются не именем в счёте, а тем, что придётся
  построить — прямой SDK против шлюза против «ключ у каждого свой», то есть абстракция провайдера,
  место хранения ключа и то, кому приходит счёт.
- Все четыре текста вопроса несут `you`/`your`, ни одного первого лица, ни одной сцены.

### 5.2 Стадия `tasks`, раунд 1

4 вопроса, 16 опций, **ноль справок** — и это правильный раунд. Здесь же прописаны два вопроса,
поднятые из проигравших кандидатов (§6), и переприцеленный вопрос эталона.

```json
{
  "stage": "tasks",
  "questions": [
    {
      "id": "q-first-slice",
      "text": "Which piece do you want working end to end first?",
      "type": "single",
      "options": [
        {
          "id": "one-mailbox",
          "label": "Mail in, draft out, for one mailbox and one person",
          "description": "The whole path proves itself on day one; nobody else can use it until the second piece lands.",
          "recommended": true,
          "tags": ["thinnest slice", "proves the path"]
        },
        {
          "id": "queue-screen",
          "label": "The queue screen, against drafts you paste in by hand",
          "description": "Your team can react to the shape of the work before any model is wired in.",
          "tags": ["feedback first"]
        },
        {
          "id": "provider-plumbing",
          "label": "The provider plumbing — keys, retries, fallbacks — before any screen",
          "description": "The part most likely to be rebuilt is settled first, and there is nothing to look at for a while."
        },
        {
          "id": "history-import",
          "label": "Import of the mail your team has already answered",
          "description": "The first drafts sound like your team rather than like a model, and no draft appears until the import works."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["build-order", "first-usable-slice"]
    },
    {
      "id": "q-first-run",
      "text": "When you first point it at a mailbox that already holds ten thousand messages, what should happen?",
      "type": "single",
      "options": [
        {
          "id": "new-only",
          "label": "Nothing to the backlog — draft only for mail that arrives after it starts",
          "description": "The first run costs nothing and finishes at once; the ten thousand stay untouched for good.",
          "recommended": true
        },
        {
          "id": "backfill-all",
          "label": "Work through everything still unanswered, oldest first, in the background",
          "description": "The backlog clears on its own, and the first day's provider bill is the largest one you will see."
        },
        {
          "id": "recent-window",
          "label": "Draft for the last thirty days and leave the rest alone",
          "description": "The mail anyone still cares about gets covered, and something older will be missed."
        },
        {
          "id": "ask-once",
          "label": "Ask once, then remember the answer for every mailbox after it",
          "description": "You decide with the mailbox in front of you; there is one more question in the way of starting."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["first-run-backfill"]
    },
    {
      "id": "q-operator",
      "text": "Once it exists, who runs it day to day — you, your team, or a machine nobody logs into?",
      "type": "single",
      "options": [
        {
          "id": "you-by-hand",
          "label": "You, on your own laptop, started by hand",
          "description": "Nothing to set up beyond your own machine; drafts stop the moment you close the lid."
        },
        {
          "id": "each-person",
          "label": "Everyone on the support team, each signed in as themselves",
          "description": "Who drafted what is on the record, and every person needs their own access to set up."
        },
        {
          "id": "shared-account",
          "label": "Whoever is on shift, from one shared login",
          "description": "One setup for the whole team, and no way to tell afterwards which of them did what."
        },
        {
          "id": "unattended",
          "label": "A machine nobody logs into, watched by whoever is on duty",
          "description": "Drafts appear overnight without anyone present; a failure is silent until someone looks."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["operator", "runtime-ownership"]
    },
    {
      "id": "q-bad-drafts",
      "text": "A draft has come back wrong three times running on the same thread. What do you want to happen next?",
      "type": "single",
      "options": [
        {
          "id": "hand-over",
          "label": "Stop drafting that thread and hand it to a person",
          "description": "The customer gets a human answer sooner, and someone has to notice the handover."
        },
        {
          "id": "flag-and-continue",
          "label": "Keep drafting, but mark the thread so it is checked before sending",
          "description": "Nothing stalls; the marking is only worth as much as the checking behind it."
        },
        {
          "id": "retry-with-context",
          "label": "Try once more with the earlier conversation attached",
          "description": "Most of these come right with more to read, at one more paid call per attempt."
        },
        {
          "id": "do-nothing",
          "label": "Nothing special — whoever is answering will see it is wrong",
          "description": "Least to build, and the same bad draft can be sent by someone in a hurry."
        }
      ],
      "allowOther": true,
      "informationNeeds": ["failure-behaviour", "human-handoff"]
    }
  ]
}
```

Что раунд демонстрирует намеренно:

- **Ноль справок на весь раунд, при живых `tags` у двух опций** — теги остаются свободным полем
  D-188 и не привязаны к технологии; связаны с ней только `note`/`href`/`logo`.
- **`q-first-run`** — число (десять тысяч) стоит *внутри* вопроса как обстановка, а не требуется
  ответом: так закрывается запрет «не спрашивай измеренное число», не теряя вопроса, решающего
  поведение первого запуска, стоимость первого дня и нужно ли журналу состояние «учтено, но не
  отправлено».
- **`q-operator`** — это эталонное «Who will execute this plan?», переприцеленное с *нашего плана* на
  их продукт: спрашивать про план запрещено запретом над слотом, а спрашивать, кто эксплуатирует
  продукт, — обязанность этого регистра.
- **`q-bad-drafts`** — «использование» как наблюдаемое поведение: состояние их системы, а не сцена, и
  четыре ответа — четыре разных продукта.
- **`q-first-slice`** — эталонное «In what order should the work be sequenced?», тоже переприцеленное:
  порядок сборки *их* продукта, а не разделов нашего документа.
- Ни у одного вопроса нужды не пересекаются — правило 3.4 §4 зелено.

---

## 6. Что отвергнуто и почему

**Из кандидатов:**

- Третий ключ `AUDIENCE_RULES['concrete']` — заказчик сказал «рядом с профилем», а не «вместо
  профиля»; стиль — вторая ось и второй аргумент селектора.
- `'or a decision they have not taken'` (`implementation`) — буквально запрещает спрашивать обо всём
  нерешённом, то есть обо всём ценном; заменено на `never assume a decision they have not yet taken`.
- Ограничение `tags` внутри регистра (`usage`) — регистр рендерится **выше** общего разрешения тегов,
  так что общее предложение получает последнее слово и ограничение утекает; вместо запрета — их
  перенаправление в блоке справки, который стоит ниже.
- `'never open with praise'` и `'never write "let\'s"'` (`voice`) — этот ассет выдаёт только JSON,
  прозы у него нет; правила выброшены из промпта и оставлены в рубрике (4.3.2, 4.4.1), где стоят
  ноль токенов.
- Формулировка «a guess costs a round» (`reference`) — прямо противоречит контракту совместимости
  D-188: негодная ссылка обязана стоить своего чипа, а не целого раунда, и §3 отбрасывает, а не
  отвергает.
- Обязательная опция-отказ с описанием `"Pick one for me and say why in the plan"` (`reference`) —
  первое лицо плюс упоминание нашего артефакта в единственной опции, которую регистр требует всегда:
  ярлык взят, описание переписано.
- «Ventriloquism» в описаниях (`"You already have an AWS account"`, `reference`) — грамматически
  второе лицо, по сути тот же выдуманный персонаж, только направленный на читателя.
- Вопрос-меню поставщиков как открывающий (три кандидата из четырёх) — при заданном посылкой API он
  меняет строку по умолчанию; оставлен только там, где опции меняют то, что придётся построить.
- Кардинальность `multiple` у вопроса про политику отказов (`voice` угадал, трое нет) — в рубрику не
  вошла: текстом не решается, остаётся судейскому проходу гейта 146.
- `{{noteLimit}}`/`{{maxNoteLength}}` как интерполяция «существующей» константы (`implementation`,
  `usage`) — константы нет; §3 её вводит, иначе `registryIssues()` уронил бы старт.

**Из формулировок, которые напрашивались:**

- Правило «раунд без справок — дефект» — прямо записано как **не**-правило: асимметрия принадлежит
  опции, и целиком голый раунд правилен.
- Открытый список слагов («любая известная технология») — слаг без вендоренной SVG рендерер нарисовать
  не может; множество закрыто восемью, которые эталон предлагает своими же вопросами.
- Аллоу-лист хостов на все ссылки — не нужен: при известном слаге хост проверяется по вендору, а без
  слага работает форма домашней страницы (https, без запроса/якоря/порта, не глубже сегмента).
- `\b` в лексиконах рубрики — в JS она определена через `[A-Za-z0-9_]` и для кириллицы стоит между
  каждой парой букв; всё сравнение идёт по токенам.
- Одиночные `plan`, `format`, `section` в запрещённом словаре — законные продуктовые слова; ловятся
  только определённые биграммы про *наш* документ.
- Голос реплики между раундами — `interview.bridge.v1` не имеет слота `{{audienceRules}}`, и AC 144
  говорит про текст раунда; в объём не берётся, уходит записью в журнал.

**В `decisions.md` (следующие свободные номера):**

- **D-219** — «Concrete» реализован как стиль (вторая ось рядом с профилем У-5), а не как третий
  `AudienceProfile`; `audienceRules(audience, style)`, стиль вытесняет регистр профиля.
- **D-220** — голос реплики между раундами (видео §6) в задачу 144 не входит: `interview.bridge.v1`
  не имеет слота регистра, AC ограничен текстом раунда; в Backlog.
- **D-221** — `note`/`href`/`logo` необязательны и **отбрасываются, а не отвергаются** (контракт
  D-188); закрытый набор слагов — восемь технологий из видео §5; `OPTION_NOTE.max = 240`.
- **D-222** — расхождение с эталоном: видео §5 показывает `(Recommended)` на нескольких опциях одного
  вопроса, наша v3-схема разрешает одну; оставлено как есть, строкой в таблицу сверки гейта 146.
