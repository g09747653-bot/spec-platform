import { cn } from '../lib/cn';

import { ORDERED_STAGES, stageLabel } from './stage-display';

/**
 * The stage rail: where the session is, and what is still ahead (FR-007 AC-9).
 *
 * Rendered from persisted state, so a reload shows the same thing — the rail has no memory of its own
 * (FR-017 AC-1). `quality` is hidden unless the session has it enabled, because the default bundle is
 * the four-file one and offering a fifth stage unasked would contradict P3.
 */
export interface StageRailProps {
  currentStage: string;
  currentSubstage: string | null;
  qualityEnabled: boolean;
}

export function StageRail({ currentStage, currentSubstage, qualityEnabled }: StageRailProps) {
  const stages = ORDERED_STAGES.filter((stage) => stage !== 'quality' || qualityEnabled);
  const currentIndex = stages.indexOf(
    stages.find((stage) => stage === currentStage) ?? stages[0] ?? 'interview',
  );

  return (
    <nav aria-label="Workflow stages" data-testid="stage-rail">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {stages.map((stage, index) => {
          const isCurrent = stage === currentStage;
          const isDone = index < currentIndex;

          return (
            <li key={stage} className="flex items-center gap-2">
              {/*
                Round 2, Д-2: the substage is a **sibling**, not a child.

                Nested, `stage-current` read as "Constitution· generate" — the stage name and the
                substage fused into one string, so anything asking the rail "which stage?" got an
                answer it had to parse, and a dump reader looking for the name found something that
                did not look like one. One element, one fact.
              */}
              <span
                aria-current={isCurrent ? 'step' : undefined}
                data-stage={stage}
                data-state={isCurrent ? 'current' : isDone ? 'done' : 'upcoming'}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1',
                  isCurrent && 'border-accent bg-accent text-accent-ink font-medium',
                  isDone && 'border-border-subtle text-ink-muted',
                  !isCurrent && !isDone && 'border-border-subtle text-ink-muted opacity-60',
                )}
              >
                <span data-testid={isCurrent ? 'stage-current' : undefined}>
                  {stageLabel(stage)}
                </span>
                {isCurrent && currentSubstage !== null && currentSubstage !== '' && (
                  <span className="opacity-80" data-testid="stage-substage">
                    · {currentSubstage}
                  </span>
                )}
              </span>
              {index < stages.length - 1 && (
                <span aria-hidden className="text-ink-muted opacity-40">
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
