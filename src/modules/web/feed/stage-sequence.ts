import {
  methodologyConfig,
  stepCoversPosition,
  type MethodologyConfig,
} from '@/modules/methodologies';
import type { Stage } from '@/modules/workflow/model/stages';

import { stagePhraseKey } from '../i18n/dictionary/methodology';
import { type Translate } from '../i18n/translate';

/**
 * The numbered steps of a session, read off its methodology (tasks 105, 117).
 *
 * The rail this replaced filtered a hand-written stage tuple; task 105 replaced that with a walk of
 * the transition graph, "while there is still only one graph to be wrong about". There are five now,
 * and the step list is no longer a walk at all — it is the configuration's own `steps`, because a
 * step is not always a stage: the Edit workflow's three steps live inside two positions (Эталон
 * §1.4), and no walk of a graph can recover a header its author wrote.
 *
 * The Quality detour stays conditional on the session's selection for the same reason it always was:
 * a step the session has opted out of is not a step it will visit, and showing it greyed would
 * promise a stage that will never arrive.
 */
export interface StepModel {
  label: string;
  stage: Stage;
  /** Whether the session's current position falls inside this step. */
  current: boolean;
}

export function steps(
  t: Translate,
  methodologyId: string | null | undefined,
  currentStage: string,
  currentSubstage: string | null,
  qualityEnabled: boolean,
): StepModel[] {
  const config: MethodologyConfig = methodologyConfig(methodologyId);

  /*
   * `flatMap` over the whole list rather than a filter and a map, because the index is the address
   * the dictionary is keyed by (task 143) and filtering first would renumber it: hide the Quality
   * step of the parity workflow and «Complete» would ask for the sixth name instead of the seventh.
   */
  return config.steps.flatMap((step, index) => {
    if (step.stage === 'quality' && !qualityEnabled) return [];

    const key = stagePhraseKey(config.id, index);

    return [
      {
        label: key === null ? step.label : t(key),
        stage: step.stage,
        current: stepCoversPosition(step, currentStage, currentSubstage),
      },
    ];
  });
}

/**
 * The stages of a methodology in order — what a caller that thinks in stages rather than steps
 * needs. Kept because a stage may carry several steps, so `steps().length` is not a stage count.
 */
export function stageSequence(
  methodologyId: string | null | undefined,
  qualityEnabled: boolean,
): Stage[] {
  const config = methodologyConfig(methodologyId);
  const order: Stage[] = [];

  for (const stage of config.stages) {
    if (stage.position === 'complete') continue;
    if (stage.position === 'quality' && !qualityEnabled) continue;
    if (!order.includes(stage.position)) order.push(stage.position);
  }

  return order;
}
