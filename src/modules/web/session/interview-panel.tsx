'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input, Label } from '../ui/field';

import { McqCard } from './mcq-card';
import type { QuestionRoundModel } from './question-round';
import { WaitingOn } from './waiting-on';
import { useSessionRequest } from './useSessionRequest';

/**
 * The interview surface of a session (tasks 34/37/38; FR-005; FR-006).
 *
 * Everything here renders from persisted state handed down by the server page, so a reload shows
 * the same card, the same fallback, the same locked or open door (FR-017). The panel does three
 * things and no more:
 *
 * - a pending round renders as the MCQ card;
 * - no pending round renders "ask" (while the budget lasts) — and once the budget is exhausted
 *   with needs still open, the named-needs fallback (FR-005 AC-10): one free-text entry per
 *   unmet need, recorded directly;
 * - the door to the next step: a transition request the server evaluates through the real gate
 *   (task 38) — the button never decides anything, it only asks.
 *
 * Round 5, Р-3: every request this panel starts runs through `useSessionRequest`, so while one is
 * in flight the panel offers `stop-waiting` beside the disabled control and an elapsed reading
 * next to it. The door is the reason: entering `review` runs the review agent inside the transition
 * request, so "the gate is being checked" can honestly last minutes — and before this, those
 * minutes looked exactly like a page that had died.
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

export interface InterviewPanelProps {
  sessionId: string;
  stage: string;
  pendingRound: QuestionRoundModel | null;
  canAskMore: boolean;
  answeredRounds: number;
  roundBudget: number;
  unmetNeeds: readonly string[];
  summaryPersisted: boolean;
  target: TransitionTargetModel | null;
  /**
   * How long to keep believing the server is still working, derived from its own provider chain
   * (round 5, Р-3). Past it the request is abandoned and said so, rather than held forever.
   */
  deadlineMs: number;
}

/** What each action is waiting for, in the words the status line reads out. */
const WAITING_FOR: Record<string, string> = {
  ask: 'the next round of questions',
  proceed: 'the gate to answer',
  fallback: 'your answers to be recorded',
};

export function InterviewPanel({
  sessionId,
  stage,
  pendingRound,
  canAskMore,
  answeredRounds,
  roundBudget,
  unmetNeeds,
  summaryPersisted,
  target,
  deadlineMs,
}: InterviewPanelProps) {
  const { state, elapsedSeconds, send, abandon } = useSessionRequest(deadlineMs);
  const [fallbackText, setFallbackText] = useState<Record<string, string>>({});

  const busy = state.running;
  const notice = state.notice;

  if (pendingRound !== null) {
    return <McqCard sessionId={sessionId} round={pendingRound} deadlineMs={deadlineMs} />;
  }

  const showFallback = !canAskMore && unmetNeeds.length > 0;

  return (
    <Card data-testid="interview-panel">
      <CardHeader>
        <CardTitle>Interview — {stage}</CardTitle>
        <CardDescription>
          {answeredRounds} of {roundBudget} question rounds answered
          {stage === 'interview' && (summaryPersisted ? ' · summary saved' : ' · no summary yet')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice !== null && (
          <p role="alert" data-testid="interview-notice" className="text-sm text-amber-700">
            {notice}
          </p>
        )}

        {/*
          Round 5, Р-3 item 4. The budget running out used to be told by *absence*: the ask button
          vanished, and — with every need satisfied — nothing replaced it, so the only account the
          user got of why questions had stopped was a rejection reading "That step is not available
          yet". The state is named where the state is, with what is exhausted and what to do next.
        */}
        {!canAskMore && (
          <p className="text-ink-muted text-sm" data-testid="rounds-exhausted">
            {`All ${String(roundBudget)} question rounds for this stage have been used, so nothing further will be asked here. `}
            {unmetNeeds.length > 0
              ? 'Answer what is still open below, then move on to the next step.'
              : 'Everything this stage needed to ask has been answered — move on to the next step.'}
          </p>
        )}

        {showFallback && (
          <div className="flex flex-col gap-3" data-testid="fallback-panel">
            <p className="text-sm">
              The question budget for this stage is used up, and this is still open — answer
              directly:
            </p>
            {unmetNeeds.map((need) => (
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
                !unmetNeeds.some((need) => (fallbackText[need] ?? '').trim() !== '')
              }
              onClick={() => {
                const items = unmetNeeds
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
          {/*
            Round 2, Д-4: each control waits for **its own** request, not for any request.

            `disabled={busy !== null}` meant a slow "proceed" also greyed out "Ask questions", and a
            slow ask greyed out the door — two independent actions sharing one flag, so a stall in
            either looked like the page had seized. Button state is a function of the workflow
            (`canAskMore`, `target`) plus the one request that button started.
          */}
          {canAskMore && (
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

          {target !== null && (
            <Button
              variant={target.ready ? 'primary' : 'secondary'}
              data-testid="proceed"
              disabled={busy === 'proceed'}
              onClick={() => {
                void send('proceed', `/api/sessions/${sessionId}/transition`, {
                  toStage: target.toStage,
                  ...(target.toSubstage === null ? {} : { toSubstage: target.toSubstage }),
                });
              }}
            >
              {busy === 'proceed' ? 'Checking the gate…' : target.label}
            </Button>
          )}

          {target !== null && !target.ready && target.unmet.length > 0 && (
            <span className="text-ink-muted text-xs" data-testid="gate-unmet">
              still needed: {target.unmet.join(', ')}
            </span>
          )}
        </div>

        {/*
          The way out, offered for as long as anything this panel started is running (Р-3 item 2).
          It is rendered outside the row above so it cannot be mistaken for a fourth action: it is
          not another thing to do, it is permission to stop doing this one.
        */}
        {busy !== null && (
          <WaitingOn
            what={WAITING_FOR[busy] ?? 'the server'}
            elapsedSeconds={elapsedSeconds}
            onStop={abandon}
          />
        )}
      </CardContent>
    </Card>
  );
}
