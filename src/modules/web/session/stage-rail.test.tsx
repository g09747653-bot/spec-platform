import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SPEC_STAGES, STAGES, SUBSTAGES } from '@/modules/workflow/model/stages';

import { StageRail } from './stage-rail';

/**
 * Round 2, Д-2 — the rail names the stage, in every state it can be in.
 *
 * The gate walk reported a `stage-current` that read as nothing useful. What it actually held was
 * `"Constitution· generate"`: the substage span was nested *inside* the element carrying the
 * `stage-current` id, so the one element answered two questions at once and neither cleanly.
 *
 * The fix is structural — a sibling, not a child — and the test below is the negative the defect
 * asked for: it renders every reachable `(stage, substage)` pair, plus the two Quality settings, and
 * asserts the stage element holds a non-empty name and *only* the name. A regression that fuses them
 * again fails on the equality, not on a `toContain` that would still pass.
 */
const rail = (props: {
  currentStage: string;
  currentSubstage: string | null;
  qualityEnabled: boolean;
}) => renderToStaticMarkup(<StageRail {...props} />);

/** The text of the element carrying `data-testid`, with tags stripped. */
function textOf(html: string, testId: string): string | null {
  const opening = new RegExp(`<span[^>]*data-testid="${testId}"[^>]*>`).exec(html);
  if (opening === null) return null;

  const from = opening.index + opening[0].length;
  const rest = html.slice(from);
  const end = rest.indexOf('</span>');

  return (end === -1 ? rest : rest.slice(0, end)).replace(/<[^>]*>/g, '').trim();
}

/** Every position a session can occupy, as the page would hand it to the rail. */
const POSITIONS: readonly { stage: string; substage: string | null }[] = [
  ...STAGES.filter((stage) => !(SPEC_STAGES as readonly string[]).includes(stage)).map((stage) => ({
    stage,
    substage: null,
  })),
  ...SPEC_STAGES.flatMap((stage) => SUBSTAGES.map((substage) => ({ stage, substage }))),
];

describe('StageRail (round 2, Д-2)', () => {
  describe('every reachable position renders a non-empty stage name', () => {
    for (const position of POSITIONS) {
      for (const qualityEnabled of [false, true]) {
        const label = `${position.stage}${position.substage === null ? '' : `/${position.substage}`} · quality=${String(qualityEnabled)}`;

        it(label, () => {
          const html = rail({
            currentStage: position.stage,
            currentSubstage: position.substage,
            qualityEnabled,
          });

          /*
           * `quality` with the stage disabled is filtered out of the rail entirely, so there is no
           * current element to name — that is a coherent state, not an empty name, and it cannot
           * arise in a session whose selection is off anyway.
           */
          if (position.stage === 'quality' && !qualityEnabled) {
            expect(textOf(html, 'stage-current')).toBeNull();
            return;
          }

          const name = textOf(html, 'stage-current');

          expect(name).not.toBeNull();
          expect(name).not.toBe('');
          expect(name).not.toContain('·');
        });
      }
    }
  });

  it('names the stage and the substage in two separate elements', () => {
    const html = rail({
      currentStage: 'constitution',
      currentSubstage: 'generate',
      qualityEnabled: false,
    });

    // The exact fusion the gate walk saw: one element holding "Constitution· generate".
    expect(textOf(html, 'stage-current')).toBe('Constitution');
    expect(textOf(html, 'stage-substage')).toBe('· generate');
  });

  it('omits the substage element entirely when there is none', () => {
    const html = rail({ currentStage: 'interview', currentSubstage: null, qualityEnabled: false });

    expect(textOf(html, 'stage-current')).toBe('Interview');
    expect(textOf(html, 'stage-substage')).toBeNull();
  });

  /*
   * Defence against the shape the dump actually showed — a substage rendered as "· " with nothing
   * after it. The database cannot store a blank substage (a CHECK constrains it to the vocabulary),
   * but the rail is handed strings, and a rail that renders a bullet for nothing is a rail that
   * tells the user a lie about where they are.
   */
  it('ignores a blank substage rather than rendering a bare separator', () => {
    const html = rail({ currentStage: 'tasks', currentSubstage: '', qualityEnabled: false });

    expect(textOf(html, 'stage-current')).toBe('Tasks');
    expect(textOf(html, 'stage-substage')).toBeNull();
  });

  /*
   * A stage the model does not know is not reachable — a CHECK constrains the column — but the rail
   * receives a string, and the one thing it must never do is render an empty label. `stageLabel`
   * answers "Unknown stage", which is legible; nothing is not.
   */
  it('never renders an empty label, even for a stage outside the vocabulary', () => {
    const html = rail({
      currentStage: 'not-a-stage',
      currentSubstage: null,
      qualityEnabled: false,
    });

    // No element is current, so the rail names no stage — but every stage it *does* draw is named.
    expect(textOf(html, 'stage-current')).toBeNull();

    for (const stage of STAGES.filter((candidate) => candidate !== 'quality')) {
      expect(html).toContain(`data-stage="${stage}"`);
    }
    expect(html).not.toMatch(/<span[^>]*><\/span>/);
  });
});
