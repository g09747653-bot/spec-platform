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
}

const WAITING_FOR: Record<string, string> = {
  ask: 'the next round of questions',
  proceed: 'the gate to answer',
  fallback: 'your answers to be recorded',
};

export function StageActions({
  sessionId,
  actions,
  deadlineMs,
}: {
  sessionId: string;
  actions: StageActionsModel;
  deadlineMs: number;
}) {
  const { state, elapsedSeconds, send, abandon } = useSessionRequest(deadlineMs);
  const [fallbackText, setFallbackText] = useState<Record<string, string>>({});

  const busy = state.running;
  const notice = state.notice;
  const asking = actions.askingStage !== null;
  const showFallback = asking && !actions.canAskMore && actions.unmetNeeds.length > 0;

  return (
    <div
      className="border-border-subtle bg-surface flex w-full max-w-[46rem] flex-col gap-3 rounded-xl border p-4"
      data-testid="interview-panel"
    >
      {asking && (
        <p className="text-ink-muted text-xs">
          {actions.answeredRounds} of {actions.roundBudget} question rounds answered
          {actions.askingStage === 'interview' &&
            (actions.summaryPersisted ? ' · summary saved' : ' · no summary yet')}
        </p>
      )}

      {notice !== null && (
        <p role="alert" data-testid="interview-notice" className="text-sm text-amber-700">
          {notice}
        </p>
      )}

      {/*
        Round 5, Р-3 item 4. The budget running out used to be told by *absence*: the ask button
        vanished and nothing replaced it, so the only account the user got of why questions had
        stopped was a rejection reading "That step is not available yet".
      */}
      {asking && !actions.canAskMore && (
        <p className="text-ink-muted text-sm" data-testid="rounds-exhausted">
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
        {asking && actions.canAskMore && (
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
        {actions.target !== null && (
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

        {actions.target !== null && !actions.target.ready && actions.target.unmet.length > 0 && (
          <span className="text-ink-muted text-xs" data-testid="gate-unmet">
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
