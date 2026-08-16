'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { Input, Label, Textarea } from '../ui/field';
import { WaitingOn } from '../session/waiting-on';
import { useSessionRequest } from '../session/useSessionRequest';

import { BlockCaption } from './bubbles';
import { FeedItem } from './feed-item';
import type { FeedAnswer, FeedQuestion, RoundBlock as RoundBlockModel } from './model';

/**
 * A question round, inside the conversation (tasks 105, 106; FR-005 AC-1..AC-6; Эталон §1.1).
 *
 * One component for both states, because they are one block: the form the user answered stays where
 * it was asked, disabled, with the choices fixed — that is what a chat log *is*. Rendering an
 * answered round as a summary elsewhere is how the M6 surface ended up with a question card in one
 * place and an answer history in another, describing the same event twice.
 *
 * The `mcq-*` test ids are carried from the card this replaces and are deliberately **only** on the
 * pending form: a suite asserting `mcq-card` has count zero after submission is asserting that the
 * round is no longer being asked, and that has to keep meaning what it meant.
 */
interface RoundBlockProps {
  sessionId: string;
  block: RoundBlockModel;
  /** Whether this round is the one the session is waiting on — the feed's tail. */
  pending: boolean;
  deadlineMs: number;
  /** Opening words for the free-text box — the Edit chat's Describe prefill (task 118). */
  freeTextPrefill?: string | null;
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

/**
 * The starting state of the form, with the free-text box optionally pre-filled (task 118).
 *
 * The prefill exists for exactly one card — the Describe step of an Edit chat, whose sentence the
 * reference product opens for the user to finish. It is the session's stored `initial_prompt`,
 * passed in rather than kept on the round, so the sentence lives in one row and is shown where it
 * is finished.
 */
const emptyState = (
  questions: readonly FeedQuestion[],
  prefill: string | null,
): Record<string, QuestionState> =>
  Object.fromEntries(
    questions.map((question) => [question.id, { selected: [], other: prefill ?? '' }]),
  );

function RoundHeading({ block }: { block: RoundBlockModel }) {
  const count = block.questions.length;

  return (
    <p className="text-foreground-muted text-label uppercase" data-testid="round-heading">
      Round {block.roundNumber} — {count} {count === 1 ? 'question' : 'questions'}
    </p>
  );
}

function SelectionHint({ question }: { question: FeedQuestion }) {
  return (
    <span className="text-foreground-muted text-xs" data-testid={`mcq-hint-${question.id}`}>
      {question.type === 'single' ? 'Select one' : 'Select all that apply'}
    </span>
  );
}

function OptionBody({ option }: { option: FeedQuestion['options'][number] }) {
  return (
    <span>
      <span className="font-medium">{option.label}</span>
      {option.recommended === true && (
        <span
          className="text-primary-strong ml-1.5 text-xs"
          data-testid={`mcq-recommended-${option.id}`}
        >
          (Recommended)
        </span>
      )}
      {option.description !== undefined && (
        <span className="text-foreground-muted block text-xs">{option.description}</span>
      )}
    </span>
  );
}

/**
 * The answered round: the same form, fixed.
 *
 * Every control is `disabled`, so nothing here can move the session and the liveness count is not
 * inflated by a form nobody can submit — the distinction the round-2 invariant rests on.
 */
function AnsweredRound({ block }: { block: RoundBlockModel }) {
  const byQuestion = new Map<string, FeedAnswer>(
    block.answers
      .filter((answer): answer is FeedAnswer & { questionId: string } => answer.questionId !== null)
      .map((answer) => [answer.questionId, answer]),
  );

  /* Answers that belong to no question of this round: a free-text reply to the card as a whole
     (FR-005 AC-6), or a direct answer to a named need after the budget ran out (AC-10). */
  const loose = block.answers.filter(
    (answer) => answer.questionId === null || !byQuestion.has(answer.questionId),
  );

  return (
    <div className="flex flex-col gap-4" data-testid="round-answered">
      {block.questions.map((question) => {
        const answer = byQuestion.get(question.id);
        const selected = new Set(answer?.selectedOptionIds ?? []);

        return (
          <fieldset key={question.id} className="flex flex-col gap-1.5" disabled>
            <legend className="text-sm font-medium">{question.text}</legend>
            <div className="flex flex-col gap-1">
              {question.options
                .filter((option) => selected.has(option.id))
                .map((option) => (
                  <span
                    key={option.id}
                    className="border-border-subtle bg-background rounded-md border px-3 py-1.5 text-sm"
                    data-testid="answered-value"
                  >
                    {option.label}
                  </span>
                ))}
              {answer?.freeText !== undefined && answer.freeText !== null && (
                <span
                  className="border-border-subtle bg-background rounded-md border px-3 py-1.5 text-sm"
                  data-testid="answered-value"
                >
                  {answer.freeText}
                </span>
              )}
              {selected.size === 0 && (answer?.freeText ?? null) === null && (
                <span className="text-foreground-muted text-sm" data-testid="answered-value">
                  —
                </span>
              )}
            </div>
          </fieldset>
        );
      })}

      {loose.map((answer, index) => (
        <div key={`${answer.label}-${String(index)}`} className="flex flex-col">
          <span className="text-sm font-medium">{answer.label}</span>
          <span className="text-foreground-muted text-sm" data-testid="answered-value">
            {answer.freeText ?? answer.selectedOptionIds.join(', ')}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RoundBlock({
  sessionId,
  block,
  pending,
  deadlineMs,
  freeTextPrefill = null,
}: RoundBlockProps) {
  const [state, setState] = useState<Record<string, QuestionState>>(() =>
    emptyState(block.questions, freeTextPrefill),
  );
  const [replyMode, setReplyMode] = useState(false);
  const [reply, setReply] = useState('');
  const { state: request, elapsedSeconds, send, abandon } = useSessionRequest(deadlineMs);

  const busy = request.running;
  const error = request.notice;

  const questionState = (id: string): QuestionState => state[id] ?? { selected: [], other: '' };

  function toggleOption(question: FeedQuestion, optionId: string) {
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

  const complete = block.questions.every((question) => {
    const current = questionState(question.id);
    return current.selected.length > 0 || current.other.trim() !== '';
  });

  async function post(body: unknown, action: 'submit' | 'reply') {
    await send(action, `/api/sessions/${sessionId}/answers`, body);
  }

  const body =
    block.answered || !pending ? (
      <AnsweredRound block={block} />
    ) : (
      <div className="flex flex-col gap-5" data-testid="mcq-card">
        {block.questions.map((question) => {
          const current = questionState(question.id);

          return (
            <fieldset
              key={question.id}
              className="flex flex-col gap-2"
              data-testid={`mcq-question-${question.id}`}
            >
              <legend className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
                <span>
                  {question.text}
                  {question.required && (
                    <span
                      aria-label="required"
                      className="ml-1 text-danger-ink"
                      data-testid={`mcq-required-${question.id}`}
                    >
                      *
                    </span>
                  )}
                </span>
                <SelectionHint question={question} />
              </legend>

              <div className="flex flex-col gap-1.5">
                {question.options.map((option) => (
                  <label
                    key={option.id}
                    className="border-border-subtle hover:bg-background flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type={question.type === 'single' ? 'radio' : 'checkbox'}
                      name={`${block.roundId}-${question.id}`}
                      value={option.id}
                      checked={current.selected.includes(option.id)}
                      onChange={() => {
                        toggleOption(question, option.id);
                      }}
                      data-testid={`mcq-option-${question.id}-${option.id}`}
                      className="mt-0.5"
                    />
                    <OptionBody option={option} />
                  </label>
                ))}
              </div>

              {question.allowOther && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`other-${block.roundId}-${question.id}`} className="text-xs">
                    Other — your own answer
                  </Label>
                  <Input
                    id={`other-${block.roundId}-${question.id}`}
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
          <p role="alert" data-testid="mcq-error" className="text-sm text-danger-ink">
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
                  roundId: block.roundId,
                  answers: block.questions.map((question) => {
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
            {busy === 'submit' ? 'Submitting…' : 'Submit Answers'}
          </Button>

          {!replyMode ? (
            <button
              type="button"
              data-testid="mcq-reply-toggle"
              className="text-foreground-muted self-start text-xs underline underline-offset-2"
              onClick={() => {
                setReplyMode(true);
              }}
            >
              Answer in your own words instead
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`reply-${block.roundId}`}>Your answer, in free text</Label>
              <Textarea
                id={`reply-${block.roundId}`}
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
                  void post({ roundId: block.roundId, reply: reply.trim() }, 'reply');
                }}
                className="self-start"
              >
                {busy === 'reply' ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          )}

          {/*
            Round 5, Р-3. The card is the whole of what is on screen while it waits, so a submission
            that hangs takes every other control with it unless the way out is here.
          */}
          {busy !== null && (
            <WaitingOn
              what={WAITING_FOR[busy] ?? 'the server'}
              elapsedSeconds={elapsedSeconds}
              onStop={abandon}
            />
          )}
        </div>
      </div>
    );

  return (
    <FeedItem block={block}>
      <div className="border-border-subtle bg-surface flex w-full max-w-[46rem] flex-col gap-3 rounded-xl border p-4">
        <BlockCaption stage={block.stage} />
        <RoundHeading block={block} />
        {body}
      </div>
    </FeedItem>
  );
}
