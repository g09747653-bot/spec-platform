import type { Stage } from '@/modules/workflow/model/stages';
import { TRANSITION_TABLE } from '@/modules/workflow/transition-table';

/**
 * The numbered steps of a session, derived from the transition graph (task 105).
 *
 * The rail this replaces filtered a hand-written stage tuple. That was correct only for as long as
 * the tuple and the table agreed, and M9п turns the table into a *configuration* — one graph per
 * methodology (А-2 · M9). A step list read off a constant would then show MySpec's five steps for
 * an OpenSpec session, so the list is read off the graph now, while there is still only one graph
 * to be wrong about.
 *
 * The walk is deliberately simple: from the current stage, take the first forward edge that leaves
 * it, preferring anything over `complete` so the optional Quality detour is taken when the session
 * has opted into it. Backward edges are excluded by gate, not by inspection of the endpoints — a
 * `backward` gate is exactly what "this edge does not advance the session" means.
 */
export function stageSequence(qualityEnabled: boolean): Stage[] {
  const permitted = (stage: Stage): boolean => stage !== 'quality' || qualityEnabled;

  const order: Stage[] = [];
  const seen = new Set<Stage>();
  let current: Stage | undefined = 'interview';

  while (current !== undefined && !seen.has(current)) {
    order.push(current);
    seen.add(current);

    if (current === 'complete') break;

    const leaving: Stage = current;
    const targets: Stage[] = TRANSITION_TABLE.filter(
      (edge) =>
        edge.from.stage === leaving &&
        edge.to.stage !== leaving &&
        edge.gate !== 'backward' &&
        permitted(edge.to.stage) &&
        !seen.has(edge.to.stage),
    ).map((edge) => edge.to.stage);

    // `tasks.review` forks to `complete` and to `quality.collect`; the detour is the longer route,
    // and a step list that stopped at the fork would hide a stage the session is going to visit.
    current = targets.find((stage) => stage !== 'complete') ?? targets[0];
  }

  return order;
}
