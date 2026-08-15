import { cn } from '../lib/cn';
import { stageLabel } from '../session/stage-display';

import { substageLabel } from './labels';
import { stageSequence } from './stage-sequence';

/**
 * The numbered step pills in the session header (task 105; Эталон §1.4).
 *
 * Nothing here decides anything: the sequence comes from the transition graph, the position comes
 * from persisted state, and the pill is a reading of the two. A reload therefore restores the same
 * header for the same reason the feed below it restores itself (FR-017 AC-1).
 *
 * The `stage-rail`, `stage-current` and `stage-substage` test ids are carried over from the rail this
 * replaces on purpose. They name facts — which stages exist, which one the session is in, which
 * substage — and those facts did not change when the surface did; renaming them would have made
 * every suite that reads a position look like it was testing something new.
 */
export interface StepPillsProps {
  currentStage: string;
  currentSubstage: string | null;
  qualityEnabled: boolean;
}

export function StepPills({ currentStage, currentSubstage, qualityEnabled }: StepPillsProps) {
  const stages = stageSequence(qualityEnabled);
  const currentIndex = stages.findIndex((stage) => stage === currentStage);
  const substage = substageLabel(currentSubstage);

  return (
    <nav aria-label="Workflow stages" data-testid="stage-rail">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="step-pills">
        {stages.map((stage, index) => {
          const isCurrent = stage === currentStage;
          const isDone = currentIndex >= 0 && index < currentIndex;

          return (
            <li key={stage} className="flex items-center gap-2">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                data-stage={stage}
                data-step={index + 1}
                data-state={isCurrent ? 'current' : isDone ? 'done' : 'upcoming'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1.5',
                  isCurrent && 'border-accent bg-accent text-accent-ink font-medium',
                  isDone && 'border-border-subtle text-ink-muted',
                  !isCurrent && !isDone && 'border-border-subtle text-ink-muted opacity-60',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none',
                    isCurrent ? 'bg-accent-ink/15' : 'border-border-subtle border',
                  )}
                >
                  {index + 1}
                </span>
                <span data-testid={isCurrent ? 'stage-current' : undefined}>
                  {stageLabel(stage)}
                </span>
                {isCurrent && substage !== null && (
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
