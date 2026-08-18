'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';
import { DiffBody } from '../ui/diff-body';
import { Label, Textarea } from '../ui/field';

import { BlockCaption } from './bubbles';
import { FeedItem } from './feed-item';
import type { ProposalBlock as ProposalBlockModel } from './model';

/**
 * A conversational refinement, in the conversation (task 105 carrying tasks 58–60 forward; FR-011).
 *
 * A proposal is **not spec content** until it is accepted — nothing that resolves a bundle reads it —
 * so it appears here as what it is: a suggested change with its diff, awaiting accept or reject. A
 * decided one stays as a one-line marker, because the revision it produced (or did not) is the block
 * that carries the outcome.
 */
export interface PendingProposalModel {
  proposedChangeId: string;
  instruction: string;
  /**
   * One entry per touched file, in bundle order (task 118).
   *
   * A single-file refinement is a list of one, and a cross-file edit is a list of several — the same
   * card, the same buttons, and one decision either way. That is not a convenience: the whole point
   * of an edit batch is that the user approves the *set*, so a surface that could show one member at
   * a time would be a surface where "apply all of it atomically" had no place to be pressed.
   */
  files: readonly { fileName: string; unifiedDiff: string; added: number; removed: number }[];
}

/** The endpoint's answers, parsed rather than assumed — an HTTP response is external input. */
const RefinementResponse = z.discriminatedUnion('status', [
  z.object({ status: z.literal('proposed'), proposedChangeId: z.string().min(1) }),
  z.object({ status: z.literal('clarification'), question: z.string().min(1) }),
  z.object({ status: z.literal('no-change') }),
]);

/** The refusal body, for the one refusal whose message the user needs: the named section (AC-8). */
const ErrorBody = z.object({
  error: z.object({
    message: z.string(),
    details: z.object({ issues: z.array(z.object({ message: z.string() })).min(1) }).optional(),
  }),
});

/**
 * The refusal's own words, or `null` when the body was not one.
 *
 * Null rather than a fallback sentence (task 143): the fallback is copy and belongs in the
 * dictionary, and a pure parser that reached for a translator would have to be handed one by every
 * caller. The message it does return is the server's, which is the point of parsing it.
 */
function refusalMessage(payload: unknown): string | null {
  const parsed = ErrorBody.safeParse(payload);
  if (!parsed.success) return null;

  return parsed.data.error.details?.issues[0]?.message ?? parsed.data.error.message;
}

