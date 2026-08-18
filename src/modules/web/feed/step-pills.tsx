import { cn } from '../lib/cn';

import { substageLabel } from './labels';
import { steps } from './stage-sequence';

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
  /** The session's methodology (task 117); absent means the parity workflow. */
  methodologyId?: string | null;
}

export function StepPills({
  currentStage,
  currentSubstage,
  qualityEnabled,
  methodologyId,
}: StepPillsProps) {
  const stages = steps(methodologyId, currentStage, currentSubstage, qualityEnabled);
  const currentIndex = stages.findIndex((step) => step.current);
  const substage = substageLabel(currentSubstage);

  return (
    <nav aria-label="Workflow stages" data-testid="stage-rail">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="step-pills">
        {stages.map((step, index) => {
          const isCurrent = step.current;
          const isDone = currentIndex >= 0 && index < currentIndex;

          return (
            <li key={`${step.stage}-${step.label}`} className="flex items-center gap-2">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                data-stage={step.stage}
                data-step={index + 1}
                data-state={isCurrent ? 'current' : isDone ? 'done' : 'upcoming'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1.5',
                  isCurrent && 'border-primary bg-primary text-primary-foreground font-medium',
                  isDone && 'border-border-subtle text-foreground-muted',
                  !isCurrent && !isDone && 'border-border-subtle text-foreground-muted opacity-60',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none',
                    isCurrent ? 'bg-primary-foreground/15' : 'border-border-subtle border',
                  )}
                >
                  {index + 1}
                </span>
                {/*
                  The pill above already carries `data-stage`, and this repeats it so that a walk
                  reading the position off `stage-current` — the id every suite already selects —
                  reads the canonical stage id rather than the label's English (task 143).
                */}
                <span data-stage={step.stage} data-testid={isCurrent ? 'stage-current' : undefined}>
                  {step.label}
                </span>
                {/*
                  The word, not the token (task 133; row `1.4-5`). `substageLabel` was computed one
                  line above and used only as a condition, so the pill printed the machine's
                  `collect` while the chip two blocks below printed «Collecting» — one position,
                  two spellings, and the raw one in the header.
                */}
                {isCurrent && substage !== null && (
                  <span
                    className="opacity-80"
                    data-testid="stage-substage"
                    data-substage={currentSubstage ?? ''}
                  >
                    · {substage}
                  </span>
                )}
              </span>
              {index < stages.length - 1 && (
                <span aria-hidden className="text-foreground-muted opacity-40">
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
