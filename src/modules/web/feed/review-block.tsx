'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { type PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { REASON_EXPLANATION } from '../session/gate-copy';
import { Button } from '../ui/button';

import { BlockCaption } from './bubbles';
import { FeedItem } from './feed-item';
import type { FeedReviewItem, ReviewBlock as ReviewBlockModel } from './model';

/**
 * The review card in the conversation (tasks 105/112 carrying task 54 forward; FR-010 AC-4/AC-7;
 * Эталон §1.3).
 *
 * Three actions, no fourth, and no way past the card without one of them — that is P2 rendered. The
 * board is drawn from persisted state, so a reload shows the same pending decision, and a decided one
 * stays in the feed as what it is: a turn of the conversation that has already happened.
 *
 * **The defaults are the parity behaviour, and they are not cosmetic.** Must Fix arrives ticked and
 * Recommendations arrives unticked, because that is what the two groups mean: a blocking finding is
 * one the reviewer says the document is unusable without, so the default answer to "which of these
 * should the rewrite apply?" is "all of them", while an advisory one is an opinion the user opted
 * into. A card that arrived entirely unticked made Request changes a control the user had to earn
 * before they could even see what it did — which is how the M4 card behaved, and it is the opposite
 * of the reference product.
 *
 * **A decided board shows what was decided, not what could have been.** For request-changes that is
 * the exact set of ids the decision carried, ticked and frozen. For accept and ignore there is no
 * set — the table stores `NULL` for both, deliberately, because neither applies anything, and "the
 * user ticked nothing" and "ticking was never part of this decision" are different facts (the
 * `review_feedback_selection_matches_decision` constraint is where that distinction is written
 * down). So those two render their findings without checkboxes at all rather than showing a tick
 * state nobody recorded.
 */
type Action = 'accept' | 'ignore' | 'request_changes';

function ConfidenceBadge({ item }: { item: FeedReviewItem }) {
  const t = useT();

  if (item.source === 'linter') {
    return (
      <span
        className="border-border-subtle text-foreground-muted rounded-full border px-2 py-0.5 text-[0.7rem] whitespace-nowrap"
        title={t('feed.review.linter-tooltip')}
        data-testid={`review-item-source-${item.id}`}
      >
        {t('feed.review.source-linter')}
      </span>
    );
  }

  return (
    <span
      className="border-border-subtle text-foreground-muted rounded-full border px-2 py-0.5 text-[0.7rem] whitespace-nowrap"
      title={t('feed.review.confidence-tooltip')}
      data-testid={`review-item-confidence-${item.id}`}
      /*
        The score on its own, away from the sentence and the `/10` it is printed in (task 143):
        what a suite wants to know is the number the reviewer gave, not how this badge phrases it.
      */
      data-confidence={String(item.confidence)}
    >
      {t('feed.review.confidence', { score: item.confidence })}
    </span>
  );
}

