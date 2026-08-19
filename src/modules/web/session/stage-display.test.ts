import { describe, expect, it } from 'vitest';

import { positionLabel } from '../feed/labels';
import { translator } from '../i18n/translate';

import { stageLabel } from './stage-display';

/**
 * One vocabulary per session (task 132; checklist row `1.4-6`; D-119).
 *
 * The red-team's screenshot is the specification here: a pill reading «Explore» beside a button
 * reading «Proceed to Constitution» — one position, two names, and the louder of them ours. D-119
 * promised the configuration would decide "how each position is called to the user"; until M11п
 * only the step pills and the picker read that promise.
 *
 * The translator is passed explicitly rather than defaulted, which is the point of task 143's
 * signature: a surface that forgot it does not compile, so it cannot quietly print English into a
 * Russian header. Most of these cases ask for English, because they are about *which* step names a
 * position rather than about the words — the two Russian ones are where the words matter.
 */
const en = translator('en');
const ru = translator('ru');

describe('stage names come from the session’s methodology (task 132)', () => {
  it('prints the canonical name when nothing names the methodology', () => {
    expect(stageLabel(en, 'constitution')).toBe('Constitution');
    expect(stageLabel(en, 'requirements')).toBe('Requirements');
  });

  it('prints the methodology’s own name for the position', () => {
    // The same canonical `constitution` position, under three graphs that call it three things.
    expect(stageLabel(en, 'constitution', 'myspec-greenfield-v1')).toBe('Constitution');
    expect(stageLabel(en, 'constitution', 'myspec-brownfield-v1')).toBe('Proposal');
    expect(stageLabel(en, 'constitution', 'openspec-brownfield-v1')).toBe('Proposal');
    expect(stageLabel(en, 'requirements', 'speckit-greenfield-v1')).toBe('Specify');
    expect(stageLabel(en, 'solution', 'speckit-greenfield-v1')).toBe('Plan');
    expect(stageLabel(en, 'interview', 'openspec-brownfield-v1')).toBe('Explore');
  });

  it('prefers the step that covers the substage, where a methodology narrows one', () => {
    // The Edit workflow's three steps live inside two positions (Эталон §1.4).
    expect(stageLabel(en, 'constitution', 'myspec-edit-v1', 'collect')).toBe('Describe');
    expect(stageLabel(en, 'constitution', 'myspec-edit-v1', 'review')).toBe('Review');
    expect(stageLabel(en, 'interview', 'myspec-edit-v1')).toBe('Reference');
  });

  /**
   * A document card in an Edit chat is about the bundle's `constitution.md`, and the Edit graph has
   * no step that writes it — «Describe» would name a step that did not. The canonical name is the
   * true one there, which is why the lookup answers `null` rather than guessing.
   */
  it('falls back to the canonical name where the configuration names no whole-stage step', () => {
    expect(stageLabel(en, 'constitution', 'myspec-edit-v1')).toBe('Constitution');
  });

  it('keeps the substage half canonical — `collect` is Collecting under every methodology', () => {
    expect(
      positionLabel(en, { stage: 'constitution', substage: 'collect' }, 'myspec-brownfield-v1'),
    ).toBe('Proposal · Collecting');
    expect(
      positionLabel(en, { stage: 'requirements', substage: 'generate' }, 'speckit-greenfield-v1'),
    ).toBe('Specify · Generating');
    expect(
      positionLabel(en, { stage: 'interview', substage: null }, 'openspec-brownfield-v1'),
    ).toBe('Explore');
  });

  it('still names an unknown stage rather than rendering a blank', () => {
    expect(stageLabel(en, 'nonsense', 'myspec-greenfield-v1')).toBe('Unknown stage');
  });
});

/**
 * The same lookup, in Russian (task 143).
 *
 * Two properties, and both are the reason the dictionary is keyed by (config id, step index) rather
 * than by the English label. The first: one label means two different words. «Solution» is the
 * fourth step of the parity workflow and «Архитектура» there, and it is also the fourth step of
 * OpenSpec, where it names `design.md` — a table keyed by the word could not have told them apart
 * from a table keyed by the word for «Proposal», which genuinely does mean the same thing twice.
 *
 * The second: the Edit workflow's third step is «Правки», not «Рецензия», although the English calls
 * it Review. A literal translation would have composed «Рецензия · Рецензия» in the stage chip,
 * because the substage under it is `review` and §2.4 of the voice standard gives that «Рецензия».
 */
describe('stage names in Russian (task 143)', () => {
  it('gives every methodology its own words for the position', () => {
    expect(stageLabel(ru, 'constitution', 'myspec-greenfield-v1')).toBe('Конституция');
    expect(stageLabel(ru, 'constitution', 'myspec-brownfield-v1')).toBe('Предложение');
    expect(stageLabel(ru, 'requirements', 'speckit-greenfield-v1')).toBe('Спецификация');
    expect(stageLabel(ru, 'requirements', 'openspec-brownfield-v1')).toBe('Спецификации');
    expect(stageLabel(ru, 'interview', 'openspec-brownfield-v1')).toBe('Изучение');
    expect(stageLabel(ru, 'solution', 'myspec-greenfield-v1')).toBe('Архитектура');
  });

  it('names the canonical fallback and the unknown stage in Russian too', () => {
    expect(stageLabel(ru, 'constitution', 'myspec-edit-v1')).toBe('Конституция');
    expect(stageLabel(ru, 'nonsense', 'myspec-greenfield-v1')).toBe('Неизвестный этап');
  });

  it('does not repeat itself in the stage chip of an Edit chat', () => {
    expect(positionLabel(ru, { stage: 'constitution', substage: 'review' }, 'myspec-edit-v1')).toBe(
      'Правки · Рецензия',
    );
  });
});
