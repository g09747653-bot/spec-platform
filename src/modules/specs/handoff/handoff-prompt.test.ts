import { describe, expect, it } from 'vitest';

import { buildHandoffPrompt, BUNDLE_DIRECTORY } from './handoff-prompt';

/**
 * The handoff prompt (task 126).
 *
 * The acceptance criterion is that the prompt names **this** bundle: its own file names, its own
 * approved revisions, its own methodology. Everything asserted here is that claim — a prompt that
 * reads well but describes a different bundle is the failure worth catching.
 */
const BUNDLE = {
  bundleName: 'local-voice-assistant',
  methodologyLabel: 'MySpec · Greenfield · V1',
  files: [
    { fileName: 'constitution.md', revisionNumber: 6 },
    { fileName: 'requirements.md', revisionNumber: 4 },
    { fileName: 'solution.md', revisionNumber: 2 },
    { fileName: 'tasks.md', revisionNumber: 2 },
  ],
} as const;

describe('the handoff prompt', () => {
  it('names the bundle, its workflow, and where the files go', () => {
    const prompt = buildHandoffPrompt(BUNDLE);

    expect(prompt).toContain('local-voice-assistant');
    expect(prompt).toContain('MySpec · Greenfield · V1');
    expect(prompt).toContain(BUNDLE_DIRECTORY);
  });

  it('names every file with the revision that was approved', () => {
    const prompt = buildHandoffPrompt(BUNDLE);

    for (const file of BUNDLE.files) {
      expect(prompt).toContain(
        `${file.fileName} — approved revision ${String(file.revisionNumber)}`,
      );
    }
  });

  /*
   * A methodology's file set is its own (task 117). A prompt that always said "constitution.md,
   * requirements.md, solution.md, tasks.md" would be right for one workflow out of five and wrong
   * for the bundle actually in front of the user.
   */
  it('follows the methodology rather than the parity four', () => {
    const prompt = buildHandoffPrompt({
      bundleName: 'change-to-the-importer',
      methodologyLabel: 'OpenSpec · Brownfield · V1',
      files: [
        { fileName: 'proposal.md', revisionNumber: 1 },
        { fileName: 'design.md', revisionNumber: 3 },
      ],
    });

    expect(prompt).toContain('proposal.md — approved revision 1');
    expect(prompt).toContain('design.md — approved revision 3');
    expect(prompt).not.toContain('constitution.md');
  });

  it('says outright which promised files are not in the bundle', () => {
    const prompt = buildHandoffPrompt({ ...BUNDLE, omittedFiles: ['quality.md'] });

    expect(prompt).toContain('Not in the bundle yet: quality.md');
    expect(prompt).toContain('open question');
  });

  it('does not pretend there is something to hand over when nothing is approved', () => {
    const prompt = buildHandoffPrompt({ ...BUNDLE, files: [] });

    expect(prompt).toContain('no approved files yet');
  });

  it('instructs the agent on the rules the bundle itself depends on', () => {
    const prompt = buildHandoffPrompt(BUNDLE);

    // Identifier stability and dependency order are properties the linters enforce inside the
    // product (task 114); an agent that renumbers on the way out undoes them.
    expect(prompt).toContain('never renumber');
    expect(prompt).toContain('dependencies');
    expect(prompt).toContain('constitution outranks');
  });
});
