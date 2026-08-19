import { z } from 'zod';

import { ASKING_STAGES } from '@/modules/workflow/model/stages';

/**
 * The question-set contract (task 32; FR-005 AC-2/AC-3; solution.md — Question Set Contract).
 *
 * This schema is the enforcement point for the interview's structural rules: 2–8 predefined
 * options per question, single or multiple select, and the mandatory free-text escape. The
 * `allowOther: true` literal is deliberate — a draft cannot opt out of the escape hatch, and the
 * client renders the free-text entry from this flag, so exactly one such entry exists per
 * question and an agent cannot author a competing option that duplicates it.
 *
 * Everything an agent drafts passes through here **before** persistence or rendering; an invalid
 * set is repaired at most once and then discarded with `DRAFT_INVALID` (never persisted, never
 * shown — NFR-009 AC-2).
 */
/**
 * How much a round may ask, written **once** (task 133; checklist row `1.2-2`).
 *
 * There were three numbers for one rule: the interviewer's prompt said "at most three questions",
 * the schema allowed five, and the repair sliced to five — and the observed reference rounds had
 * five, five and four. Whichever was right, three spellings of one contract is a contract nobody
 * can change safely, and the red-team found the prompt's number had arrived in a gate-remediation
 * commit with no reasoning written down anywhere.
 *
 * These constants are that rule. The schema enforces them, the repair trims to them, and the prompt
 * asks for them by interpolation — so the instruction the model reads and the bound its answer is
 * checked against cannot disagree again (constitution: "no duplicated structural truth").
 */
export const QUESTIONS_PER_ROUND = { min: 1, max: 5 } as const;
export const OPTIONS_PER_QUESTION = { min: 2, max: 8 } as const;

/**
 * Справка на опции (task 144; видео §5).
 *
 * Три поля, и все три — свойство ОПЦИИ. Их валидация устроена как у `recommended` и `tags`, с одним
 * добавлением: значения, которые модель могла выдумать, **отбрасываются, а не роняют раунд**. Раунд
 * репарируется один раз и затем выбрасывается с `DRAFT_INVALID`; галлюцинированная ссылка не имеет
 * права стоить живой прогулке целого раунда — она стоит своего чипа.
 *
 * 240 символов ≈ две фактические фразы: ⓘ — всплывающая справка, а не второй абзац описания.
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

/**
 * Собственный домен вендора: слаг сам себе аллоу-лист для ссылки.
 *
 * Экспортируется, потому что у этой таблицы два читателя и одна правда: схема здесь **отбрасывает**
 * чужой хост, а рубрика раунда (`interview/concrete-rubric.ts`, §4.6) обязана о нём **сказать** —
 * молчаливо выброшенное значение остаётся дефектом черновика. Две копии восьми доменов разошлись бы
 * в первый же день (constitution: "no duplicated structural truth").
 */
export const LOGO_HOSTS: Readonly<Record<OptionLogoSlug, readonly string[]>> = Object.freeze({
  anthropic: ['anthropic.com'],
  openai: ['openai.com'],
  openrouter: ['openrouter.ai'],
  nextjs: ['nextjs.org'],
  react: ['react.dev', 'reactjs.org'],
  neon: ['neon.com', 'neon.tech'],
  mongodb: ['mongodb.com'],
  sqlite: ['sqlite.org'],
});

/**
 * Домашняя страница и ничего кроме: https, без учётки, порта, запроса, якоря; не глубже сегмента.
 *
 * Экспортируется по той же причине, что и `LOGO_HOSTS`: форма адреса, по которой схема молча
 * отбрасывает, — та же форма, по которой рубрика раунда выписывает находку `href-shape`.
 */
export const HomePageUrl = z
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

/**
 * What an option is once the schema has finished with it.
 *
 * Written out rather than inferred, and the reason is the transform below: it returns a smaller
 * object when a field was dropped, so an inferred type would be a **union** of shapes and every
 * reader — the card, the feed, the rubric — would have to narrow before asking whether a note is
 * there. One shape with optional properties says the same thing and is the thing `recommended` and
 * `tags` already are. The runtime behaviour is unchanged: a dropped field is an absent **key**, never
 * a null and never an empty string, because the rounds are persisted as JSON and the difference is
 * visible there.
 */
export interface QuestionOptionValue {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  tags?: string[];
  note?: string;
  href?: string;
  logo?: OptionLogoSlug;
}

