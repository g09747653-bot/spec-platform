'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { Input, Label } from '../ui/field';
import { WaitingOn } from '../session/waiting-on';
import { useSessionRequest } from '../session/useSessionRequest';

/**
 * What moves the session on, at the tail of the conversation (task 105).
 *
 * The interview panel this replaces was a *place*: a card that existed at some positions and not
 * others, with the questions inside it. In a feed the questions are messages, so what is left is the
 * small set of things that are true of the position rather than of any one message — ask another
 * round, answer what is still open directly, walk through the door.
 *
 * Round 5, Р-3 holds unchanged: every request goes through `useSessionRequest`, each control waits
 * for its *own* request (Д-4), and while anything is in flight there is a live way out beside it.
 */
export interface TransitionTargetModel {
  label: string;
  toStage: string;
  toSubstage: string | null;
  /** Whether the gate held when the page rendered — controls presentation, never enforcement. */
  ready: boolean;
  /** What the gate said is missing, for honest UI copy. */
  unmet: readonly string[];
}

export interface StageActionsModel {
  /** The stage that may ask questions here, or `null` where the position asks none. */
  askingStage: string | null;
  canAskMore: boolean;
  answeredRounds: number;
  roundBudget: number;
  unmetNeeds: readonly string[];
  summaryPersisted: boolean;
  target: TransitionTargetModel | null;
  /**
   * The other doors out of this position, when the graph forks (task 117).
   *
   * A methodology whose next stage is optional offers two: on to it, or straight to the terminal.
   * `target` is the one the primary button takes; these are the rest, and they exist so that
   * "optional" is a choice the user can make rather than a property only the table knows about (P2).
   */
  alternates: readonly TransitionTargetModel[];
}

const WAITING_FOR: Record<string, string> = {
  ask: 'the next round of questions',
  proceed: 'the gate to answer',
  fallback: 'your answers to be recorded',
};

