import { z } from 'zod';

import type { Chain } from '../llm/chain.ts';

import { WHOLE_ARTIFACT_TASK_LIMIT, judgeWholeArtifactPlan } from './artifact-class.ts';
import type { ReviewableTask } from './plan-review.ts';

/**
 * Архитектор заданий для класса «цельный артефакт» (А-36 п.1).
 *
 * **Чего не хватало.** Суд формы (А-35 п.2а) научился БРАКОВАТЬ нарезку связного артефакта — и на
 * этом останавливался. Владельцу оставалось одно: «продолжить с пробелами», то есть исполнить ту
 * самую нарезку, из-за которой суд и появился. Ветка ниже — вторая половина той же мысли: класс
 * назван, значит план под класс надо УМЕТЬ НАПИСАТЬ, а не только отвергнуть чужой.
 *
 * **Форма, которую класс допускает** — та же, что судит `judgeWholeArtifactPlan`, но с той стороны
 * стола: 1–8 задач, ровно одна владеет файлами артефакта целиком («собери артефакт целиком»),
 * остальные — материал, обвязка, полировка итерациями и замер. Написанное здесь обязано проходить
 * собственный суд формы; проверка стоит прямо в конце сборки и роняет план в скелет, если нет.
 *
 * **Разделение труда — прежнее (конституция P1, D-229).** Модель пишет ПРОЗУ и предлагает охваты.
 * Форму — сколько долей, кто владеет целым, кто кого ждёт — решает КОД. Отдельно и намеренно:
 * порядок здесь не просто факт о плане, а свойство класса. Две задачи, трогающие артефакт
 * одновременно, — это ровно тот механизм расхождения, против которого класс заведён, поэтому
 * владелец целого и все полировки выстроены в СТРОГУЮ ЦЕПЬ, а не в слой параллельных.
 *
 * **Недоступность модели планом не является отказом**: скелет ниже пишется кодом из задумки и
 * снимка диска. Он беден прозой и честен по форме — конвейер едет, а лента называет деградацию.
 */

export const WHOLE_ARTIFACT_ROLES = ['material', 'tooling', 'whole', 'polish', 'measure'] as const;

export type WholeArtifactRole = (typeof WHOLE_ARTIFACT_ROLES)[number];

/** Роли, чьи задачи трогают сам артефакт: они не имеют права идти одновременно. */
const TOUCHES_ARTIFACT: readonly WholeArtifactRole[] = ['whole', 'polish'];

/** Роли подготовки — всё, что владелец целого ждёт. */
const BEFORE_WHOLE: readonly WholeArtifactRole[] = ['material', 'tooling'];

export interface PlannedTask {
  taskId: string;
  role: WholeArtifactRole;
  title: string;
  description: string;
  filesToEdit: string[];
  dependsOn: string[];
  unitTestCmd?: string;
  e2eTestCmd?: string;
  iterationTimeoutSec?: number;
  /** Измерение полировки и замера — приёмку по нему составляет код (А-37 п.1). */
  measurement?: { cmd: string; recordPath: string; divergenceKey: string };
}

export interface WholeArtifactPlanResult {
  tasks: PlannedTask[];
  /** Кто написал прозу, или `null` — скелет кодом. */
  writtenBy: string | null;
  /** Названная деградация: почему модель не использована или её план не принят. */
  degradedBecause?: string;
  /** Пробелы формы, из-за которых модельный план был переспрошен; пусто — приняли с первого раза. */
  retriedBecause: string[];
}

/**
 * `WA01`, `WA02`, … — свой префикс, не совпадающий с идентификаторами бандла.
 *
 * Не украшение: план этой ветки ЗАМЕЩАЕТ разбиение бандла, и одинаковые идентификаторы означали бы
 * молчаливое переписывание чужой задачи вместо честной замены плана. С разными префиксами индекс
 * видит, что старых задач в дереве больше нет, и чистит их (см. интейк).
 */
