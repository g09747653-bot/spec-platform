'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label, Textarea } from '../ui/field';

/**
 * The diff card (task 60; FR-011 AC-2..AC-6).
 *
 * Two surfaces in one component, because they are two states of one interaction: an instruction box
 * when nothing is pending, and the diff plus accept/reject when something is. Rendered from
 * persisted state, so a reload brings back the same pending diff rather than losing the proposal.
 *
 * **While a proposal is pending the instruction box is gone**, not merely disabled (AC-6). A
 * disabled box invites the user to work out why; an absent one, with the diff in its place, says
 * what the system is waiting for. The server refuses a second instruction regardless — the partial
 * unique index sees to that — so this is presentation of a rule, never the rule itself.
 *
 * A clarifying question (AC-9) is shown in place of a diff, with the box still open: the instruction
 * was not wrong, it was under-specified, and the next thing to do is answer.
 */
export interface PendingProposalModel {
  proposedChangeId: string;
  fileName: string;
  instruction: string;
  unifiedDiff: string;
  added: number;
  removed: number;
}

interface DiffCardProps {
  specFileId: string;
  /** The proposal awaiting a decision, or `null` when the file is free to accept an instruction. */
  proposal: PendingProposalModel | null;
}

/**
 * The endpoint's answers, parsed rather than assumed (constitution — runtime validation at every
 * boundary). An HTTP response is external input even when the server on the other end is ours.
 */
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

function refusalMessage(payload: unknown): string {
  const parsed = ErrorBody.safeParse(payload);
  if (!parsed.success) return 'That did not work. Please try again.';

  return parsed.data.error.details?.issues[0]?.message ?? parsed.data.error.message;
}

/** Colours the unified diff by line marker, without re-deriving what changed. */
function DiffBody({ unifiedDiff }: { unifiedDiff: string }) {
  return (
    <pre
      data-testid="diff-body"
      className="bg-canvas border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre"
    >
      {unifiedDiff.split('\n').map((line, index) => (
        <span
          key={`${String(index)}-${line}`}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'block text-green-700'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'block text-red-700'
                : line.startsWith('@@')
                  ? 'text-ink-muted block'
                  : 'block'
          }
        >
          {line === '' ? ' ' : line}
        </span>
      ))}
    </pre>
  );
}

export function DiffCard({ specFileId, proposal }: DiffCardProps) {
  const router = useRouter();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<'submit' | 'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  async function submit() {
    setBusy('submit');
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
        setError(refusalMessage(payload));
        return;
      }

      const parsed = RefinementResponse.safeParse(payload);
      if (!parsed.success) {
        setError('That did not work. Please try again.');
        return;
      }

      if (parsed.data.status === 'clarification') {
        setQuestion(parsed.data.question);
        return;
      }

      if (parsed.data.status === 'no-change') {
        setError('That instruction would not change anything in this file.');
        return;
      }

      setInstruction('');
      router.refresh();
    } catch {
      setError('That did not work. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function decide(decision: 'accept' | 'reject') {
    if (proposal === null) return;

    setBusy(decision);
    setError(null);

    try {
      const response = await fetch(`/api/proposed-changes/${proposal.proposedChangeId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
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

  if (proposal !== null) {
    return (
      <Card data-testid="diff-card">
        <CardHeader>
          <CardTitle>
            Proposed change to <span data-testid="diff-file-name">{proposal.fileName}</span>
          </CardTitle>
          <CardDescription>
            <span data-testid="diff-instruction">{proposal.instruction}</span>
            {' — '}
            <span data-testid="diff-counts">
              +{proposal.added} −{proposal.removed}
            </span>
            . Nothing is saved until you accept.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DiffBody unifiedDiff={proposal.unifiedDiff} />

          {error !== null && (
            <p role="alert" data-testid="diff-error" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              data-testid="accept-diff"
              disabled={busy !== null}
              onClick={() => {
                void decide('accept');
              }}
            >
              {busy === 'accept' ? 'Applying…' : 'Accept'}
            </Button>
            <Button
              variant="secondary"
              data-testid="reject-diff"
              disabled={busy !== null}
              onClick={() => {
                void decide('reject');
              }}
            >
              {busy === 'reject' ? 'Discarding…' : 'Reject'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="refine-card">
      <CardHeader>
        <CardTitle>Refine this file</CardTitle>
        <CardDescription>
          Say what should change. You will see the difference before anything is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="refine-instruction">Your instruction</Label>
        <Textarea
          id="refine-instruction"
          data-testid="refine-instruction"
          value={instruction}
          onChange={(event) => {
            setInstruction(event.target.value);
          }}
          placeholder="Add a non-goals section under the overview."
        />

        {question !== null && (
          <p data-testid="refine-question" className="text-sm">
            {question}
          </p>
        )}

        {error !== null && (
          <p role="alert" data-testid="refine-error" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <Button
          data-testid="submit-refinement"
          disabled={busy !== null || instruction.trim() === ''}
          onClick={() => {
            void submit();
          }}
          className="self-start"
        >
          {busy === 'submit' ? 'Working…' : 'Propose change'}
        </Button>
      </CardContent>
    </Card>
  );
}
