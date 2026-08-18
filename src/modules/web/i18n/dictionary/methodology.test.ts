import { describe, expect, it } from 'vitest';

import { METHODOLOGY_CONFIGS } from '@/modules/methodologies';
import { STAGES } from '@/modules/workflow/model/stages';

import { translator } from '../translate';

import { methodologyPhrases, methodologySummaryKey, stagePhraseKey } from './methodology';

/**
 * The one table in this dictionary whose keys are built at runtime (task 143).
 *
 * Everywhere else a missing phrase is a type error: a surface asks for `PhraseKey` and a literal
 * that is not one does not compile. This module cannot have that guard, because its address is a
 * configuration id and a step index pasted together — `session.stage.myspec-edit-v1.2` — and a
 * string built from two values is a string. `stagePhraseKey` answers `null` for one it does not
 * hold, and `stageLabel` then falls back to the configuration's own English label.
 *
 * That fallback is the right behaviour and it is also invisible: a step added to a workflow, or two
 * steps reordered, would print English pills inside a Russian interface with nothing red anywhere —
 * no type error, no lint error, no failing test. Which is precisely the defect the whole task exists
 * to close, arriving through the one door the type system does not watch. So it is watched here.
 */
const en = translator('en');

describe('the methodology dictionary covers the workflows this build ships', () => {
  it('names every step of every configuration', () => {
    for (const config of METHODOLOGY_CONFIGS) {
      config.steps.forEach((step, index) => {
        expect(
          stagePhraseKey(config.id, index),
          `${config.id} step ${String(index)} («${step.label}») has no phrase, so its pill would ` +
            `print English in every language`,
        ).not.toBeNull();
      });
    }
  });

  /**
   * The English half is the configuration's own label, character for character.
   *
   * The stronger half of the check above, and the one that catches a *rename* rather than an
   * addition. The configuration's label is what the prompt and the handoff badge use (У-1), and the
   * dictionary's English is what the chrome prints; nothing joins them but this assertion. Rename a
   * step in `methodologies/configs/*` and the pill would go on printing the old word — the same
   * position called two things, which is the defect D-119 and task 132 already fixed once.
   */
  it('says in English exactly what the configuration says', () => {
    for (const config of METHODOLOGY_CONFIGS) {
      config.steps.forEach((step, index) => {
        const key = stagePhraseKey(config.id, index);
        if (key === null) return; // Reported by the test above; not worth failing twice.

        expect(en(key), `${config.id} step ${String(index)}`).toBe(step.label);
      });
    }
  });

  it('describes every configuration in the picker, in the configuration’s own words', () => {
    for (const config of METHODOLOGY_CONFIGS) {
      const key = methodologySummaryKey(config.id);

      expect(key, `${config.id} has no summary phrase`).not.toBeNull();
      if (key !== null) expect(en(key), `${config.id} summary`).toBe(config.summary);
    }
  });

  /**
   * The other direction: no entry addresses a step that no longer exists.
   *
   * An orphan is not a blank pill, so it cannot be found by reading the screen — it is a Russian
   * sentence nobody will ever see, and the reason to care is that it makes the table look complete
   * while the step it belonged to has moved to another index and taken the wrong word with it. A
   * removed step shifts every index after it, so this fires on exactly the edit that silently
   * re-points the rest of the workflow's names.
   */
  it('holds no entry for a step that does not exist', () => {
    const configs = new Map(METHODOLOGY_CONFIGS.map((config) => [config.id, config]));

    for (const key of Object.keys(methodologyPhrases)) {
      const match = /^session\.stage\.(.+)\.(\d+)$/.exec(key);
      if (match === null) continue;

      const [, configId = '', index = ''] = match;
      const config = configs.get(configId);

      expect(config, `${key} names a workflow this build does not ship`).toBeDefined();
      expect(config?.steps.length ?? 0, `${key} is past the end of ${configId}`).toBeGreaterThan(
        Number(index),
      );
    }
  });

  /**
   * The canonical seven, which `stage-display.ts` falls back to when a configuration names nothing.
   *
   * Keyed by the `Stage` union there, so a stage without a key is already a type error — what is
   * asserted here is the half that type cannot reach: that the key it points at is one this table
   * actually holds. The two files are joined by a string, and a string is not checked.
   */
  it('names every canonical stage, and the one that is no stage at all', () => {
    for (const stage of [...STAGES, 'unknown']) {
      expect(
        Object.hasOwn(methodologyPhrases, `session.stage.canonical.${stage}`),
        `no canonical phrase for ${stage}`,
      ).toBe(true);
    }
  });
});
