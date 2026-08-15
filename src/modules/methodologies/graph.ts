import {
  isSpecStage,
  positionKey,
  type SpecStage,
  type Stage,
  type StagePosition,
  type Substage,
} from '@/modules/workflow/model/stages';
import type { GateId, TransitionEdge } from '@/modules/workflow/transition-table';

import type { MethodologyConfig, MethodologyStage } from './model/config';

/**
 * The graph, derived from the configuration (task 116).
 *
 * Rows are *derived*, not listed per methodology, and that is the point of the milestone: five
 * methodologies differ in which stages they visit, so five hand-written tables would differ in five
 * places that all mean the same thing. The derivation encodes the rules the original table's comment
 * stated in prose — interview exits forward, a spec stage runs `collect → generate → review` with
 * every backward move free, a decided review advances, an optional stage forks — and the parity
 * fixture (`__tests__/transition-table.parity.json`, captured from the hand-written table *before*
 * this file existed) is the proof that the encoding did not change any of them.
 *
 * Row order is part of what that fixture pins, so it is stated here rather than left to happenstance:
 * the exit row of the substageless entry stage, then for each spec stage its five internal rows
 * followed by its exit rows (advance, then terminal, then optional detour), then the re-entry row
 * last. Nothing reads the table by index, but a table that reorders itself between refactors is a
 * table whose diff cannot be reviewed.
 */

const COLLECT: Substage = 'collect';
const GENERATE: Substage = 'generate';
const REVIEW: Substage = 'review';

function at(stage: SpecStage, substage: Substage): StagePosition {
  return { stage, substage };
}

/** The position a stage is entered at: its `collect` substage, or the stage itself. */
export function entryPosition(stage: Stage): StagePosition {
  return isSpecStage(stage) ? at(stage, COLLECT) : { stage, substage: null };
}

function edge(from: StagePosition, to: StagePosition, gate: GateId): TransitionEdge {
  return { id: `${positionKey(from)}->${positionKey(to)}`, from, to, gate };
}

/** The five rows every spec stage carries: forward through its gates, backward unconditionally. */
function internalRows(stage: SpecStage): TransitionEdge[] {
  return [
    edge(at(stage, COLLECT), at(stage, GENERATE), 'collect'),
    edge(at(stage, GENERATE), at(stage, REVIEW), 'approval'),
    edge(at(stage, GENERATE), at(stage, COLLECT), 'backward'),
    edge(at(stage, REVIEW), at(stage, GENERATE), 'backward'),
    edge(at(stage, REVIEW), at(stage, COLLECT), 'backward'),
  ];
}

/**
 * Which gate guards a stage's row to the terminal.
 *
 * Three answers, and each names a different rule. `tasks-to-complete` is the parity fork: the row
 * exists only when the session did *not* opt into Quality, and the composite gate says so.
 * `quality-to-complete` closes the Quality pass and every re-entry (FR-020 AC-7). Everything else is
 * plain: a review decided and the methodology's own documents approved.
 */
function terminalGate(stage: SpecStage, qualityDetour: boolean): GateId {
  if (qualityDetour) return 'tasks-to-complete';
  return stage === 'quality' ? 'quality-to-complete' : 'stage-to-complete';
}

/**
 * The rows leaving a spec stage's `review`.
 *
 * Three shapes, in a fixed order:
 *
 * 1. **advance** — to the next stage the session must visit;
 * 2. **terminal** — present when nothing required follows, i.e. when this stage can end the session;
 * 3. **detour** — to an optional stage that follows.
 *
 * The Quality fork keeps its own gate identifiers (`tasks-to-complete`, `tasks-to-quality`) because
 * its optionality is not only a graph shape: A6 makes it depend on a *registered capability*, and
 * the composite gates that encode that are the ones the matrix test already covers. Any other
 * optional stage is plain: its predecessor offers two doors and the user picks one (P2).
 */
function exitRows(
  stage: SpecStage,
  nextRequired: MethodologyStage | undefined,
  nextOptional: MethodologyStage | undefined,
  hasTerminal: boolean,
): TransitionEdge[] {
  const from = at(stage, REVIEW);
  const rows: TransitionEdge[] = [];
  const qualityDetour = nextOptional?.position === 'quality';

  if (nextRequired !== undefined) {
    rows.push(edge(from, entryPosition(nextRequired.position), 'review-advance'));
  }

  // A stage ends the session when nothing required follows it. With an optional stage in between,
  // both doors exist — which is exactly what "optional" means as a graph property.
  if (hasTerminal && nextRequired === undefined) {
    rows.push(
      edge(from, { stage: 'complete', substage: null }, terminalGate(stage, qualityDetour)),
    );
  }

  if (nextOptional !== undefined) {
    rows.push(
      edge(
        from,
        entryPosition(nextOptional.position),
        qualityDetour ? 'tasks-to-quality' : 'review-advance',
      ),
    );
  }

  return rows;
}

/**
 * Builds the transition table for a configuration.
 *
 * Pure and total: it reads the config and nothing else, so the table for a methodology is a value
 * that can be compared, snapshotted and enumerated exactly like the hand-written one it replaces.
 */
export function buildTransitionTable(config: MethodologyConfig): TransitionEdge[] {
  const rows: TransitionEdge[] = [];
  const stages = config.stages;
  const terminal = stages.find((stage) => stage.position === 'complete');

  for (const [index, stage] of stages.entries()) {
    const following = stages.slice(index + 1).filter((next) => next.position !== 'complete');
    const nextRequired = following.find((next) => !next.optional);
    // Only an optional stage reachable *before* the next required one is this stage's detour;
    // anything after that belongs to the stage that precedes it.
    const nextOptional = following
      .slice(0, nextRequired === undefined ? following.length : following.indexOf(nextRequired))
      .find((next) => next.optional);

    if (stage.position === 'complete') continue;

    if (!isSpecStage(stage.position)) {
      // A substageless, non-terminal stage is the grounding entry: one gated row forward.
      const target = nextRequired ?? nextOptional;
      if (target !== undefined) {
        rows.push(
          edge(
            { stage: stage.position, substage: null },
            entryPosition(target.position),
            'interview-exit',
          ),
        );
      }
      continue;
    }

    rows.push(...internalRows(stage.position));
    rows.push(...exitRows(stage.position, nextRequired, nextOptional, terminal !== undefined));
  }

  /*
   * Re-entry, last. `complete → quality.collect` is the only row out of the terminal (FR-020
   * AC-5/AC-9) and it exists only for the Quality stage: it is what makes enabling Quality after a
   * default-mode export not require restarting the session (constitution A2). No other optional
   * stage is re-enterable, because no other one is an enrichment pass over a finished bundle.
   */
  const quality = stages.find((stage) => stage.position === 'quality' && stage.optional);
  if (terminal !== undefined && quality !== undefined) {
    rows.push(
      edge({ stage: 'complete', substage: null }, entryPosition('quality'), 'quality-reentry'),
    );
  }

  return rows;
}
