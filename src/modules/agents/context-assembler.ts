/**
 * The ContextAssembler (task 50; FR-008 AC-6; solution.md — `agents`).
 *
 * Everything a stage is generated from, in one deterministic string. Three properties are the whole
 * job, and each of them exists because the alternative is a defect that would be nearly invisible:
 *
 * 1. **Byte-identical for identical inputs.** Nothing here reads a clock, a random source, or the
 *    order rows happened to come back in — every collection is sorted by a declared key. A context
 *    that varied run to run would make a failed generation unreproducible and a regression test a
 *    coin toss.
 * 2. **Every available source present.** The session prompt, every prior answer, attachment text and
 *    every previously approved spec. A source that is empty is stated as absent rather than omitted
 *    silently, so a prompt missing its context reads as missing rather than as "there was none".
 * 3. **A budget that truncates rather than drops.** Exceeding the size limit shortens the longest
 *    sections and says so in the text; it never removes a source, because a model cannot ask what it
 *    was not told it is missing.
 *
 * Later milestones extend it through the declared insertion points rather than by editing the
 * assembly: `feedback` is filtered by task 57, `attachments` grows late arrivals in task 69, and
 * task 71 wraps untrusted content — the sections are already separate for exactly that reason.
 */

/** One answer, flattened to what a model can read. */
export interface ContextAnswer {
  stage: string;
  roundNumber: number;
  /** `null` for a free-text reply to the card as a whole; `need:<name>` for a fallback answer. */
  questionId: string | null;
  selectedOptions: readonly string[];
  freeText: string | null;
}

export interface ContextAttachment {
  fileName: string;
  /** Extracted text. Untrusted, and wrapped as such by task 71. */
  text: string;
}

export interface ContextSpec {
  specType: string;
  content: string;
}

/** One review finding, as the revision prompt would state it. */
export interface ContextFeedback {
  id: string;
  description: string;
  suggestion: string;
}

/**
 * The review's findings **and** the subset the user ticked (task 57; FR-010 AC-7).
 *
 * Both halves are passed in, and the assembler applies the selection itself. That is deliberate and
 * it is the whole of the task: had this field been "the items to include", every caller would carry
 * the duty of filtering, and the failure mode of forgetting is silent — a revision prompt listing a
 * recommendation the user declined, applied without anyone noticing. With the selection here, the
 * only reachable behaviour is the correct one.
 *
 * Unselected items are **absent**, not marked optional. A model told "here is a suggestion, but the
 * user did not ask for it" has still been told the suggestion, and models act on what they read.
 */
export interface ContextFeedbackSelection {
  items: readonly ContextFeedback[];
  /** The ids the user ticked. Nothing outside this list reaches the prompt. */
  selectedIds: readonly string[];
}

export interface ContextSources {
  initialPrompt: string;
  answers: readonly ContextAnswer[];
  attachments: readonly ContextAttachment[];
  approvedSpecs: readonly ContextSpec[];
  feedback?: ContextFeedbackSelection;
}

export interface ContextBudget {
  /** Total characters the assembled context may occupy. */
  totalChars: number;
}

/**
 * The default budget.
 *
 * Characters, not tokens: token counts are provider-specific, and a provider-specific measurement in
 * the assembler is exactly the vendor dependency P7 forbids. Roughly four characters per token puts
 * this near 30k tokens — comfortable for every model in the chain, and far below the point where a
 * long session could crowd out the prompt.
 */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = { totalChars: 120_000 };

export interface TruncationNote {
  section: string;
  omittedChars: number;
}

export interface AssembledContext {
  text: string;
  /** What was shortened, and by how much. Reported, never silent (AC-3). */
  truncated: readonly TruncationNote[];
}

interface Section {
  key: string;
  heading: string;
  body: string;
  /** A section that must survive whole. The grounding input is the only one (FR-003 AC-3). */
  fixed: boolean;
}

/** Canonical order of the bundle's files, for sorting approved specs. */
const SPEC_ORDER = ['constitution', 'requirements', 'solution', 'tasks', 'quality'];

const orderOf = (specType: string) => {
  const index = SPEC_ORDER.indexOf(specType);
  return index === -1 ? SPEC_ORDER.length : index;
};

/** Stage order for answers, so two sessions with the same answers assemble identically. */
const STAGE_ORDER = ['interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality'];

const stageOrderOf = (stage: string) => {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
};

function renderAnswers(answers: readonly ContextAnswer[]): string {
  if (answers.length === 0) return '(no answers recorded yet)';

  return [...answers]
    .sort(
      (a, b) =>
        stageOrderOf(a.stage) - stageOrderOf(b.stage) ||
        a.roundNumber - b.roundNumber ||
        (a.questionId ?? '').localeCompare(b.questionId ?? ''),
    )
    .map((answer) => {
      const label =
        answer.questionId === null
          ? `${answer.stage} (free reply)`
          : `${answer.stage}/${answer.questionId}`;
      const parts = [...answer.selectedOptions];
      if (answer.freeText !== null && answer.freeText.trim() !== '')
        parts.push(answer.freeText.trim());

      return `- ${label}: ${parts.length > 0 ? parts.join('; ') : '(no content)'}`;
    })
    .join('\n');
}