export function plannedTaskId(index: number): string {
  return `WA${String(index + 1).padStart(2, '0')}`;
}

const PRESENTATIONAL = /\.(html?|css|scss|sass|less|m?jsx?|tsx?|vue|svelte|astro)$/i;

const TOOLING_PREFIX = /^(tools|tests?|e2e|scripts|bundle|handoff)\//i;

/** Файлы самого артефакта — то же понятие, что судит `judgeWholeArtifactPlan`. */
function artifactFilesOf(files: readonly string[]): string[] {
  return files
    .map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter((file) => PRESENTATIONAL.test(file) && !TOOLING_PREFIX.test(file));
}

/**
 * Как задача полировки или замера ЗАПУСКАЕТ измерение и куда его КЛАДЁТ (А-37 п.1).
 *
 * Не «прошло ли» — «прогнано ли и записано ли». Числа приёмкой не распоряжаются.
 */
const Measurement = z.object({
  /** Команда прогона измерения. Её собственный код возврата приёмкой НЕ считается. */
  cmd: z.string().min(1),
  /** Файл, куда измерение пишет свой отчёт: приёмка требует, чтобы он появился и был непуст. */
  recordPath: z.string().min(1),
  /** Ключ (через точку) внутри отчёта, под которым лежит ЧИСЛО расхождения. */
  divergenceKey: z.string().min(1),
});

type Measurement = z.infer<typeof Measurement>;

const ModelTask = z.object({
  role: z.enum(WHOLE_ARTIFACT_ROLES),
  title: z.string().min(1),
  description: z.string().min(1),
  filesToEdit: z.array(z.string()).default([]),
  unitTestCmd: z.string().nullish(),
  e2eTestCmd: z.string().nullish(),
  iterationTimeoutSec: z.number().int().positive().max(7_200).nullish().catch(undefined),
  measurement: Measurement.nullish(),
});

const ModelPlan = z.object({ tasks: z.array(ModelTask).min(1) });

type ModelTask = z.infer<typeof ModelTask>;

const text = (value: string | null | undefined): string | undefined =>
  value === null || value === undefined || value.trim() === '' ? undefined : value;

/** Роли, чью приёмку составляет КОД, а не модель (А-37 п.1). */
const MEASURED_ROLES: readonly WholeArtifactRole[] = ['polish', 'measure'];

/** Куда кладётся предыдущее значение расхождения, чтобы сходимость было с чем сравнивать. */
export const CONVERGENCE_LEDGER = '.loop-convergence.json';

/**
 * Приёмка полировки и замера — составляется КОДОМ (А-37 п.1).
 *
 * **Числовой порог не бывает воротами.** Урок стоил раунда: план написал себе приёмку
 * «прогон сверки вернул 0», а сверка внутри держала порог «не больше 1% различающихся
 * пикселей». Сборка с нуля такого не берёт по построению — задача не могла быть принята
 * НИКОГДА, сколько бы честной работы в неё ни вложили, и конвейер встал не на плохой работе,
 * а на невыполнимом определении готовности.
 *
 * Что приёмка спрашивает вместо этого — ровно три вещи, и все три о ФАКТЕ, а не об оценке:
 *
 * 1. **измерение прогнано** — команда исполнена; её собственный код возврата намеренно
 *    проглатывается: он выражает мнение о качестве, а мнение воротами не бывает;
 * 2. **измерение записано** — отчёт на диске существует и непуст, и число из него читается;
 * 3. **расхождение не выросло** — сходимость против предыдущей итерации. Полировке позволено
 *    не дойти до идеала; ей не позволено делать хуже.
 *
 * Сам порог никуда не девается — он становится ПУБЛИКУЕМОЙ МЕТРИКОЙ: число печатается на
 * приёмке, уезжает в ленту и в алерт заказчику, и решает по нему человек.
 */