export function StageActions({
  sessionId,
  actions,
  awaitingRound,
  deadlineMs,
}: {
  sessionId: string;
  actions: StageActionsModel;
  /**
   * Whether a question card is waiting for the user (the feed's `pending-round` tail).
   *
   * **Nothing else is offered while it is.** The panel this replaced could not get this wrong: a
   * pending round *was* the panel, so there was no Ask and no door beside it. In a feed the card and
   * this bar are on screen together, and offering "Ask questions" over an unanswered round invites a
   * click whose only outcome is the same round handed back (FR-017 AC-3) — which the M7п gate walk
   * duly took, and then spent a stage believing it had been given a new one.
   */
  awaitingRound: boolean;
  deadlineMs: number;
}) {
  const { state, elapsedSeconds, send, abandon } = useSessionRequest(deadlineMs);
  const [fallbackText, setFallbackText] = useState<Record<string, string>>({});

  const busy = state.running;
  const notice = state.notice;
  const asking = actions.askingStage !== null;
  const showFallback =
    asking && !awaitingRound && !actions.canAskMore && actions.unmetNeeds.length > 0;

  return (
    <div
      className="border-border-subtle bg-surface flex w-full flex-col gap-3 rounded-xl border p-4"
      data-testid="interview-panel"
    >
      {awaitingRound && (
        <p className="text-foreground-muted text-sm" data-testid="awaiting-round">
          The questions above are waiting for your answers — nothing else moves until they are
          submitted.
        </p>
      )}

      {/*
        The budget the **gate** enforces, said out loud (task 132; checklist row `1.4-7`).

        `roundBudget` now arrives from `roundBudgetFor` rather than from the environment default, so
        this line and the refusal behind it finally quote one number. "N left" is the half a person
        actually acts on — how many more questions there are to sit through — and it is printed as
        its own element so a walk can read the methodology's budget rather than infer it from prose.
      */}
      {asking && (
        <p className="text-foreground-muted text-xs">
          {actions.answeredRounds} of {actions.roundBudget} question rounds answered
          <span data-testid="round-budget-remaining">
            {` · ${String(Math.max(actions.roundBudget - actions.answeredRounds, 0))} left`}
          </span>
          {actions.askingStage === 'interview' &&
            (actions.summaryPersisted ? ' · summary saved' : ' · no summary yet')}
        </p>
      )}

      {notice !== null && (
        <p role="alert" data-testid="interview-notice" className="text-sm text-warning-ink">
          {notice}
        </p>
      )}

      {/*
        Round 5, Р-3 item 4. The budget running out used to be told by *absence*: the ask button
        vanished and nothing replaced it, so the only account the user got of why questions had
        stopped was a rejection reading "That step is not available yet".
      */}
      {asking && !awaitingRound && !actions.canAskMore && (
        <p className="text-foreground-muted text-sm" data-testid="rounds-exhausted">
          {`All ${String(actions.roundBudget)} question rounds for this stage have been used, so nothing further will be asked here. `}
          {actions.unmetNeeds.length > 0
            ? 'Answer what is still open below, then move on to the next step.'
            : 'Everything this stage needed to ask has been answered — move on to the next step.'}
        </p>
      )}

      {showFallback && (
        <div className="flex flex-col gap-3" data-testid="fallback-panel">
          <p className="text-sm">
            The question budget for this stage is used up, and this is still open — answer directly:
          </p>
          {actions.unmetNeeds.map((need) => (
            <div key={need} className="flex flex-col gap-1">
              <Label htmlFor={`fallback-${need}`} className="text-xs">
                {need}
              </Label>
              <Input
                id={`fallback-${need}`}
                data-testid={`fallback-input-${need}`}
                value={fallbackText[need] ?? ''}
                onChange={(event) => {
                  const text = event.target.value;
                  setFallbackText((previous) => ({ ...previous, [need]: text }));
                }}
                placeholder="Answer in a sentence"
              />
            </div>
          ))}
          <Button
            variant="secondary"
            data-testid="fallback-submit"
            disabled={
              busy === 'fallback' ||
              !actions.unmetNeeds.some((need) => (fallbackText[need] ?? '').trim() !== '')
            }
            onClick={() => {
              const items = actions.unmetNeeds
                .map((need) => ({ name: need, text: (fallbackText[need] ?? '').trim() }))
                .filter((item) => item.text !== '');

              void send('fallback', `/api/sessions/${sessionId}/answers`, { fallback: items });
            }}
            className="self-start"
          >
            {busy === 'fallback' ? 'Recording…' : 'Record answers'}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {asking && !awaitingRound && actions.canAskMore && (
          <Button
            data-testid="ask-round"
            disabled={busy === 'ask'}
            onClick={() => {
              void send('ask', `/api/sessions/${sessionId}/rounds`);
            }}
          >
            {busy === 'ask' ? 'Preparing questions…' : 'Ask questions'}
          </Button>
        )}

        {/*
          The door is **offered even when the gate does not hold**, with the reason beside it, and it
          is disabled only while its own request is in flight (Д-4).

          The two surfaces this replaces disagreed about that: the interview panel left it enabled,
          the spec card disabled it until `ready`. The interview panel was right, and P1 is why —
          the gate is the server's answer, not the page's, and a page that refuses to *ask* has
          quietly become a second gate whose verdict nobody checks. Round 5 spent itself on making
          refusals legible; a control that cannot be clicked produces no refusal to read.
        */}
        {!awaitingRound &&
          actions.alternates.map((alternate) => (
            <Button
              key={`${alternate.toStage}:${alternate.toSubstage ?? ''}`}
              variant="secondary"
              data-testid={`proceed-alternate-${alternate.toStage}`}
              disabled={busy === 'proceed'}
              onClick={() => {
                void send('proceed', `/api/sessions/${sessionId}/transition`, {
                  toStage: alternate.toStage,
                  ...(alternate.toSubstage === null ? {} : { toSubstage: alternate.toSubstage }),
                });
              }}
            >
              {alternate.label}
            </Button>
          ))}

        {actions.target !== null && !awaitingRound && (
          <Button
            variant={actions.target.ready ? 'primary' : 'secondary'}
            data-testid="proceed"
            disabled={busy === 'proceed'}
            onClick={() => {
              const target = actions.target;
              if (target === null) return;

              void send('proceed', `/api/sessions/${sessionId}/transition`, {
                toStage: target.toStage,
                ...(target.toSubstage === null ? {} : { toSubstage: target.toSubstage }),
              });
            }}
          >
            {busy === 'proceed' ? 'Checking the gate…' : actions.target.label}
          </Button>
        )}

        {actions.target !== null &&
          !awaitingRound &&
          !actions.target.ready &&
          actions.target.unmet.length > 0 && (
            <span className="text-foreground-muted text-xs" data-testid="gate-unmet">
              still needed: {actions.target.unmet.join(', ')}
            </span>
          )}
      </div>

      {/*
        The way out, offered for as long as anything this bar started is running (Р-3 item 2). It is
        rendered outside the row above so it cannot be mistaken for another action: it is not another
        thing to do, it is permission to stop doing this one.
      */}
      {busy !== null && (
        <WaitingOn
          what={WAITING_FOR[busy] ?? 'the server'}
          elapsedSeconds={elapsedSeconds}
          onStop={abandon}
        />
      )}
    </div>
  );
}