function renderAttachments(attachments: readonly ContextAttachment[]): string {
  if (attachments.length === 0) return '(no documents attached)';

  return [...attachments]
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .map((attachment) => `### ${attachment.fileName}\n\n${attachment.text}`)
    .join('\n\n');
}

function renderSpecs(specs: readonly ContextSpec[]): string {
  if (specs.length === 0) return '(no specification files approved yet)';

  return [...specs]
    .sort((a, b) => orderOf(a.specType) - orderOf(b.specType))
    .map((spec) => `### ${spec.specType}.md\n\n${spec.content}`)
    .join('\n\n');
}

/**
 * The ticked findings, in a deterministic order, and nothing else.
 *
 * Exported so the filter itself is testable in isolation: "only the selected items appear" is the
 * acceptance criterion of task 57, and it deserves an assertion that does not have to read a
 * rendered document to find out.
 */
export function selectedFeedback(feedback: ContextFeedbackSelection): readonly ContextFeedback[] {
  const selected = new Set(feedback.selectedIds);

  return [...feedback.items]
    .filter((item) => selected.has(item.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function renderFeedback(items: readonly ContextFeedback[]): string {
  return items.map((item) => `- ${item.description} — ${item.suggestion}`).join('\n');
}

/**
 * Shortens a section's body, leaving a note in its place.
 *
 * The marker is not decoration: a model handed a silently clipped document will happily reason about
 * the half it can see. Saying what was removed is what lets it say "the tasks file is truncated".
 */
function truncateBody(body: string, keep: number): string {
  const kept = body.slice(0, Math.max(keep, 0)).trimEnd();
  const omitted = body.length - kept.length;

  return `${kept}\n\n[truncated: ${String(omitted)} characters omitted to fit the context budget]`;
}

export function assembleContext(
  sources: ContextSources,
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): AssembledContext {
  const sections: Section[] = [
    {
      key: 'prompt',
      heading: '## The product idea, as the user described it',
      body: sources.initialPrompt.trim(),
      fixed: true,
    },
    {
      key: 'answers',
      heading: '## Answers given during the interview',
      body: renderAnswers(sources.answers),
      fixed: false,
    },
    {
      key: 'attachments',
      heading: '## Documents the user supplied',
      body: renderAttachments(sources.attachments),
      fixed: false,
    },
    {
      key: 'approved-specs',
      heading: '## Specification files already approved',
      body: renderSpecs(sources.approvedSpecs),
      fixed: false,
    },
  ];

  const feedback = sources.feedback === undefined ? [] : selectedFeedback(sources.feedback);

  if (feedback.length > 0) {
    sections.push({
      key: 'feedback',
      heading: '## Review feedback the user chose to apply',
      body: renderFeedback(feedback),
      fixed: false,
    });
  }

  const overhead = sections.reduce((total, section) => total + section.heading.length + 4, 0);
  const bodyBudget = Math.max(budget.totalChars - overhead, 0);

  const truncated: TruncationNote[] = [];
  const used = sections.reduce((total, section) => total + section.body.length, 0);

  if (used > bodyBudget) {
    /*
     * Trim the longest trimmable section first, repeatedly, until the whole fits. Longest-first is
     * what keeps a single enormous approved spec from starving the interview answers — the opposite
     * order would shorten every small section to nothing and still not fit.
     */
    const trimmable = sections.filter((section) => !section.fixed);
    const fixedChars = sections
      .filter((section) => section.fixed)
      .reduce((total, section) => total + section.body.length, 0);
    let remaining = Math.max(bodyBudget - fixedChars, 0);

    // Give every trimmable section an equal share, then hand back what the short ones do not use.
    const shares = new Map<string, number>();
    const pending = [...trimmable].sort((a, b) => a.body.length - b.body.length);

    for (const [index, section] of pending.entries()) {
      const share = Math.floor(remaining / (pending.length - index));
      const take = Math.min(section.body.length, share);
      shares.set(section.key, take);
      remaining -= take;
    }

    for (const section of sections) {
      const share = shares.get(section.key);
      if (share === undefined || share >= section.body.length) continue;

      const omitted = section.body.length - section.body.slice(0, share).trimEnd().length;
      section.body = truncateBody(section.body, share);
      truncated.push({ section: section.key, omittedChars: omitted });
    }
  }

  const text = sections
    .map((section) => `${section.heading}\n\n${section.body}`)
    .join('\n\n')
    .trim();

  return { text, truncated };
}