export function composeMeasuredAcceptance(measurement: Measurement): string {
  const record = measurement.recordPath.replaceAll('\\', '/');
  const key = measurement.divergenceKey;

  /*
   * Внутри — только двойные кавычки: вся вставка идёт в одинарных, а `sh -c` вложенных
   * одинарных не прощает. Сообщения пишутся без апострофов по той же причине.
   */
  const check = [
    'const fs=require("fs");',
    `const r=JSON.parse(fs.readFileSync("${record}","utf8"));`,
    `const v="${key}".split(".").reduce((o,k)=>(o==null?o:o[k]),r);`,
    'if(typeof v!=="number"||!isFinite(v)){console.error("замер не записал число по ключу ' +
      key +
      '");process.exit(1)}',
    `const p="${CONVERGENCE_LEDGER}";`,
    'const prev=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):null;',
    'fs.writeFileSync(p,JSON.stringify({value:v}));',
    'if(prev&&typeof prev.value==="number"&&v>prev.value+1e-9)' +
      '{console.error("расхождение выросло: "+prev.value+" -> "+v);process.exit(1)}',
    'console.log("замер зафиксирован: "+v+(prev?" (было "+prev.value+")":""));',
  ].join('');

  return `{ ${measurement.cmd} || true; } && test -s ${record} && node -e '${check}'`;
}

const SYSTEM = [
  'Ты — архитектор автономного контура доставки. Задумка владельца принадлежит классу',
  '«СВЯЗНЫЙ ВИЗУАЛЬНЫЙ АРТЕФАКТ ОДНОГО КОНТЕКСТА»: качество результата есть его ЦЕЛОСТНОСТЬ.',
  'Ты пишешь план работ в форме, которую этот класс допускает, — и ни в какой другой.',
  'Отвечай ТОЛЬКО JSON-объектом, без пояснений и без обрамляющих кавычек кода.',
].join(' ');

export interface WholeArtifactContext {
  /** Архитектурный документ бандла, сокращённо — внутри чего собирается артефакт. */
  architecture: string;
  /** Заголовки задач бандла: чего задумка требует по охвату. План обязан это покрыть. */
  bundleTitles: readonly string[];
  /** Отчёт исследователя о рабочей директории — что там УЖЕ лежит. */
  research?: string;
  techStack: string;
  /**
   * Пробелы, которые прошлый суд полноты назвал этому же плану (А-36 п.1, находка прогона).
   *
   * Без них кнопка «перегенерировать» — подбрасывание монеты: суд назвал, чего плану не хватает,
   * планировщик об этом не узнал и написал то же самое. Названный пробел обязан приехать обратно
   * автору плана — иначе названность ничего не стоит.
   */
  mustCover?: readonly string[];
}

