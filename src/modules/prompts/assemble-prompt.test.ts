import { describe, expect, it } from 'vitest';

import { assemblePrompt, interpolateTemplate, PromptAssemblyError } from './assemble-prompt';
import { specGenerationPrompt } from './assets/spec-generation';
import { assertPromptRegistry, promptRegistry, registryIssues, PROMPT_IDS } from './registry';

/**
 * The prompts module (task 41).
 *
 * The two acceptance criteria are checked from opposite ends: the registry guard proves that an asset
 * out of step with its declaration stops the process, and the assembly cases prove that a prompt is
 * either complete or an exception — never a request carrying a literal `{{placeholder}}`.
 */

describe('the shipped registry', () => {
  it('is internally consistent, so boot and build succeed', () => {
    expect(registryIssues(promptRegistry)).toEqual([]);
    expect(() => {
      assertPromptRegistry();
    }).not.toThrow();
  });

  it('keys every asset by its own identifier', () => {
    for (const id of PROMPT_IDS) {
      expect(promptRegistry[id].id).toBe(id);
    }
  });
});

describe('the boot guard', () => {
  it('rejects a template using a placeholder that is not declared', () => {
    const issues = registryIssues({
      broken: { id: 'broken', system: 'x', user: 'Hello {{name}}', variables: [] },
    });

    expect(issues).toEqual(['broken: template uses {{name}}, which is not a declared variable']);
  });

  it('rejects a declared variable no template uses', () => {
    const issues = registryIssues({
      broken: { id: 'broken', system: 'x', user: 'y', variables: ['name'] },
    });

    expect(issues).toEqual(['broken: declares variable "name", which no template uses']);
  });

  it('rejects an asset filed under the wrong identifier', () => {
    const issues = registryIssues({
      expected: { id: 'actual', system: 'x', user: 'y', variables: [] },
    });

    expect(issues).toEqual(['expected: asset carries the identifier "actual"']);
  });
});

describe('assemblePrompt', () => {
  it('fills every placeholder and leaves none behind', () => {
    const prompt = assemblePrompt('interview.summary.skeleton.v1', {
      initialPrompt: 'A tool for writing specs.',
      answered: '- audience: solo developers',
    });

    expect(prompt.id).toBe('interview.summary.skeleton.v1');
    expect(prompt.user).toContain('A tool for writing specs.');
    expect(prompt.user).toContain('- audience: solo developers');
    expect(`${prompt.system}${prompt.user}`).not.toMatch(/\{\{/);
  });

  it('collapses the gaps an empty optional block leaves behind', () => {
    const withoutSummary = assemblePrompt('interview.questions.skeleton.v1', {
      stage: 'interview',
      initialPrompt: 'A tool for writing specs.',
      summaryBlock: '',
      satisfiedNeeds: '(none)',
      unmetNeeds: '(none declared yet)',
      replyBlock: '',
    });

    expect(withoutSummary.user).not.toMatch(/\n{3,}/);
    expect(withoutSummary.user.endsWith('\n')).toBe(false);
  });

  it('refuses to interpolate a template whose variable is missing at runtime', () => {
    // The typed call path makes this unreachable; the guard is what catches a template edited to use
    // a placeholder nobody supplies. A prompt is complete or it is an exception — never a request
    // carrying a literal `{{name}}` to a provider.
    expect(() => interpolateTemplate('Hello {{name}}', {}, 'demo')).toThrow(PromptAssemblyError);
    expect(() => interpolateTemplate('Hello {{name}}', { name: 'world' }, 'demo')).not.toThrow();
    expect(interpolateTemplate('Hello {{name}}', { name: 'world' }, 'demo')).toBe('Hello world');
  });

  it('does not re-scan substituted values for placeholders', () => {
    // A user's prompt text containing `{{x}}` is data, not a template: interpolating it again would
    // let untrusted input reach for a variable it was never given.
    expect(interpolateTemplate('{{a}}', { a: '{{b}}' }, 'demo')).toBe('{{b}}');
  });
});

describe('spec generation', () => {
  it('carries the required section list, derived rather than restated', () => {
    const prompt = specGenerationPrompt({
      specType: 'solution',
      initialPrompt: 'A tool for writing specs.',
    });

    const listed = [...prompt.user.matchAll(/^\d+\. (#{1,6}) (.+)$/gm)];

    expect(listed.length).toBeGreaterThan(1);
    // Ordered from 1, so the model is told a sequence rather than a set.
    expect(prompt.user).toContain('in exactly this order');
    expect(prompt.user).toMatch(/^1\. ## /m);
  });

  it('asks for a different section list per spec type', () => {
    const constitution = specGenerationPrompt({ specType: 'constitution', initialPrompt: 'x' });
    const tasks = specGenerationPrompt({ specType: 'tasks', initialPrompt: 'x' });

    expect(constitution.user).not.toBe(tasks.user);
  });

  it('omits the optional blocks entirely when they are absent', () => {
    const plain = specGenerationPrompt({ specType: 'tasks', initialPrompt: 'x' });

    expect(plain.user).not.toContain('Context gathered so far');
    expect(plain.user).not.toContain('returned for changes');
  });

  it('includes context and a change instruction when they are supplied', () => {
    const full = specGenerationPrompt({
      specType: 'tasks',
      initialPrompt: 'x',
      context: 'Prior answers: ship fast.',
      changeInstruction: 'Split milestone 2.',
    });

    expect(full.user).toContain('Prior answers: ship fast.');
    expect(full.user).toContain('Split milestone 2.');
  });
});
