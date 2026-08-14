'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input, Label } from '../ui/field';

import { McqCard } from './mcq-card';
import type { QuestionRoundModel } from './question-round';

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
}

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
}: InterviewPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'ask' | 'proceed' | 'fallback' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<Record<string, string>>({});

  async function post(url: string, body: unknown, action: 'ask' | 'proceed' | 'fallback') {
    setBusy(action);
    setNotice(null);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof payload.error === 'object' &&
          payload.error !== null &&
          'message' in payload.error &&
          typeof payload.error.message === 'string'
            ? payload.error.message
            : 'That did not go through. Please try again.';
        setNotice(message);
      }

      router.refresh();
    } catch {
      setNotice('That did not go through. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (pendingRound !== null) {
    return <McqCard sessionId={sessionId} round={pendingRound} />;
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

                void post(`/api/sessions/${sessionId}/answers`, { fallback: items }, 'fallback');
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
                void post(`/api/sessions/${sessionId}/rounds`, undefined, 'ask');
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
                void post(
                  `/api/sessions/${sessionId}/transition`,
                  {
                    toStage: target.toStage,
                    ...(target.toSubstage === null ? {} : { toSubstage: target.toSubstage }),
                  },
                  'proceed',
                );
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
      </CardContent>
    </Card>
  );
}
