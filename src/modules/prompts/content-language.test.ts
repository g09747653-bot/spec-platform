import { describe, expect, it } from 'vitest';

import { assemblePrompt } from './assemble-prompt';
import { CONTENT_LANGUAGE_MARKER, contentLanguageInstruction } from './content-language';
import { promptRegistry, type PromptId, type PromptVariables } from './registry';

/**
 * У-1 — the language instruction comes from **one** place (task 108).
 *
 * The acceptance criterion is a guard, and this is it. Two claims, and the second is the one worth
 * having: every assembled prompt carries the instruction, and **no prompt asset contains it**. A
 * second copy in an asset would look harmless — it would even work — right up to the first reword,
 * after which half the prompts would say one thing and half another, and only the models would know.
 */

/** A filled-in variable set per prompt, so every asset can actually be assembled here. */
const VARIABLES: { [Id in PromptId]: PromptVariables[Id] } = {
  'spec.generation.v2': {
    specType: 'constitution',
    initialPrompt: 'A tool for writing specs.',
    context: '',
    changeInstruction: '',
  },
  'spec.generation.methodology.v1': {
    documentLabel: 'Plan',
    template: '# Implementation Plan\n\n## Summary\n',
    requiredSections: '1. ## Summary',
    initialPrompt: 'A tool for writing specs.',
    context: '',
    changeInstruction: '',
  },
  'interview.questions.v3': {
    stage: 'interview',
    audienceRules: 'They are not technical.',
    roundNumber: '1',
    topics: '- who will use this',
    initialPrompt: 'A tool for writing specs.',
    summaryBlock: '',
    satisfiedNeeds: '(none)',
    unmetNeeds: '(none declared yet)',
    replyBlock: '',
  },
  'review.board.v2': { specType: 'constitution', specContent: '# Constitution', verification: '' },
  'revision.note.v1': {
    specType: 'constitution',
    selectedPoints: '- Scope — No non-goals: Add a non-goals list.',
    specContent: '# Constitution',
  },
  'refinement.propose.v1': {
    specType: 'constitution',
    specContent: '# Constitution',
    instruction: 'Add a non-goal.',
  },
  'edit.propose.v1': {
    documents: '<<<FILE constitution.md\n# Constitution\nFILE constitution.md',
    fileNames: 'constitution.md',
    instruction: 'Add a non-goal.',
  },
  'decision.intent.v1': {
    message: 'approve it',
    pendingKind: 'spec',
    offeredActions: 'approve, reject',
  },
  'chat.answer.v1': { message: 'what is this?', pendingDescription: 'nothing', context: '' },
  'methodology.classify.v1': {
    options: '- myspec-greenfield-v1: the full bundle for something new',
    description: 'A tool for writing specs.',
  },
  'interview.reply-assessment.skeleton.v1': { declaredNeeds: 'audience', reply: 'solo devs' },
  'interview.summary.skeleton.v1': {
    initialPrompt: 'A tool for writing specs.',
    answered: '- audience: solo developers',
  },
};

const ALL_IDS = Object.keys(promptRegistry) as PromptId[];

describe('the content-language instruction (task 108)', () => {
  it('reaches every prompt the registry defines', () => {
    for (const id of ALL_IDS) {
      const assembled = assemblePrompt(id, VARIABLES[id], { contentLanguage: 'ru' });

      expect(assembled.system, `${id} lost the language instruction`).toContain(
        CONTENT_LANGUAGE_MARKER,
      );
      expect(assembled.system, `${id} does not name the language`).toContain('Russian');
    }
  });

  it('appears in no prompt asset — the single assembly point is the only source', () => {
    for (const id of ALL_IDS) {
      const asset = promptRegistry[id];

      expect(
        asset.system,
        `${id} restates the language instruction in its system prompt`,
      ).not.toContain(CONTENT_LANGUAGE_MARKER);
      expect(
        asset.user,
        `${id} restates the language instruction in its user prompt`,
      ).not.toContain(CONTENT_LANGUAGE_MARKER);
      // The obvious near-miss: naming a language in an asset rather than taking one.
      expect(asset.system.toLowerCase()).not.toContain('answer in russian');
      expect(asset.user.toLowerCase()).not.toContain('answer in russian');
    }
  });

  it('names the language when it is known, and mirrors the user when it is not', () => {
    expect(contentLanguageInstruction('ru')).toContain('Russian');
    expect(contentLanguageInstruction('en')).toContain('English');
    expect(contentLanguageInstruction(null)).toContain(
      'the same language the user wrote their own description in',
    );
    // An unrecognised code is not a reason to fall back to English.
    expect(contentLanguageInstruction('xx')).toContain(
      'the same language the user wrote their own description in',
    );
  });

  it('protects the things that must not be translated', () => {
    const instruction = contentLanguageInstruction('ru');

    expect(instruction).toContain('Identifiers, JSON keys, field names, section headings');
    expect(instruction).toContain('never translate them');
  });

  it('is appended, so an asset cannot place it where the model reads it as the task', () => {
    const assembled = assemblePrompt('review.board.v2', VARIABLES['review.board.v2'], {
      contentLanguage: 'ru',
    });

    expect(assembled.system.endsWith(contentLanguageInstruction('ru'))).toBe(true);
  });
});
