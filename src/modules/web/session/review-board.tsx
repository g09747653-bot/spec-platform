'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * The review board (task 55; FR-010 AC-4/AC-7).
 *
 * Three actions, no fourth, and no way past the card without one of them — that is P2 rendered. The
 * board is drawn from persisted state, so a reload shows the same pending decision (FR-017 AC-4).
 *
 * Blocking and advisory findings are separate lists because they mean different things: one says the
 * document is unusable as written, the other is an opinion. Every item carries its own checkbox, and
 * the checkboxes matter only for request-changes — accept and ignore send no selection at all, which
 * is the same distinction the database draws (`selected_item_ids IS NULL` for both).
 *
 * **Request-changes is disabled with nothing selected.** Not because the server would accept it —
 * `ReviewDecision` refuses it and so does the table constraint — but because an enabled button that
 * always fails is a worse answer than a disabled one. The rule is enforced in three places on
 * purpose; this is the only one the user sees.
 */
export interface ReviewItemModel {
  id: string;
  section: string;
  line: number;
  description: string;
  suggestion: string;
}

export interface ReviewBoardModel {
  reviewId: string;
  outcome: 'pass' | 'needs_revision';
  mustfix: readonly ReviewItemModel[];
  recommendations: readonly ReviewItemModel[];
  /** `null` while the board waits — the state the workflow is gated on (AC-4). */
  decision: 'accept' | 'ignore' | 'request_changes' | null;
}

interface ReviewBoardProps {
  review: ReviewBoardModel;
}

type Action = 'accept' | 'ignore' | 'request_changes';

function ItemList({
  items,
  selected,
  onToggle,
  testIdPrefix,
}: {
  items: readonly ReviewItemModel[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  testIdPrefix: string;
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

export function ReviewBoard({ review }: ReviewBoardProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const response = await fetch(`/api/reviews/${review.reviewId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: action,
          // Only request-changes carries a selection; the other two send none at all (AC-7).
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

  const total = review.mustfix.length + review.recommendations.length;

  if (review.decision !== null) {
    return (
      <Card data-testid="review-board-decided">
        <CardHeader>
          <CardTitle>Review decided</CardTitle>
          <CardDescription>
            You chose <span data-testid="review-decision">{review.decision}</span> on this review.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-testid="review-board">
      <CardHeader>
        <CardTitle>
          Automated review{' '}
          <span className="text-ink-muted text-xs font-normal" data-testid="review-outcome">
            {review.outcome === 'pass' ? 'pass' : 'needs revision'}
          </span>
        </CardTitle>
        <CardDescription>
          {total === 0
            ? 'The reviewer found nothing to raise. Nothing advances until you decide.'
            : 'Tick the points you want applied, then choose. Nothing advances until you decide.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {review.mustfix.length > 0 && (
          <section className="flex flex-col gap-2" data-testid="review-mustfix">
            <h3 className="text-sm font-semibold">Must fix</h3>
            <ItemList
              items={review.mustfix}
              selected={selected}
              onToggle={toggle}
              testIdPrefix="review-mustfix-item"
            />
          </section>
        )}

        {review.recommendations.length > 0 && (
          <section className="flex flex-col gap-2" data-testid="review-recommendations">
            <h3 className="text-sm font-semibold">Recommendations</h3>
            <ItemList
              items={review.recommendations}
              selected={selected}
              onToggle={toggle}
              testIdPrefix="review-recommendation-item"
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
            disabled={busy !== null}
            onClick={() => {
              void decide('accept');
            }}
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </Button>
          <Button
            variant="secondary"
            data-testid="review-ignore"
            disabled={busy !== null}
            onClick={() => {
              void decide('ignore');
            }}
          >
            {busy === 'ignore' ? 'Ignoring…' : 'Ignore'}
          </Button>
          <Button
            variant="secondary"
            data-testid="review-request-changes"
            disabled={busy !== null || selected.size === 0}
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
      </CardContent>
    </Card>
  );
}