export const QuestionOption = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    /**
     * v3 (task 106): the model's single suggestion for this question (Эталон §1.1).
     *
     * **Optional, and that is the compatibility contract.** Every round persisted before v3 is a valid
     * v3 draft with no flags and no descriptions; it renders as plain options, which is exactly what
     * it always rendered as. A schema that made this required would have made every stored round of
     * every existing session unreadable — and the rounds are what the interview gate counts.
     */
    recommended: z.boolean().optional(),
    /**
     * Short tags the model may attach to an option (task 134; row `1.1-6`; Эталон §1.1).
     *
     * **Optional, and it stays optional** — the same compatibility contract `recommended` carries.
     * Every round drafted before this is a valid draft with no tags and renders as it always did, and
     * a model that supplies none is not doing anything wrong. Bounded because a chip row is a chip
     * row: four short words, not a paragraph broken into pieces.
     */
    tags: z.array(z.string().min(1).max(24)).max(4).optional(),
    /** Справка: что это за технология и к чему обязывает её выбор. */
    note: z.string().trim().min(1).max(OPTION_NOTE.max).optional().catch(undefined),
    /** Ссылка на её собственный сайт. Недоверенный ввод: не прошло — выброшено. */
    href: HomePageUrl.optional().catch(undefined),
    /** Слаг из закрытого набора. Не URL, не имя файла. */
    logo: z.enum(OPTION_LOGO_SLUGS).optional().catch(undefined),
  })
  .transform((option): QuestionOptionValue => {
    const { note, href, logo, ...rest } = option;

    // Ссылка или логотип без справки — украшение: сама справка и есть то, ради чего они висят.
    if (note === undefined) return rest;

    // Слаг знает свой домен: ссылка на чужом хосте при известном логотипе — догадка, а не адрес.
    const host = href === undefined ? null : new URL(href).hostname.replace(/^www\./, '');
    const trusted =
      logo === undefined ? href !== undefined : host !== null && LOGO_HOSTS[logo].includes(host);

    return {
      ...rest,
      note,
      ...(trusted && href !== undefined ? { href } : {}),
      ...(logo === undefined ? {} : { logo }),
    };
  });

export const Question = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    type: z.enum(['single', 'multiple']),
    options: z.array(QuestionOption).min(OPTIONS_PER_QUESTION.min).max(OPTIONS_PER_QUESTION.max),
    /** FR-005 AC-3: the free-text escape is mandatory, not a preference. */
    allowOther: z.literal(true),
    /** The named needs this question exists to satisfy (FR-005 AC-7; DR-13). */
    informationNeeds: z.array(z.string().min(1)).min(1),
  })
  .superRefine((question, ctx) => {
    // Duplicate option ids would make an answer ambiguous — the answer rows reference options by
    // id (DR-5), so ambiguity here is a data defect, not a style problem.
    const ids = new Set(question.options.map((option) => option.id));
    if (ids.size !== question.options.length) {
      ctx.addIssue({ code: 'custom', message: `question ${question.id} repeats an option id` });
    }

    /*
     * v3: **at most one** recommendation per question. A model that marks three has not recommended
     * anything, and the badge would then be decoration rather than advice — the same reasoning that
     * makes `allowOther` a literal rather than a preference.
     */
    const recommended = question.options.filter((option) => option.recommended === true);
    if (recommended.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: `question ${question.id} recommends ${String(recommended.length)} options; at most one may be recommended`,
      });
    }
  });

export const QuestionSetSchema = z
  .object({
    stage: z.enum(ASKING_STAGES),
    questions: z.array(Question).min(QUESTIONS_PER_ROUND.min).max(QUESTIONS_PER_ROUND.max),
  })
  .superRefine((set, ctx) => {
    const ids = new Set(set.questions.map((question) => question.id));
    if (ids.size !== set.questions.length) {
      ctx.addIssue({ code: 'custom', message: 'question ids must be unique within a set' });
    }
  });

export type QuestionSet = z.infer<typeof QuestionSetSchema>;
export type QuestionSetQuestion = z.infer<typeof Question>;

/** A repair pass: given the rejected draft and its issues, produce one corrected draft. */
export type QuestionSetRepair = (draft: unknown, issues: readonly z.core.$ZodIssue[]) => unknown;

export type QuestionSetValidation =
  | { ok: true; set: QuestionSet; repaired: boolean }
  | { ok: false; code: 'DRAFT_INVALID'; issues: readonly string[] };

const describeIssues = (issues: readonly z.core.$ZodIssue[]): string[] =>
  issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

/**
 * Validate-repair-validate, then stop (solution.md: "repaired once and, if it still fails, is
 * discarded"). The repair is injected: the caller decides whether repairing means a deterministic
 * normalisation or, later, a corrective model round-trip. No repair function means no repair
 * attempt — one strike and the draft is out.
 */
export function validateQuestionSetDraft(
  draft: unknown,
  repair?: QuestionSetRepair,
): QuestionSetValidation {
  const first = QuestionSetSchema.safeParse(draft);
  if (first.success) return { ok: true, set: first.data, repaired: false };

  if (repair === undefined) {
    return { ok: false, code: 'DRAFT_INVALID', issues: describeIssues(first.error.issues) };
  }

  const second = QuestionSetSchema.safeParse(repair(draft, first.error.issues));
  if (second.success) return { ok: true, set: second.data, repaired: true };

  return { ok: false, code: 'DRAFT_INVALID', issues: describeIssues(second.error.issues) };
}
