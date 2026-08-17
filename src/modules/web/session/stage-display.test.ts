import { describe, expect, it } from 'vitest';

import { positionLabel } from '../feed/labels';

import { stageLabel } from './stage-display';

/**
 * One vocabulary per session (task 132; checklist row `1.4-6`; D-119).
 *
 * The red-team's screenshot is the specification here: a pill reading «Explore» beside a button
 * reading «Proceed to Constitution» — one position, two names, and the louder of them ours. D-119
 * promised the configuration would decide "how each position is called to the user"; until M11п
 * only the step pills and the picker read that promise.
 */
describe('stage names come from the session’s methodology (task 132)', () => {
  it('prints the canonical name when nothing names the methodology', () => {
    expect(stageLabel('constitution')).toBe('Constitution');
    expect(stageLabel('requirements')).toBe('Requirements');
  });

  it('prints the methodology’s own name for the position', () => {
    // The same canonical `constitution` position, under three graphs that call it three things.
    expect(stageLabel('constitution', 'myspec-greenfield-v1')).toBe('Constitution');
    expect(stageLabel('constitution', 'myspec-brownfield-v1')).toBe('Proposal');
    expect(stageLabel('constitution', 'openspec-brownfield-v1')).toBe('Proposal');
    expect(stageLabel('requirements', 'speckit-greenfield-v1')).toBe('Specify');
    expect(stageLabel('solution', 'speckit-greenfield-v1')).toBe('Plan');
    expect(stageLabel('interview', 'openspec-brownfield-v1')).toBe('Explore');
  });

  it('prefers the step that covers the substage, where a methodology narrows one', () => {
    // The Edit workflow's three steps live inside two positions (Эталон §1.4).
    expect(stageLabel('constitution', 'myspec-edit-v1', 'collect')).toBe('Describe');
    expect(stageLabel('constitution', 'myspec-edit-v1', 'review')).toBe('Review');
    expect(stageLabel('interview', 'myspec-edit-v1')).toBe('Reference');
  });

  /**
   * A document card in an Edit chat is about the bundle's `constitution.md`, and the Edit graph has
   * no step that writes it — «Describe» would name a step that did not. The canonical name is the
   * true one there, which is why the lookup answers `null` rather than guessing.
   */
  it('falls back to the canonical name where the configuration names no whole-stage step', () => {
    expect(stageLabel('constitution', 'myspec-edit-v1')).toBe('Constitution');
  });

  it('keeps the substage half canonical — `collect` is Collecting under every methodology', () => {
    expect(
      positionLabel({ stage: 'constitution', substage: 'collect' }, 'myspec-brownfield-v1'),
    ).toBe('Proposal · Collecting');
    expect(
      positionLabel({ stage: 'requirements', substage: 'generate' }, 'speckit-greenfield-v1'),
    ).toBe('Specify · Generating');
    expect(positionLabel({ stage: 'interview', substage: null }, 'openspec-brownfield-v1')).toBe(
      'Explore',
    );
  });

  it('still names an unknown stage rather than rendering a blank', () => {
    expect(stageLabel('nonsense', 'myspec-greenfield-v1')).toBe('Unknown stage');
  });
});
