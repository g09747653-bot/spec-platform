/**
 * The deterministic answers for the autonomous driver's two calls (task 145 on the test double).
 *
 * Like the other stubs it stands in for a well-behaved model and keys off plain strings: an adapter
 * may not import a core module (constitution A1), so nothing here knows what a round or a board is.
 * What it does know is the shape the doorway renders — `id | text | type` for a question and four
 * spaces before an option id — and it reads its answer straight out of that, which is the honest
 * thing for a double to do: the assertion worth making about a driver run is that the ids it
 * submitted were the ids on screen, and a double that invented its own would make that assertion
 * about itself.
 *
 * **It always takes the first option**, deliberately, and never the recommended one. Preferring the
 * recommendation would make the double agree with `resolveAnswers`' fallback rule at every question,
 * and a test in which the model's pick and the fallback are indistinguishable cannot tell whether
 * the pick was used at all.
 */
const QUESTION_LINE = /^- (\S+) \| .* \| (single|multiple)$/;
const OPTION_LINE = /^ {4}(\S+) —/;

interface StubQuestion {
  id: string;
  type: 'single' | 'multiple';
  options: string[];
}

/** Reads the rendered round back out of the prompt, in the order the doorway wrote it. */
function questionsFromPrompt(prompt: string): StubQuestion[] {
  const questions: StubQuestion[] = [];

  for (const line of prompt.split('\n')) {
    const question = QUESTION_LINE.exec(line);
    if (question !== null) {
      questions.push({
        id: question[1] ?? '',
        type: question[2] === 'multiple' ? 'multiple' : 'single',
        options: [],
      });
      continue;
    }

    const option = OPTION_LINE.exec(line);
    const current = questions.at(-1);
    if (option !== null && current !== undefined) current.options.push(option[1] ?? '');
  }

  return questions;
}

export function stubDriverAnswerDocument(prompt: string): string {
  const questions = questionsFromPrompt(prompt);

  return JSON.stringify(
    {
      answers: questions.map((question) => ({
        questionId: question.id,
        optionIds: question.options.slice(0, 1),
      })),
      rationale: 'The description settles this much on its own; the rest keeps the options open.',
    },
    null,
    2,
  );
}

/**
 * Every advisory finding kept.
 *
 * The opposite choice — keep none — would leave the selection resolver's intersection untested on
 * the only path that exercises it, because an empty list intersects with anything.
 */
export function stubDriverReviewDocument(prompt: string): string {
  const advisory = prompt.slice(prompt.indexOf('Optional findings:'));
  const ids = [...advisory.matchAll(/^- (\S+) — /gmu)].map((match) => match[1] ?? '');

  return JSON.stringify(
    {
      keepIds: ids,
      rationale: 'These sharpen the document without widening what was asked for.',
    },
    null,
    2,
  );
}

/**
 * Whether a prompt is one of the driver's.
 *
 * Recognised by phrases the two system templates render verbatim, the same trick
 * `looksLikeReviewPrompt` uses and for the same reason: the stub is selected by configuration, not
 * by a test flag, so it has only the prompt to go on, and a reword that broke this would break the
 * driver's own tests in the same commit.
 */
export function looksLikeDriverAnswerPrompt(prompt: string): boolean {
  return prompt.includes('"answers": [{"questionId", "optionIds": [], "freeText"}]');
}

export function looksLikeDriverReviewPrompt(prompt: string): boolean {
  return prompt.includes('{"keepIds": [], "rationale": "one sentence"}');
}