export function ProposalBlockCard({
  block,
  proposal,
}: {
  block: ProposalBlockModel;
  /** The computed diff, present only while the proposal awaits a decision. */
  proposal: PendingProposalModel | null;
}) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'accept' | 'reject') {
    setBusy(decision);
    setError(null);

    try {
      const response = await fetch(`/api/proposed-changes/${block.proposedChangeId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      if (!response.ok) {
        setError(t('feed.proposal.decision-error'));
        return;
      }

      router.refresh();
    } catch {
      setError(t('feed.proposal.decision-error'));
    } finally {
      setBusy(null);
    }
  }

  const edit = block.editBatchId !== null;
  /*
   * Which mechanism this card belongs to, as a caption key (task 143). Both are «правка» in Russian
   * and one root apart from the review's «доработка», which is the distinction the two words exist
   * to hold: an edit batch and a refinement change a finished file, a review sends it back.
   */
  const label = edit ? 'feed.caption.edit' : 'feed.caption.refinement';

  if (proposal === null) {
    return (
      <FeedItem block={block}>
        <div
          className="border-border-subtle bg-surface flex w-full flex-col gap-1 rounded-xl border p-4"
          data-testid="proposal-decided"
          /*
            Which way it went, in the column's own word (task 143). «Applied» and «Discarded» are
            the sentence's business; this card is one of two outcomes and should say which without
            anyone having to read it.
          */
          data-status={block.status}
        >
          <BlockCaption stage={block.stage} trailing={label} />
          <p className="text-sm">
            {block.status === 'accepted'
              ? t('feed.proposal.applied')
              : t('feed.proposal.discarded')}
            : {block.instruction}
          </p>
          <p className="text-foreground-muted text-xs" data-testid="proposal-decided-files">
            {block.files.map((file) => file.fileName).join(', ')}
          </p>
        </div>
      </FeedItem>
    );
  }

  const added = proposal.files.reduce((total, file) => total + file.added, 0);
  const removed = proposal.files.reduce((total, file) => total + file.removed, 0);

  return (
    <FeedItem block={block}>
      <div
        className="border-border-subtle bg-surface flex w-full flex-col gap-3 rounded-xl border p-4"
        data-testid={edit ? 'edit-card' : 'diff-card'}
      >
        <BlockCaption stage={block.stage} trailing={label} />
        <p className="text-sm font-medium">
          {edit
            ? t('feed.proposal.edit-title', { count: proposal.files.length })
            : t('feed.proposal.title')}
        </p>
        <p className="text-foreground-muted text-xs">
          <span data-testid="diff-instruction">{proposal.instruction}</span>
          {' — '}
          <span data-testid="diff-counts">
            +{added} −{removed}
          </span>
          {/*
            The tail carries the full stop that ends the counts, because the sentence around the two
            spans is one phrase and the spans are the only thing in it the dictionary cannot hold.
          */}
          {edit ? t('feed.proposal.pending-tail-approve') : t('feed.proposal.pending-tail-accept')}
        </p>

        {proposal.files.map((file) => (
          <div key={file.fileName} className="flex flex-col gap-1" data-testid="diff-file">
            <p className="text-xs font-medium">
              <span data-testid="diff-file-name">{file.fileName}</span>
              <span className="text-foreground-muted">
                {' '}
                +{file.added} −{file.removed}
              </span>
            </p>
            <DiffBody unifiedDiff={file.unifiedDiff} testId="diff-body" />
          </div>
        ))}

        {error !== null && (
          <p role="alert" data-testid="diff-error" className="text-sm text-danger-ink">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            data-testid="accept-diff"
            disabled={busy === 'accept'}
            onClick={() => {
              void decide('accept');
            }}
          >
            {busy === 'accept'
              ? edit
                ? t('feed.proposal.approve-apply-busy')
                : t('feed.proposal.accept-busy')
              : edit
                ? t('feed.proposal.approve-apply')
                : t('feed.proposal.accept')}
          </Button>
          <Button
            variant="secondary"
            data-testid="reject-diff"
            disabled={busy === 'reject'}
            onClick={() => {
              void decide('reject');
            }}
          >
            {busy === 'reject'
              ? t('feed.proposal.reject-busy')
              : edit
                ? t('common.request-changes')
                : t('feed.proposal.reject')}
          </Button>
        </div>
      </div>
    </FeedItem>
  );
}

/**
 * The instruction box — how a refinement is started (FR-011 AC-1).
 *
 * It sits at the tail of the conversation rather than beside a document, because refinement applies
 * to the file the session is working on and that file is whatever the tail says it is. **While a
 * proposal is pending the box is gone**, not merely disabled (AC-6): a disabled box invites the user
 * to work out why; an absent one, with the diff in its place, says what the system is waiting for.
 */
export function RefineBox({ specFileId }: { specFileId: string }) {
  const router = useRouter();
  const t = useT();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setQuestion(null);

    try {
      const response = await fetch(`/api/specs/${specFileId}/proposed-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        // The section-removal refusal names the section, and that message is the whole point of it.
        setError(refusalMessage(payload) ?? t('feed.refine.failed'));
        return;
      }

      const parsed = RefinementResponse.safeParse(payload);
      if (!parsed.success) {
        setError(t('feed.refine.failed'));
        return;
      }

      if (parsed.data.status === 'clarification') {
        setQuestion(parsed.data.question);
        return;
      }

      if (parsed.data.status === 'no-change') {
        setError(t('feed.refine.no-change'));
        return;
      }

      setInstruction('');
      router.refresh();
    } catch {
      setError(t('feed.refine.failed'));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Folded behind its own heading (task 142).
   *
   * The box was a permanently open textarea in a card of its own, stacked under two other cards
   * that each had a loud button. It is not a step of the journey — it is a thing you can do at any
   * point once a document exists — and a surface that is always available should not be as loud as
   * the one thing the session is actually waiting for.
   *
   * `<details>` for the reason this codebase has already written down for the review groups: it
   * opens before hydration, and on this page hydration is genuinely not instant (the viewer arrives
   * as its own chunk). The one thing a fold must never do is swallow something the user needs to
   * read, so it is forced open whenever it has an answer, an error, or typed text in it — a
   * disclosure that hides a refusal would be D-97 all over again.
   */
  const speaking = question !== null || error !== null || instruction.trim() !== '';

  return (
    <details
      className="border-border-subtle w-full rounded-xl border border-dashed p-4"
      data-testid="refine-card"
      open={speaking}
    >
      <summary className="text-foreground-muted cursor-pointer text-sm" data-testid="refine-toggle">
        {t('feed.refine.heading')}
      </summary>

      <div className="mt-3 flex w-full flex-col gap-2">
        <Label htmlFor="refine-instruction" className="sr-only">
          {t('feed.refine.heading')}
        </Label>
        <Textarea
          id="refine-instruction"
          data-testid="refine-instruction"
          value={instruction}
          onChange={(event) => {
            setInstruction(event.target.value);
          }}
          placeholder={t('feed.refine.placeholder')}
        />

        {question !== null && (
          <p data-testid="refine-question" className="text-sm">
            {question}
          </p>
        )}

        {error !== null && (
          <p role="alert" data-testid="refine-error" className="text-sm text-danger-ink">
            {error}
          </p>
        )}

        {/*
          Never the loud one. Refinement is always available and therefore never the next step; the
          tail decides what is (see `tail-primary.ts`).
        */}
        <Button
          variant="secondary"
          data-testid="submit-refinement"
          disabled={busy || instruction.trim() === ''}
          onClick={() => {
            void submit();
          }}
          className="self-start"
        >
          {busy ? t('feed.refine.busy') : t('feed.refine.submit')}
        </Button>
      </div>
    </details>
  );
}
