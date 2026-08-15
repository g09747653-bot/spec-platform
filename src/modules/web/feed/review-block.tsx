'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../ui/button';

import { BlockCaption } from './bubbles';
import { FeedItem } from './feed-item';
import type { FeedReviewItem, ReviewBlock as ReviewBlockModel } from './model';

/**
 * The review card in the conversation (task 105 carrying task 55 forward; FR-010 AC-4/AC-7).
 *
 * Three actions, no fourth, and no way past the card without one of them — that is P2 rendered. The
 * board is drawn from persisted state, so a reload shows the same pending decision, and a decided one
 * stays in the feed as what it is: a turn of the conversation that has already happened.
 *
 * Blocking and advisory findings are separate lists because they mean different things: one says the
 * document is unusable as written, the other is an opinion. The checkboxes matter only for
 * request-changes — accept and ignore send no selection at all, which is the same distinction the
 * database draws (`selected_item_ids IS NULL` for both).
 *
 * The parity treatment of this card — Must Fix ticked by default, confidence badges, the targeted
 * revision loop — is M8п's (tasks 111–113). What M7п owes it is a place in the feed.
 */
type Action = 'accept' | 'ignore' | 'request_changes';

function ItemList({
  items,
  selected,
  onToggle,
  testIdPrefix,
  disabled,
}: {
  items: readonly FeedReviewItem[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  testIdPrefix: string;
  disabled: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <label
            className="border-border-subtle hover:bg-canvas flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm"
            data-testid={`${testIdPrefix}-${item.id}`}
          >
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              disabled={disabled}
              onChange={() => {
                onToggle(item.id);
              }}
              data-testid={`review-item-checkbox-${item.id}`}
              className="mt-1"
            />
            <span>
              <span className="text-ink-muted block text-xs">
                {item.section} · line {item.line}
              </span>
              <span className="block font-medium">{item.description}</span>
              <span className="text-ink-muted block text-xs">{item.suggestion}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function ReviewBlockCard({ block, pending }: { block: ReviewBlockModel; pending: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mustfix = block.items.filter((item) => item.severity === 'blocking');
  const recommendations = block.items.filter((item) => item.severity === 'advisory');
  const total = block.items.length;

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

  if (block.decision !== null || !pending) {
    return (
      <FeedItem block={block}>
        <div
          className="border-border-subtle bg-surface flex w-full max-w-[46rem] flex-col gap-1 rounded-xl border p-4"
          data-testid="review-board-decided"
        >
          <BlockCaption stage={block.specType} trailing="review" />
          <p className="text-sm">
            You chose <span data-testid="review-decision">{block.decision ?? 'nothing yet'}</span>{' '}
            on this review of {total} {total === 1 ? 'point' : 'points'}.
          </p>
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
        <div className="flex flex-wrap items-center gap-2">
          <BlockCaption stage={block.specType} trailing="review" />
          <span
            className={
              block.outcome === 'pass'
                ? 'rounded-full border border-green-600/40 px-2 py-0.5 text-xs text-green-700'
                : 'rounded-full border border-amber-600/40 px-2 py-0.5 text-xs text-amber-700'
            }
            data-testid="review-outcome"
          >
            {block.outcome === 'pass' ? 'pass' : 'needs revision'}
          </span>
        </div>

        <p className="text-ink-muted text-sm">
          {total === 0
            ? 'The reviewer found nothing to raise. Nothing advances until you decide.'
            : 'Tick the points you want applied, then choose. Nothing advances until you decide.'}
        </p>

        {mustfix.length > 0 && (
          <section className="flex flex-col gap-2" data-testid="review-mustfix">
            <h3 className="text-sm font-semibold">Must fix ({mustfix.length})</h3>
            <ItemList
              items={mustfix}
              selected={selected}
              onToggle={toggle}
              testIdPrefix="review-mustfix-item"
              disabled={false}
            />
          </section>
        )}

        {recommendations.length > 0 && (
          <section className="flex flex-col gap-2" data-testid="review-recommendations">
            <h3 className="text-sm font-semibold">Recommendations ({recommendations.length})</h3>
            <ItemList
              items={recommendations}
              selected={selected}
              onToggle={toggle}
              testIdPrefix="review-recommendation-item"
              disabled={false}
            />
          </section>
        )}

        {error !== null && (
          <p role="alert" data-testid="review-error" className="text-sm text-red-700">
            {error}
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
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </Button>
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
        </div>

        {selected.size === 0 && total > 0 && (
          <p className="text-ink-muted text-xs" data-testid="review-selection-hint">
            Requesting changes needs at least one point ticked — only the ticked ones are applied.
          </p>
        )}
      </div>
    </FeedItem>
  );
}
