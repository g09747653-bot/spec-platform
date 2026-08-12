import { describe, expect, it } from 'vitest';

import { CreateProjectRequest, deriveProjectName, MAX_PROMPT_LENGTH } from './create-project';

describe('CreateProjectRequest (FR-003 AC-2)', () => {
  it('accepts a described idea and stores it trimmed', () => {
    const parsed = CreateProjectRequest.parse({ prompt: '  a recipe app for cooks\n' });

    expect(parsed.prompt).toBe('a recipe app for cooks');
  });

  it('rejects an empty prompt with a message that tells the user what to do', () => {
    const result = CreateProjectRequest.safeParse({ prompt: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/describe your idea/i);
  });

  it('rejects a whitespace-only prompt as empty, not as three characters', () => {
    for (const prompt of ['   ', '\n\n', '\t \t', ' '.repeat(3)]) {
      expect(CreateProjectRequest.safeParse({ prompt }).success).toBe(false);
    }
  });

  it('rejects a prompt longer than the ceiling', () => {
    expect(CreateProjectRequest.safeParse({ prompt: 'x'.repeat(MAX_PROMPT_LENGTH) }).success).toBe(
      true,
    );
    expect(
      CreateProjectRequest.safeParse({ prompt: 'x'.repeat(MAX_PROMPT_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('rejects a missing or non-string prompt', () => {
    expect(CreateProjectRequest.safeParse({}).success).toBe(false);
    expect(CreateProjectRequest.safeParse({ prompt: 42 }).success).toBe(false);
    expect(CreateProjectRequest.safeParse({ prompt: null }).success).toBe(false);
  });
});

describe('deriveProjectName', () => {
  it('names the project after the first non-empty line', () => {
    expect(deriveProjectName('A recipe app\nwith meal plans')).toBe('A recipe app');
    expect(deriveProjectName('\n\n  A recipe app\n')).toBe('A recipe app');
  });

  it('collapses runs of whitespace', () => {
    expect(deriveProjectName('A   recipe\t\tapp')).toBe('A recipe app');
  });

  it('truncates a long first line on a word boundary', () => {
    const name = deriveProjectName(
      'A platform that converts a plain language prompt into a complete versioned specification bundle',
    );

    expect(name.length).toBeLessThanOrEqual(61);
    expect(name.endsWith('…')).toBe(true);
    expect(name).not.toMatch(/ …$/);
  });

  it('does not cut mid-word when the break would land too early', () => {
    const name = deriveProjectName(`${'a'.repeat(80)} tail`);

    expect(name).toBe(`${'a'.repeat(60)}…`);
  });

  it('falls back to a placeholder when there is nothing to name it after', () => {
    expect(deriveProjectName('   ')).toBe('Untitled project');
    expect(deriveProjectName('')).toBe('Untitled project');
  });
});
