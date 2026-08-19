'use client';

import { useState } from 'react';

import { type PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/field';
import { WaitingOn } from '../session/waiting-on';
import { useSessionRequest } from '../session/useSessionRequest';

import type { TailPrimary } from './tail-primary';

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
  /**
   * The machine's reason/condition identifiers behind the words in `unmet`, so a test can read the
   * gate's verdict without reading its prose.
   */
  unmetCodes: readonly string[];
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

/**
 * What the wait block is told the bar is waiting for, as keys (task 143).
 *
 * `WaitingOn` takes its words as a prop because both this bar and the document card fill it, so the
 * choice of phrase belongs here. English frames them as infinitives after «Waiting for»; Russian
 * frames them after «Ожидание:» and therefore needs the nominative — which is a fact about the two
 * sentences, kept in the dictionary rather than in this table.
 */
const WAITING_FOR: Record<string, PhraseKey> = {
  ask: 'feed.actions.waiting-ask',
  proceed: 'feed.actions.waiting-proceed',
  fallback: 'feed.actions.waiting-fallback',
};

export function StageActions({
  sessionId,
  actions,
  awaitingRound,
  deadlineMs,
  primary = null,
}: {
  sessionId: string;
  actions: StageActionsModel;
  /** Which control the tail says is the loud one (task 142); see `tail-primary.ts`. */
  primary?: TailPrimary;
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
  const { state, elapsedSeconds, waiting, send, abandon } = useSessionRequest(deadlineMs);
  const [fallbackText, setFallbackText] = useState<Record<string, string>>({});
  const t = useT();

  const busy = state.running;
  const notice = state.notice;
  const asking = actions.askingStage !== null;
  /*
   * Named rather than compared inside the JSX: a summary is a thing only the interview keeps, and
   * saying so once is both clearer and what keeps the stage id out of a `{…}` where the copy rule
   * reads it as a word (task 143).
   */
  const askingInterview = actions.askingStage === 'interview';
  const showFallback =
    asking && !awaitingRound && !actions.canAskMore && actions.unmetNeeds.length > 0;

  return (
    <div
      className="border-border-subtle bg-surface flex w-full flex-col gap-3 rounded-xl border p-4"
      data-testid="interview-panel"
      data-answered-rounds={String(actions.answeredRounds)}
      data-round-budget={String(actions.roundBudget)}
      /*
        Absent, not `none`, outside the interview: a summary is a thing only that stage keeps, so a
        walk that finds the attribute at all learns where it is standing as well as what it has.
      */
      data-summary={askingInterview ? (actions.summaryPersisted ? 'saved' : 'none') : undefined}
    >
      {awaitingRound && (
        <p className="text-foreground-muted text-sm" data-testid="awaiting-round">
          {t('feed.actions.awaiting-round')}
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
          {t('feed.actions.rounds-answered', {
            answered: actions.answeredRounds,
            budget: actions.roundBudget,
          })}
          <span data-testid="round-budget-remaining">
            {t('feed.actions.rounds-left', {
              left: Math.max(actions.roundBudget - actions.answeredRounds, 0),
            })}
          </span>
          {askingInterview &&
            (actions.summaryPersisted
              ? t('feed.actions.summary-saved')
              : t('feed.actions.summary-none'))}
        </p>
      )}

      {notice !== null && (
        <p
          role="alert"
          data-testid="interview-notice"
          data-notice-kind={state.noticeKind ?? ''}
          data-reason={state.noticeReason ?? ''}
          className="text-sm text-warning-ink"
        >
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
          {t('feed.actions.rounds-exhausted', { count: actions.roundBudget })}
          {actions.unmetNeeds.length > 0
            ? t('feed.actions.rounds-exhausted-open')
            : t('feed.actions.rounds-exhausted-done')}
        </p>
      )}

      {showFallback && (
        <div className="flex flex-col gap-3" data-testid="fallback-panel">
          <p className="text-sm">{t('feed.actions.fallback-lead')}</p>
          {actions.unmetNeeds.map((need) => (
            <div key={need} className="flex flex-col gap-1">
              {/*
                The need's own name is the agent's word and stays exactly as it was written; what is
                new is the frame around it (task 143). A bare `deployment_target` above an input was
                readable as a label only to whoever had read the prompt that produced it, and in
                Russian it was a machine identifier standing in for a caption.
              */}
              <Label htmlFor={`fallback-${need}`} className="text-xs">
                {t('feed.actions.need-label', { need })}
              </Label>
              <Input
                id={`fallback-${need}`}
                data-testid={`fallback-input-${need}`}
                value={fallbackText[need] ?? ''}
                onChange={(event) => {
                  const text = event.target.value;
                  setFallbackText((previous) => ({ ...previous, [need]: text }));
                }}
                placeholder={t('feed.actions.fallback-placeholder')}
              />
            </div>
          ))}
          <Button
            variant={primary === 'fallback-submit' ? 'primary' : 'secondary'}
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
            {busy === 'fallback' ? t('feed.actions.recording') : t('feed.actions.record-answers')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {asking && !awaitingRound && actions.canAskMore && (
          <Button
            variant={primary === 'ask-round' ? 'primary' : 'secondary'}
            data-testid="ask-round"
            disabled={busy === 'ask'}
            onClick={() => {
              void send('ask', `/api/sessions/${sessionId}/rounds`);
            }}
          >
            {busy === 'ask'
              ? t('feed.actions.preparing-questions')
              : t('feed.actions.ask-questions')}
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
            /*
              The door is loud when it is the next step and quiet when something else is — not when
              the gate happens to hold. Those were the same thing often enough for the old rule to
              look right, and different exactly where it mattered: immediately after an approval the
              gate holds AND Generate was still primary, so the state the customer screenshotted had
              two loud buttons for the same reason the rule was written.
            */
            variant={primary === 'proceed' ? 'primary' : 'secondary'}
            data-testid="proceed"
            data-busy={String(busy === 'proceed')}
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
            {busy === 'proceed' ? t('feed.actions.checking-gate') : actions.target.label}
          </Button>
        )}

        {actions.target !== null &&
          !awaitingRound &&
          !actions.target.ready &&
          actions.target.unmet.length > 0 && (
            <span
              className="text-foreground-muted text-xs"
              data-testid="gate-unmet"
              data-reasons={actions.target.unmetCodes.join(' ')}
            >
              {t('feed.actions.still-needed', { list: actions.target.unmet.join(', ') })}
            </span>
          )}
      </div>

      {/*
        The way out, offered for as long as this is a wait (Р-3 item 2, narrowed by task 142). It is
        rendered outside the row above so it cannot be mistaken for another action: it is not another
        thing to do, it is permission to stop doing this one.

        `waiting` rather than `busy !== null`: the block used to appear on the same frame as the
        click, when the only reading it could print was «0 s», and on a request that answered in
        300 ms that reading was also its last. See `useSessionRequest`.
      */}
      {waiting && (
        <WaitingOn
          what={t(WAITING_FOR[busy ?? ''] ?? 'feed.waiting.server')}
          elapsedSeconds={elapsedSeconds}
          onStop={abandon}
        />
      )}
    </div>
  );
}
