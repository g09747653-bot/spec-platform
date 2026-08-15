'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input, Label, Textarea } from '../ui/field';

import type { QuestionRoundModel, RoundQuestionModel } from './question-round';
import { useSessionRequest } from './useSessionRequest';
import { WaitingOn } from './waiting-on';

/**
 * The MCQ card (task 34; FR-005 AC-1..AC-6).
 *
 * Single-select renders radios, multi-select renders checkboxes, and every question renders
 * **exactly one** free-text "other" entry, driven by the validated `allowOther` flag — the card
 * never invents a second escape hatch and never drops the one that must exist (AC-3).
 *
 * The card is a decision surface, not a trigger: submitting persists answers and nothing else
 * happens in the same interaction (AC-4). The user may instead answer the card in free text —
 * the reply path of AC-6 — through the secondary control at the bottom.
 */
interface McqCardProps {
  sessionId: string;
  round: QuestionRoundModel;
  /**
   * How long to keep believing the server is still working (round 5, Р-3).
   *
   * Submitting a card is not a stage transition, but it has the same shape and the same teeth:
   * during the grounding interview the handler refreshes the session summary with a live model call
   * *after* persisting the answers, so a submitted card can sit there for the length of a provider
   * chain. The customer's own gate session shows a ten-and-a-half minute gap at exactly that point.
   */
  deadlineMs: number;
}

/** What each action is waiting for, in the words the status line reads out. */
const WAITING_FOR: Record<string, string> = {
  submit: 'your answers to be recorded',
  reply: 'your reply to be read',
};

interface QuestionState {
  selected: string[];
  other: string;
}

const emptyState = (questions: readonly RoundQuestionModel[]): Record<string, QuestionState> =>
  Object.fromEntries(questions.map((question) => [question.id, { selected: [], other: '' }]));

export function McqCard({ sessionId, round, deadlineMs }: McqCardProps) {
  const [state, setState] = useState<Record<string, QuestionState>>(() =>
    emptyState(round.questions),
  );
  const [replyMode, setReplyMode] = useState(false);
  const [reply, setReply] = useState('');
  const { state: request, elapsedSeconds, send, abandon } = useSessionRequest(deadlineMs);

  const busy = request.running;
  const error = request.notice;

  const questionState = (id: string): QuestionState => state[id] ?? { selected: [], other: '' };

  function toggleOption(question: RoundQuestionModel, optionId: string) {
    setState((previous) => {
      const current = previous[question.id] ?? { selected: [], other: '' };
      const selected =
        question.type === 'single'
          ? [optionId]
          : current.selected.includes(optionId)
            ? current.selected.filter((id) => id !== optionId)
            : [...current.selected, optionId];

      return { ...previous, [question.id]: { ...current, selected } };
    });
  }

  const complete = round.questions.every((question) => {
    const current = questionState(question.id);
    return current.selected.length > 0 || current.other.trim() !== '';
  });

  async function post(body: unknown, action: 'submit' | 'reply') {
    await send(action, `/api/sessions/${sessionId}/answers`, body);
  }

  return (
    <Card data-testid="mcq-card">
      <CardHeader>
        <CardTitle>
          A few questions{' '}
          <span className="text-ink-muted text-xs font-normal">round {round.roundNumber}</span>
        </CardTitle>
        <CardDescription>
          Pick what fits — or answer in your own words. Nothing generates while this card waits for
          you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {round.questions.map((question) => {
          const current = questionState(question.id);

          return (
            <fieldset
              key={question.id}
              className="flex flex-col gap-2"
              data-testid={`mcq-question-${question.id}`}
            >
              <legend className="text-sm font-medium">{question.text}</legend>

              <div className="flex flex-col gap-1.5">
                {question.options.map((option) => (
                  <label
                    key={option.id}
                    className="border-border-subtle hover:bg-canvas flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type={question.type === 'single' ? 'radio' : 'checkbox'}
                      name={`${round.roundId}-${question.id}`}
                      value={option.id}
                      checked={current.selected.includes(option.id)}
                      onChange={() => {
                        toggleOption(question, option.id);
                      }}
                      data-testid={`mcq-option-${question.id}-${option.id}`}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{option.label}</span>
                      {option.description !== undefined && (
                        <span className="text-ink-muted block text-xs">{option.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              {question.allowOther && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`other-${round.roundId}-${question.id}`} className="text-xs">
                    Other — your own answer
                  </Label>
                  <Input
                    id={`other-${round.roundId}-${question.id}`}
                    data-testid={`mcq-other-${question.id}`}
                    value={current.other}
                    onChange={(event) => {
                      const other = event.target.value;
                      setState((previous) => ({
                        ...previous,
                        [question.id]: { ...questionState(question.id), other },
                      }));
                    }}
                    placeholder="Type an answer not listed above"
                  />
                </div>
              )}
            </fieldset>
          );
        })}

        {error !== null && (
          <p role="alert" data-testid="mcq-error" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <Button
            data-testid="mcq-submit"
            disabled={busy === 'submit' || !complete}
            onClick={() => {
              void post(
                {
                  roundId: round.roundId,
                  answers: round.questions.map((question) => {
                    const current = questionState(question.id);
                    const other = current.other.trim();

                    return {
                      questionId: question.id,
                      selectedOptionIds: current.selected,
                      ...(other === '' ? {} : { freeText: other }),
                    };
                  }),
                },
                'submit',
              );
            }}
            className="self-start"
          >
            {busy === 'submit' ? 'Submitting…' : 'Submit answers'}
          </Button>

          {!replyMode ? (
            <button
              type="button"
              data-testid="mcq-reply-toggle"
              className="text-ink-muted self-start text-xs underline underline-offset-2"
              onClick={() => {
                setReplyMode(true);
              }}
            >
              Answer in your own words instead
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`reply-${round.roundId}`}>Your answer, in free text</Label>
              <Textarea
                id={`reply-${round.roundId}`}
                data-testid="mcq-reply-text"
                value={reply}
                onChange={(event) => {
                  setReply(event.target.value);
                }}
                placeholder="Describe it the way you would to a colleague."
              />
              <Button
                variant="secondary"
                data-testid="mcq-reply-send"
                disabled={busy === 'reply' || reply.trim() === ''}
                onClick={() => {
                  void post({ roundId: round.roundId, reply: reply.trim() }, 'reply');
                }}
                className="self-start"
              >
                {busy === 'reply' ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          )}

          {/*
            Round 5, Р-3. The card replaces the whole interview panel while it is pending, so a
            submission that hangs takes every other control with it: before this, the only things
            left on screen were the reply toggle — which would have started a *second* long request
            — and the export button. Stopping is the honest option, and it is now on screen.
          */}
          {busy !== null && (
            <WaitingOn
              what={WAITING_FOR[busy] ?? 'the server'}
              elapsedSeconds={elapsedSeconds}
              onStop={abandon}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
