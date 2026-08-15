'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

const CONFIDENCE_TOOLTIP =
  'How certain the AI reviewer is that this feedback is accurate. It is the reviewer’s own estimate, not a measurement.';

const LINTER_TOOLTIP =
  'Found by a deterministic check over the document itself — a cross-reference, an identifier, or a requirement’s form. No model was asked.';

function ConfidenceBadge({ item }: { item: FeedReviewItem }) {
  if (item.source === 'linter') {
    return (
      <span
        className="border-border-subtle text-ink-muted rounded-full border px-2 py-0.5 text-[0.7rem] whitespace-nowrap"
        title={LINTER_TOOLTIP}
        data-testid={`review-item-source-${item.id}`}
      >
        Automated check
      </span>
    );
  }

  return (
    <span
      className="border-border-subtle text-ink-muted rounded-full border px-2 py-0.5 text-[0.7rem] whitespace-nowrap"
      title={CONFIDENCE_TOOLTIP}
      data-testid={`review-item-confidence-${item.id}`}
    >
      Confidence score {item.confidence}/10
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
  const body = (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{item.title}</span>
        <ConfidenceBadge item={item} />
      </span>
      <span className="text-ink-muted block text-xs">{item.sectionPath}</span>
      <span className="block">{item.body}</span>
      <span className="block text-xs italic" data-testid={`review-item-suggestion-${item.id}`}>
        Suggestion: {item.suggestion}
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
      className={`${className} hover:bg-canvas cursor-pointer`}
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
  title,
  items,
  tone,
  testId,
  testIdPrefix,
  checkbox,
  selected,
  onToggle,
}: {
  title: string;
  items: readonly FeedReviewItem[];
  tone: 'blocking' | 'advisory';
  testId: string;
  testIdPrefix: string;
  checkbox: boolean;
  selected: ReadonlySet<string>;
  onToggle: ((id: string) => void) | null;
}) {
  if (items.length === 0) return null;

  /*
   * `<details>`, not a state-driven panel: the group opens and closes without JavaScript, so the
   * findings are readable in the first paint and stay readable if hydration is slow — the same
   * reasoning round 5 applied to every other control on this page.
   */
  return (
    <details open className="flex flex-col gap-2" data-testid={testId}>
      <summary className="cursor-pointer text-sm font-semibold">
        <span className={tone === 'blocking' ? 'text-red-700' : undefined}>
          {title} ({items.length})
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
  return (
    <span
      className={
        outcome === 'pass'
          ? 'rounded-full border border-green-600/40 px-2 py-0.5 text-xs text-green-700'
          : 'rounded-full border border-amber-600/40 px-2 py-0.5 text-xs text-amber-700'
      }
      data-testid="review-outcome"
    >
      {outcome === 'pass' ? 'Pass' : 'Needs Revision'}
    </span>
  );
}

const DECISION_COPY: Record<Action, string> = {
  accept: 'You accepted this feedback and moved on with the document as it stands.',
  ignore: 'You set this feedback aside.',
  request_changes: 'You sent the document back with these points ticked.',
};

export function ReviewBlockCard({ block, pending }: { block: ReviewBlockModel; pending: boolean }) {
  const router = useRouter();

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
        setError('That decision did not go through. Please try again.');
        return;
      }

      router.refresh();
    } catch {
      setError('That decision did not go through. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <BlockCaption stage={block.specType} trailing="review" />
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

    return (
      <FeedItem block={block}>
        <div
          className="border-border-subtle bg-surface flex w-full max-w-[46rem] flex-col gap-3 rounded-xl border p-4"
          data-testid="review-board-decided"
        >
          {header}
          {summary}
          <p className="text-ink-muted text-sm">
            <span data-testid="review-decision">
              {decided === null
                ? 'This review is no longer the one in front of you.'
                : DECISION_COPY[decided]}
            </span>{' '}
            {total} {total === 1 ? 'point' : 'points'} in all.
          </p>

          <ItemGroup
            title="Must Fix"
            items={mustFix}
            tone="blocking"
            testId="review-mustfix"
            testIdPrefix="review-mustfix-item"
            checkbox={showBoxes}
            selected={frozen}
            onToggle={null}
          />
          <ItemGroup
            title="Recommendations"
            items={recommendations}
            tone="advisory"
            testId="review-recommendations"
            testIdPrefix="review-recommendation-item"
            checkbox={showBoxes}
            selected={frozen}
            onToggle={null}
          />
        </div>
      </FeedItem>
    );
  }

  return (
    <FeedItem block={block}>
      <div
        className="border-border-subtle bg-surface flex w-full max-w-[46rem] flex-col gap-4 rounded-xl border p-4"
        data-testid="review-board"
      >
        {header}
        {summary}

        <p className="text-ink-muted text-sm">
          {total === 0
            ? 'The reviewer found nothing to raise. Nothing advances until you decide.'
            : 'Ticked points are the ones a rewrite would apply. Nothing advances until you decide.'}
        </p>

        <ItemGroup
          title="Must Fix"
          items={mustFix}
          tone="blocking"
          testId="review-mustfix"
          testIdPrefix="review-mustfix-item"
          checkbox
          selected={selected}
          onToggle={toggle}
        />
        <ItemGroup
          title="Recommendations"
          items={recommendations}
          tone="advisory"
          testId="review-recommendations"
          testIdPrefix="review-recommendation-item"
          checkbox
          selected={selected}
          onToggle={toggle}
        />

        {error !== null && (
          <p role="alert" data-testid="review-error" className="text-sm text-red-700">
            {error}
          </p>
        )}

        {exhausted && (
          <p className="text-ink-muted text-sm" data-testid="review-cycles-exhausted">
            {REASON_EXPLANATION.REVISION_LIMIT_REACHED}
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
            {busy === 'accept' ? 'Accepting…' : 'Accept feedback'}
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
              {busy === 'request_changes' ? 'Sending…' : 'Request changes'}
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
            {busy === 'ignore' ? 'Ignoring…' : 'Ignore'}
          </Button>
        </div>

        {!exhausted && selected.size === 0 && total > 0 && (
          <p className="text-ink-muted text-xs" data-testid="review-selection-hint">
            Requesting changes needs at least one point ticked — only the ticked ones are applied.
          </p>
        )}
      </div>
    </FeedItem>
  );
}