/** Промпт ветки — экспортирован, чтобы регрессия судила ВХОД, а не только выход. */
export function wholeArtifactPrompt(
  seed: string,
  context: WholeArtifactContext,
  gaps: readonly string[] = [],
): string {
  const titles = context.bundleTitles.slice(0, 60).map((title) => `- ${title}`);

  return [
    'Задумка владельца (дословно):',
    seed,
    '',
    'Архитектура проекта (сокращённо):',
    context.architecture.slice(0, 3000),
    '',
    `Стек проекта: ${context.techStack}.`,
    '',
    ...(context.research === undefined || context.research.trim() === ''
      ? []
      : ['Отчёт исследователя о рабочей директории (что там уже есть):', context.research, '']),
    ...(titles.length === 0
      ? []
      : [
          'Разбиение из бандла — НЕ план, а перечень того, чего задумка требует по охвату.',
          'Твой план обязан покрыть это целиком, но НЕ повторять как задачи:',
          ...titles,
          '',
        ]),
    ...(context.mustCover === undefined || context.mustCover.length === 0
      ? []
      : [
          'Суд полноты уже забраковал ПРЕДЫДУЩИЙ план этой же задумки. Пробелы поимённо —',
          'каждый обязан быть покрыт задачей нового плана:',
          ...context.mustCover.map((gap, index) => `${String(index + 1)}. ${gap}`),
          '',
        ]),
    ...(gaps.length === 0
      ? []
      : [
          'Предыдущий твой ответ забракован судом формы. Пробелы поимённо:',
          ...gaps.map((gap, index) => `${String(index + 1)}. ${gap}`),
          '',
        ]),
    'ФОРМА ПЛАНА — обязательна:',
    `1. Всего задач: от 1 до ${String(WHOLE_ARTIFACT_TASK_LIMIT)}. Больше — это нарезка, и она будет отвергнута.`,
    '2. РОВНО ОДНА задача с ролью "whole" — «собери артефакт целиком». Её filesToEdit перечисляет',
    '   ВСЕ файлы самого артефакта (разметка, стили, поведение, шаблоны). Её исполнитель видит вещь',
    '   целиком и отвечает за связность: единые токены, одна сетка, одна типографика, общая шапка и',
    '   подвал. Это самая тяжёлая задача плана — так её и пиши.',
    '3. Остальные задачи — только обвязка вокруг целого, каждая со своей ролью:',
    '   - "material" — добыть и подготовить материал (изображения, шрифты, данные, эталоны);',
    '   - "tooling" — инструменты и проверки в tools/ или tests/ (артефакт они не трогают);',
    '   - "polish" — полировка ГОТОВОГО целого итерациями: сверить с эталоном и исправить',
    '     расхождения. Полировок может быть несколько; каждая работает по всему артефакту;',
    '   - "measure" — замер результата и отчёт.',
    '4. НЕ дели артефакт между задачами: «шапка», «футер», «секция героя», «страница товаров»',
    '   отдельными задачами — это запрещённая форма, ровно она разрушает связность.',
    '',
    'ПРИЁМКА ПОЛИРОВКИ И ЗАМЕРА — не число. Роли "polish" и "measure" unitTestCmd НЕ пишут:',
    'вместо него дай объект "measurement" — чем мерить, куда кладётся отчёт и под каким ключом в',
    'нём лежит число расхождения. Приёмку по нему составит код, и принимать он будет ФАКТ:',
    'измерение прогнано, отчёт записан, расхождение не выросло против прошлой итерации.',
    'Порог («не больше N процентов», «не больше N пикселей») воротами НЕ БЫВАЕТ: сборка с нуля',
    'такого не берёт по построению, и задача не может быть принята никогда, сколько честной работы',
    'в неё ни вложи. Сам порог никуда не девается — он публикуемая метрика, и решает по ней человек.',
    '',
    'unitTestCmd ОБЯЗАТЕЛЕН у остальных ролей: POSIX sh, исполняется через `sh -c` в Linux-контейнере',
    '(никакого PowerShell и cmd). Если своих тестов у задачи нет — назови честную проверку её',
    'результата: `test -f путь`, `node --check файл.js`, команду сборки. Проверка обязана проходить',
    'в чистом контейнере после честного выполнения задачи и падать без него.',
    'iterationTimeoutSec — null почти всегда; число секунд (не больше 7200) ставь той задаче,',
    'которая заведомо необычно тяжёлая. Задача "whole" на большом артефакте — как раз такая.',
    '',
    'Верни JSON вида:',
    '{"tasks":[',
    '  {"role":"material","title":"…","description":"что сделать, по шагам, в повелительном наклонении",',
    '   "filesToEdit":["assets/…"],"unitTestCmd":"test -d assets/images","e2eTestCmd":null,"iterationTimeoutSec":null},',
    '  {"role":"whole","title":"Собери артефакт целиком","description":"…",',
    '   "filesToEdit":["index.html","products.html","src/styles/main.css","src/scripts/main.js"],',
    '   "unitTestCmd":"node tools/check.js","e2eTestCmd":null,"iterationTimeoutSec":5400},',
    '  {"role":"polish","title":"Сверь с эталоном и отполируй","description":"…",',
    '   "filesToEdit":["index.html","products.html","src/styles/main.css"],',
    '   "measurement":{"cmd":"node tools/visual-diff/compare.js",',
    '     "recordPath":"tools/visual-diff/report.json","divergenceKey":"summary.diffPercent"},',
    '   "iterationTimeoutSec":3600}',
    ']}',
  ].join('\n');
}