function ItemRow({
  item,
  checkbox,
  checked,
  onToggle,
  testIdPrefix,
}: {
  item: FeedReviewItem;
  /** Whether this row offers a checkbox at all — see the note on decided boards above. */
  checkbox: boolean;
  checked: boolean;
  onToggle: ((id: string) => void) | null;
  testIdPrefix: string;
}) {
  const t = useT();

  /*
   * The section path is the heading, and the title opens the body (task 134; row `1.3-4`).
   *
   * The reference heads each finding with «Section — subsection», because what a reader scanning a
   * board is doing is finding the part of the document a point is about. Ours led with `title` and
   * dropped the path into a small grey line beneath — our own field where the reference has the
   * document's own address. Both texts were always here; this is the order and the weight.
   */
  const body = (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium" data-testid={`review-item-section-${item.id}`}>
          {item.sectionPath}
        </span>
        <ConfidenceBadge item={item} />
      </span>
      <span className="block">
        <span className="font-medium">{item.title}</span> — {item.body}
      </span>
      <span className="block text-xs italic" data-testid={`review-item-suggestion-${item.id}`}>
        {t('feed.review.suggestion-label')}
        {item.suggestion}
      </span>
    </span>
  );

  const className =
    'border-border-subtle flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm';

  if (!checkbox) {
    return (
      <div className={className} data-testid={`${testIdPrefix}-${item.id}`}>
        {body}
      </div>
    );
  }

  return (
    <label
      className={`${className} hover:bg-background cursor-pointer`}
      data-testid={`${testIdPrefix}-${item.id}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={onToggle === null}
        onChange={() => {
          onToggle?.(item.id);
        }}
        data-testid={`review-item-checkbox-${item.id}`}
        className="mt-1"
      />
      {body}
    </label>
  );
}

function ItemGroup({
  heading,
  items,
  tone,
  testId,
  testIdPrefix,
  checkbox,
  selected,
  onToggle,
}: {
  /**
   * The group's heading, as a key: «Must Fix» is a decision about vocabulary, not a caption.
   *
   * Named `heading` rather than `title` because `title` is an attribute a browser paints, and the
   * lint rule that keeps copy out of components reads it as one wherever it appears (task 143).
   */
  heading: PhraseKey;
  items: readonly FeedReviewItem[];
  tone: 'blocking' | 'advisory';
  testId: string;
  testIdPrefix: string;
  checkbox: boolean;
  selected: ReadonlySet<string>;
  onToggle: ((id: string) => void) | null;
}) {
  const t = useT();

  if (items.length === 0) return null;

  /*
   * `<details>`, not a state-driven panel: the group opens and closes without JavaScript, so the
   * findings are readable in the first paint and stay readable if hydration is slow — the same
   * reasoning round 5 applied to every other control on this page.
   */
  return (
    <details open className="flex flex-col gap-2" data-testid={testId}>
      <summary className="cursor-pointer text-sm font-semibold">
        <span className={tone === 'blocking' ? 'text-danger-ink' : undefined}>
          {t(heading)} ({items.length})
        </span>
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <ItemRow
              item={item}
              checkbox={checkbox}
              checked={selected.has(item.id)}
              onToggle={onToggle}
              testIdPrefix={testIdPrefix}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

function VerdictBadge({ outcome }: { outcome: 'pass' | 'needs_revision' }) {
  const t = useT();

  return (
    <span
      className={
        outcome === 'pass'
          ? 'rounded-full border border-success-ink/40 px-2 py-0.5 text-xs text-success-ink'
          : 'rounded-full border border-warning-ink/40 px-2 py-0.5 text-xs text-warning-ink'
      }
      data-testid="review-outcome"
      /*
        The verdict as the review itself spells it (task 143). A walk that asserted «Needs Revision»
        was asserting the English on the badge, and the English is the one thing about this badge
        that is free to change.
      */
      data-outcome={outcome}
    >
      {outcome === 'pass' ? t('feed.review.outcome-pass') : t('feed.review.outcome-needs-revision')}
    </span>
  );
}

/**
 * What the user decided, said back to them.
 *
 * Keys rather than sentences (task 143), so the table keeps the exhaustiveness it has over `Action`
 * — a fourth decision would still be a type error — while the three sentences move to where both
 * languages of each can be read on one screen.
 */
const DECISION_COPY: Record<Action, PhraseKey> = {
  accept: 'feed.review.decided-accept',
  ignore: 'feed.review.decided-ignore',
  request_changes: 'feed.review.decided-request-changes',
};

export function ReviewBlockCard({ block, pending }: { block: ReviewBlockModel; pending: boolean }) {
  const router = useRouter();
  const t = useT();

  const mustFix = block.items.filter((item) => item.severity === 'blocking');
  const recommendations = block.items.filter((item) => item.severity === 'advisory');
  const total = block.items.length;

  /*
   * Must Fix ticked, Recommendations not (Эталон §1.3). Computed from the block, so the server
   * render and the first client render agree by construction — a default that depended on anything
   * the browser knows would be a hydration mismatch dressed as a preference.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(mustFix.map((item) => item.id)),
  );
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * The loop's budget, spent (task 113).
   *
   * The card stops offering Request changes and says why, in the words `gate-copy` keeps for this
   * reason code — the server refuses it too, so this is the honest face of a rule rather than the
   * rule itself (D-100). Accept and Ignore stay, which is what makes an exhausted cycle a fork and
   * not the dead end round 5 spent itself on.
   */
  const exhausted = block.cyclesUsed >= block.cycleBudget;

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function decide(action: Action) {
    setBusy(action);
    setError(null);

    try {
      const response = await fetch(`/api/reviews/${block.reviewId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Only request-changes carries a selection; the other two send none at all (AC-7).
          decision: action,
          ...(action === 'request_changes' ? { selectedItemIds: [...selected] } : {}),
        }),
      });

      if (!response.ok) {
        setError(t('feed.review.decision-error'));
        return;
      }

      router.refresh();
    } catch {
      setError(t('feed.review.decision-error'));
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <BlockCaption
        stage={block.specType}
        trailing="feed.caption.review"
        tone={pending ? 'primary' : 'muted'}
      />
      <VerdictBadge outcome={block.outcome} />
    </div>
  );

  const summary =
    block.summary === null || block.summary.trim() === '' ? null : (
      <p className="text-sm leading-relaxed" data-testid="review-summary">
        {block.summary}
      </p>
    );

  if (block.decision !== null || !pending) {
    const decided = block.decision;
    const frozen: ReadonlySet<string> = new Set(block.selectedItemIds ?? []);
    // Only a request-changes decision carried a selection, so only it has one to show.
    const showBoxes = decided === 'request_changes';
    const superseded = block.supersededBy !== null;

    /*
     * The sentence, when there is one to say (task 142).
     *
     * A decided board says what was decided. A board that is genuinely old says nothing here at all
     * — the badge in the summary says it, which is what the customer's report asked for. What is
     * left is the third case, and it is the one that made the old copy wrong more often than right:
     * an undecided, current, latest-revision board that simply is not what the session is waiting on
     * this second, because a round or a proposal outranks it. That reader is not looking at history
     * and must not be told they are.
     */
    const decisionLine =
      decided !== null
        ? t(DECISION_COPY[decided])
        : superseded
          ? null
          : t('feed.review.still-open');

    return (
      <FeedItem block={block}>
        <div
          className={
            superseded
              ? 'border-border-subtle bg-surface-muted flex w-full flex-col rounded-xl border p-4 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100'
              : 'border-border-subtle bg-surface flex w-full flex-col rounded-xl border p-4'
          }
          data-testid="review-board-decided"
          /*
            Two attributes rather than one because they answer different questions: `data-board`
            names which of the three cards this is, and `data-superseded` is the plain boolean a
            walk filters on. Both are additive — every id this card carried, it still carries.
          */
          data-board={superseded ? 'superseded' : 'settled'}
          data-superseded={String(superseded)}
        >
          {/*
            The badge stays outside the fold, because the badge is the thing the reader has to see
            without doing anything. What folds is the findings.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {header}
            {/*
              The one layout change the translation asks for (task 143; voice standard §1.3).
              `uppercase` is gone from this badge and stays on every other micro-label: Cyrillic
              capitals are a row of near-identical rectangles, so a caps string much past two dozen
              characters stops reading as words. «Заменена — новая рецензия ниже» is exactly at that
              edge, and it is the only micro-label in the product long enough to reach it.
            */}
            {superseded && (
              <span
                data-testid="review-superseded-badge"
                className="border-border-subtle text-foreground-subtle text-label rounded-full border px-2 py-0.5"
              >
                {t('feed.review.superseded')}
              </span>
            )}
          </div>

          {/*
            Folded when it is history, open when it is not — and folded *without JavaScript*, by the
            same argument the item groups below already make: this card is readable in the first
            paint and stays readable if hydration is slow. `open` is computed from the block alone,
            never from anything only the browser knows, so the server render and the first client
            render agree by construction.
          */}
          <details
            data-testid="review-board-details"
            open={!superseded}
            className="mt-3 flex flex-col gap-3"
          >
            {/*
              A board that raised nothing says so in words (task 143; voice standard §4). «0 points
              in all» is a counter reporting an absence as a measurement — the same defect the empty
              archive and the unwritten document already avoid — and it is a sentence in both
              languages rather than a plural form of zero.
            */}
            <summary className="text-foreground-muted cursor-pointer text-sm">
              {total === 0
                ? t('feed.review.points-none')
                : t('feed.review.points-total', { count: total })}
            </summary>

            <div className="mt-3 flex flex-col gap-3">
              {summary}
              {decisionLine !== null && (
                <p
                  className="text-foreground-muted text-sm"
                  data-testid="review-decision"
                  /*
                    The decision in the table's own spelling, and absent when there is none
                    (task 143). The third case above gives this line to a board nobody has decided
                    yet, and a token minted to fill that gap would state a decision the
                    `review_feedback` row does not have — the same lie the copy is careful not to
                    tell there.
                  */
                  data-decision={decided ?? undefined}
                >
                  {decisionLine}
                </p>
              )}

              <ItemGroup
                heading="feed.review.group-must-fix"
                items={mustFix}
                tone="blocking"
                testId="review-mustfix"
                testIdPrefix="review-mustfix-item"
                checkbox={showBoxes}
                selected={frozen}
                onToggle={null}
              />
              <ItemGroup
                heading="feed.review.group-recommendations"
                items={recommendations}
                tone="advisory"
                testId="review-recommendations"
                testIdPrefix="review-recommendation-item"
                checkbox={showBoxes}
                selected={frozen}
                onToggle={null}
              />
            </div>
          </details>
        </div>
      </FeedItem>
    );
  }

  return (
    <FeedItem block={block}>
      {/*
        The board in hand, and it looks like it (task 142).

        The accent is the one this codebase already reserves for the card a decision belongs to —
        the same ring and border weight the composer wears when it is focused. It costs no new
        colour, and it is what makes «the checkboxes disappeared» un-thinkable: the card with the
        checkboxes is the only one on the page with a ring around it.
      */}
      <div
        className="border-primary/40 bg-surface ring-primary/20 flex w-full flex-col gap-4 rounded-xl border p-4 ring-1"
        data-testid="review-board"
        data-board="active"
      >
        {header}
        {summary}

        <p className="text-foreground-muted text-sm">
          {total === 0 ? t('feed.review.hint-empty') : t('feed.review.hint-ticked')}
        </p>

        <ItemGroup
          heading="feed.review.group-must-fix"
          items={mustFix}
          tone="blocking"
          testId="review-mustfix"
          testIdPrefix="review-mustfix-item"
          checkbox
          selected={selected}
          onToggle={toggle}
        />
        <ItemGroup
          heading="feed.review.group-recommendations"
          items={recommendations}
          tone="advisory"
          testId="review-recommendations"
          testIdPrefix="review-recommendation-item"
          checkbox
          selected={selected}
          onToggle={toggle}
        />

        {error !== null && (
          <p role="alert" data-testid="review-error" className="text-sm text-danger-ink">
            {error}
          </p>
        )}

        {exhausted && (
          <p className="text-foreground-muted text-sm" data-testid="review-cycles-exhausted">
            {t(REASON_EXPLANATION.REVISION_LIMIT_REACHED)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="review-accept"
            disabled={busy === 'accept'}
            onClick={() => {
              void decide('accept');
            }}
          >
            {busy === 'accept' ? t('feed.review.accept-busy') : t('feed.review.accept')}
          </Button>
          {!exhausted && (
            <Button
              variant="secondary"
              data-testid="review-request-changes"
              disabled={busy === 'request_changes' || selected.size === 0}
              onClick={() => {
                void decide('request_changes');
              }}
            >
              {busy === 'request_changes' ? t('common.sending') : t('common.request-changes')}
            </Button>
          )}
          <Button
            variant="secondary"
            data-testid="review-ignore"
            disabled={busy === 'ignore'}
            onClick={() => {
              void decide('ignore');
            }}
          >
            {busy === 'ignore' ? t('feed.review.ignore-busy') : t('feed.review.ignore')}
          </Button>
        </div>

        {!exhausted && selected.size === 0 && total > 0 && (
          <p className="text-foreground-muted text-xs" data-testid="review-selection-hint">
            {t('feed.review.selection-hint')}
          </p>
        )}
      </div>
    </FeedItem>
  );
}