/** Модель, обернувшая JSON в ограду или во фразу, всё же ответила — приём общий с судом формы. */
function extractJson(value: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(value);
  const candidate = (fenced?.[1] ?? value).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Форма поверх модельного предложения — ЧИСТАЯ функция, без модели и без диска.
 *
 * Три вещи, которые код решает сам и не спрашивает:
 *
 * 1. **Владелец целого один.** Модель, назвавшая "whole" дважды, назвала одну задачу владельцем, а
 *    вторую — полировкой; модель, не назвавшая ни одной, всё же написала ту, чей охват шире всех.
 * 2. **Владелец владеет ОБЪЕДИНЕНИЕМ.** Полировка, тронувшая файл, которого нет у владельца, тем
 *    самым вынесла кусок артефакта за его забор — объединение возвращается владельцу молча, потому
 *    что это не правка плана, а его форма.
 * 3. **Артефакт в один момент времени трогает один исполнитель.** Владелец и полировки — строгая
 *    цепь; материал и обвязка идут впереди слоем, замер — последним.
 */
export function shapePlan(proposed: readonly ModelTask[]): PlannedTask[] {
  const rows = proposed.map((task) => ({
    ...task,
    files: task.filesToEdit.map((file) => file.replaceAll('\\', '/').replace(/^\.\//, '')),
  }));

  const first = rows[0];
  if (first === undefined) return [];

  /* Владелец целого: назначенный моделью, иначе — самый широкий охват артефакта. */
  const byWidth = [...rows].sort(
    (left, right) => artifactFilesOf(right.files).length - artifactFilesOf(left.files).length,
  );

  const owner =
    rows.find((row) => row.role === 'whole') ??
    byWidth.find((row) => artifactFilesOf(row.files).length > 0) ??
    first;

  const union = [...new Set(rows.flatMap((row) => artifactFilesOf(row.files)))];

  const roleOf = (row: (typeof rows)[number]): WholeArtifactRole => {
    if (row === owner) return 'whole';
    /* Второй «whole» владельцем уже не будет: он полирует то, что собрал первый. */
    if (row.role === 'whole') return 'polish';
    return row.role;
  };

  const ordered = [
    ...rows.filter((row) => row !== owner && BEFORE_WHOLE.includes(roleOf(row))),
    owner,
    ...rows.filter((row) => row !== owner && roleOf(row) === 'polish'),
    ...rows.filter((row) => row !== owner && roleOf(row) === 'measure'),
  ];

  const planned: PlannedTask[] = [];
  /* Последняя задача, тронувшая артефакт: следующая такая ждёт именно её. */
  let previousTouch: string | null = null;
  const preparation: string[] = [];

  for (const [index, row] of ordered.entries()) {
    const role = roleOf(row);
    const taskId = plannedTaskId(index);

    const files =
      role === 'whole'
        ? [...new Set([...union, ...row.files.filter((file) => !union.includes(file))])]
        : row.files;

    /*
     * Приёмку полировки и замера код СОСТАВЛЯЕТ САМ и предложение модели для них не берёт
     * (А-37 п.1): именно там числовой порог однажды стал воротами, которых сборка с нуля не
     * возьмёт никогда. Для остальных ролей команда модели идёт как есть.
     */
    const measurement = row.measurement ?? undefined;

    const unit =
      MEASURED_ROLES.includes(role) && measurement != null
        ? composeMeasuredAcceptance(measurement)
        : MEASURED_ROLES.includes(role)
          ? undefined
          : text(row.unitTestCmd);

    const e2e = text(row.e2eTestCmd);

    const dependsOn = TOUCHES_ARTIFACT.includes(role)
      ? previousTouch === null
        ? [...preparation]
        : [previousTouch]
      : role === 'measure'
        ? previousTouch === null
          ? [...preparation]
          : [previousTouch]
        : [];

    planned.push({
      taskId,
      role,
      title: row.title,
      description: row.description,
      filesToEdit: files,
      dependsOn,
      ...(unit === undefined ? {} : { unitTestCmd: unit }),
      ...(e2e === undefined ? {} : { e2eTestCmd: e2e }),
      ...(measurement == null ? {} : { measurement }),
      ...(row.iterationTimeoutSec === null || row.iterationTimeoutSec === undefined
        ? {}
        : { iterationTimeoutSec: row.iterationTimeoutSec }),
    });

    if (TOUCHES_ARTIFACT.includes(role)) previousTouch = taskId;
    else if (BEFORE_WHOLE.includes(role)) preparation.push(taskId);
  }

  return planned;
}

/**
 * Есть ли у каждой полировки и замера ЗАПИСЫВАЕМОЕ измерение (А-37 п.1) — чистая функция.
 *
 * Пробел здесь того же рода, что заборы внутри артефакта: план, у которого полировка не
 * называет, ЧЕМ она мерит и КУДА кладёт результат, не имеет определения готовности — и рано
 * или поздно подставит вместо него чужое число.
 */
export function judgeMeasuredAcceptance(tasks: readonly PlannedTask[]): string[] {
  const naked = tasks.filter(
    (task) => MEASURED_ROLES.includes(task.role) && task.measurement === undefined,
  );

  if (naked.length === 0) return [];

  return [
    `Задачи полировки и замера без записываемого измерения: ${naked
      .map((task) => task.taskId)
      .join(', ')}. Приёмка такой задачи не может быть ни числом, ни мнением: назови команду ` +
      'прогона, файл отчёта и ключ числа расхождения в нём — принимается ФАКТ прогона, записи и ' +
      'сходимости, а сам порог публикуется метрикой.',
  ];
}

/** Задачи плана в том виде, в каком их читает суд формы. */
export function asReviewable(tasks: readonly PlannedTask[]): ReviewableTask[] {
  return tasks.map((task) => ({
    taskId: task.taskId,
    title: task.title,
    description: task.description,
    filesToEdit: task.filesToEdit,
  }));
}

/**
 * Скелет кодом — план без модели: материал, целое, полировка, замер.
 *
 * Беден прозой намеренно: он не притворяется заданием, написанным архитектором, а несёт задумку
 * дословно тому единственному исполнителю, который увидит вещь целиком. Форму проходит по
 * построению — делить тут нечего.
 */
export function skeletonPlan(seed: string, artifactFiles: readonly string[]): PlannedTask[] {
  const files = [...new Set(artifactFilesOf(artifactFiles))];

  /* Проверка скелета честна и в пустой директории: якорь есть — ищем файл, нет — только каталог. */
  const anchor = files[0];
  const check = anchor === undefined ? 'test -d .' : `test -f ${anchor}`;

  return shapePlan([
    {
      role: 'material',
      title: 'Собери материал для артефакта',
      description:
        'Подготовь весь материал, который артефакт использует: изображения, шрифты, данные, ' +
        'эталоны для сверки. Сложи их в рабочую директорию так, чтобы сборка ссылалась на ' +
        'локальные файлы, а не на сеть.\n\nЗадумка владельца, дословно:\n' +
        seed,
      filesToEdit: [],
      unitTestCmd: 'test -d assets',
      e2eTestCmd: null,
      iterationTimeoutSec: null,
    },
    {
      role: 'whole',
      title: 'Собери артефакт целиком',
      description:
        'Собери артефакт ЦЕЛИКОМ, один, в одном заходе: единые токены, одна сетка, одна ' +
        'типографика, общая шапка и подвал. Связность — твоя ответственность и мера качества: ' +
        'части, корректные по отдельности и расходящиеся между собой, — это провал задачи.' +
        '\n\nЗадумка владельца, дословно:\n' +
        seed,
      filesToEdit: [...files],
      unitTestCmd: check,
      e2eTestCmd: null,
      iterationTimeoutSec: 5_400,
    },
    {
      role: 'polish',
      title: 'Сверь целое с задумкой и отполируй итерациями',
      description:
        'Пройди артефакт целиком и исправь расхождения с задумкой: вёрстку, типографику, ' +
        'отступы, поведение. Работай итерациями по всему артефакту, а не по одному куску.' +
        '\n\nЗадумка владельца, дословно:\n' +
        seed,
      filesToEdit: [...files],
      unitTestCmd: check,
      e2eTestCmd: null,
      iterationTimeoutSec: 3_600,
    },
    {
      role: 'measure',
      title: 'Замерь результат и напиши отчёт',
      description:
        'Замерь готовый артефакт против задумки и запиши отчёт в RESULT.md: что сделано, чем ' +
        'замерено, где расхождения остались и почему.',
      filesToEdit: ['RESULT.md'],
      unitTestCmd: 'test -f RESULT.md',
      e2eTestCmd: null,
      iterationTimeoutSec: null,
    },
  ]);
}

export interface WholeArtifactPlanRequest {
  seed: string;
  context: WholeArtifactContext;
  chain: Chain | null;
  /** Файлы артефакта, известные до плана (снимок диска) — материал скелета. */
  knownArtifactFiles?: readonly string[];
}

/**
 * План под класс «цельный артефакт»: модель пишет, код придаёт форму, суд формы принимает.
 *
 * Один переспрос с названными пробелами — и только один: модель, дважды написавшая нарезку, не
 * станет писать целое с третьего раза, а конвейер ждёт. Дальше — скелет, названный в ленте.
 */
export async function buildWholeArtifactPlan(
  request: WholeArtifactPlanRequest,
): Promise<WholeArtifactPlanResult> {
  const { seed, context, chain } = request;
  const known = request.knownArtifactFiles ?? [];

  if (chain === null) {
    return {
      tasks: skeletonPlan(seed, known),
      writtenBy: null,
      degradedBecause: 'провайдер роли архитектора не настроен',
      retriedBecause: [],
    };
  }

  let gaps: string[] = [];
  let lastFailure = 'причина не названа';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let answer: { text: string; provider: string };

    try {
      answer = await chain.generate({
        system: SYSTEM,
        prompt: wholeArtifactPrompt(seed, context, gaps),
      });
    } catch (error) {
      return {
        tasks: skeletonPlan(seed, known),
        writtenBy: null,
        degradedBecause: `звенья архитектора красные: ${
          error instanceof Error ? error.message : String(error)
        }`,
        retriedBecause: gaps,
      };
    }

    const parsed = ModelPlan.safeParse(extractJson(answer.text));

    if (!parsed.success) {
      lastFailure = `ответ модели не разобран: ${z.prettifyError(parsed.error)}`;
      gaps = ['Ответ не разобран как JSON заданной формы. Верни ровно объект {"tasks":[…]}.'];
      continue;
    }

    const shaped = shapePlan(parsed.data.tasks);
    const found = [
      ...judgeWholeArtifactPlan(asReviewable(shaped)),
      ...judgeMeasuredAcceptance(shaped),
    ];

    if (found.length === 0) {
      return {
        tasks: shaped,
        writtenBy: answer.provider,
        retriedBecause: gaps,
      };
    }

    lastFailure = `план не прошёл собственный суд формы: ${found.join(' / ')}`;
    gaps = found;
  }

  return {
    tasks: skeletonPlan(seed, known),
    writtenBy: null,
    degradedBecause: lastFailure,
    retriedBecause: gaps,
  };
}
