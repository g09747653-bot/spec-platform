'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label, Textarea } from '../ui/field';

import type { TransitionTargetModel } from './interview-panel';
import { useResumableStream } from './useResumableStream';
import { useSessionRequest } from './useSessionRequest';
import { WaitingOn } from './waiting-on';

/**
 * The spec card: generate, then decide (tasks 21, 45, 46, 49; FR-008, FR-009, FR-018).
 *
 * The card is rendered from persisted state, so a reload shows the same pending decision rather than
 * losing it (FR-017 AC-4). Nothing advances on its own — approve and request-changes are the only two
 * ways forward, which is P2 made visible.
 *
 * Generation **streams**: the document appears as it is written rather than after it is finished
 * (FR-008 AC-2; A5), a mid-stream provider failover clears what was rendered and starts again (D-9),
 * and a dropped connection reconnects on its own. A failure that exhausts every provider is not a
 * dead end: it says so plainly, without naming a vendor, and offers the same button again — which
 * resumes from the same workflow position with the same context (FR-018 AC-2/AC-3/AC-7).
 */
export interface SpecCardState {
  specFileId: string;
  fileName: string;
  revisionNumber: number;
  approved: boolean;
  content: string;
}

interface SpecCardProps {
  sessionId: string;
  /** The current revision, or `null` when nothing has been generated yet. */
  revision: SpecCardState | null;
  /**
   * True while a question card awaits submission: generation is blocked in that interaction
   * (task 34; FR-005 AC-4). Presentation of a rule the server owns — not the enforcement.
   */
  generationBlocked?: boolean;
  /**
   * Whether the session's position is one that can generate at all (round 2, Д-4).
   *
   * Derived from the workflow, not from a local flag: at the interview, or at `collect`, or on a
   * completed session, the generate endpoint refuses (constitution P1), and a control whose only
   * possible outcome is a rejection is worse than no control. The gate is still the authority —
   * this only stops the interface from inviting a click it knows will fail.
   */
  canGenerate?: boolean;
  /**
   * Where "proceed" leads from `generate` — the door into `review` (task 56).
   *
   * It lives on this card because approval is what opens it (FR-009 AC-3), so the control belongs
   * beside the decision that unlocked it. Whether it is *permitted* is still the gate's answer, read
   * from the same snapshot the page evaluated; this only presents the verdict.
   */
  target?: TransitionTargetModel | null;
  /**
   * How long to keep believing the server is still working (round 5, Р-3).
   *
   * It matters most on this card: entering `review` runs the review agent **inside** the transition
   * request, so the door out of `generate` is the one request on the page whose honest duration is
   * a provider chain's worth of minutes. Derived from that chain by the page, not guessed here.
   */
  deadlineMs: number;
  /**
   * The session's generation still in flight when the page was rendered (round 5, Р-3).
   *
   * Round 4 made the *run* survive its reader; this makes the **page** survive it too. Leaving the
   * session mid-generation and coming back used to land on an empty card with a Generate button —
   * the run was still going, the page said nothing about it, and clicking Generate started a second
   * one over the same stage. Reattaching to the durable chunk log resolves both: the document
   * carries on drawing where it left off, and the control that would have duplicated it is Stop.
   */
  activeRun?: { runId: string; attempt: number } | null;
}

function isSpecCardState(value: unknown): value is SpecCardState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'specFileId' in value &&
    'revisionNumber' in value &&
    typeof value.specFileId === 'string' &&
    typeof value.revisionNumber === 'number'
  );
}

/** What each action is waiting for, in the words the status line reads out. */
const WAITING_FOR: Record<string, string> = {
  approve: 'the approval to be recorded',
  changes: 'the revision to be written',
  proceed: 'the gate to answer',
};

export function SpecCard({
  sessionId,
  revision,
  generationBlocked = false,
  canGenerate = true,
  target = null,
  deadlineMs,
  activeRun = null,
}: SpecCardProps) {
  const router = useRouter();
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { state: stream, start, resume, stop } = useResumableStream();
  const { state: request, elapsedSeconds, send: post, abandon } = useSessionRequest(deadlineMs);

  const generating = stream.status === 'streaming' || stream.status === 'reconnecting';
  const busy = request.running;
  const error = localError ?? request.notice;

  /*
   * Reattach to a run that was already going when this page loaded (round 5, Р-3).
   *
   * `from: -1` because a fresh page has rendered nothing: the durable chunk log replays from the
   * start, and the reader's own de-duplication by sequence is what makes that safe.
   *
   * **The condition is the reader's own state, not a "done it once" ref.** A ref looked right and was
   * wrong: React's strict mode mounts, unmounts and mounts again, the unmount stops the reader, and
   * the second mount then sees the ref already set and attaches to nothing — a page permanently
   * showing Generate over a run that was still going, which is the very defect this exists to fix.
   * Keying on `idle` re-attaches after that cleanup, and cannot start a second reader because the
   * first attach leaves the state `streaming`.
   *
   * `detached` is what keeps Stop meaningful: stopping publishes `idle`, and without it this would
   * immediately re-attach to the run the user just walked away from.
   */
  const [detached, setDetached] = useState(false);
  const runId = activeRun?.runId ?? null;
  const attempt = activeRun?.attempt ?? 1;

  /**
   * A run the **server** says is in flight — known before a line of this component's JavaScript has
   * run, and that is the point.
   *
   * Reattaching happens in an effect, and the live gate walk found one circumstance, on a machine
   * saturated by a local model, where that effect did not fire at all (no resume request was ever
   * made; five isolated reproductions of the same navigation could not repeat it). Whatever the
   * cause, the page must not be *dishonest* while it waits for its own JavaScript: offering
   * "Generate" over a run already in flight is the one thing it must never do, and this makes that
   * a property of the server's render rather than of an effect's timing.
   *
   * It is a **snapshot**, so it must yield to anything more recent: once the reader following that
   * run has seen it end, this claim is stale and holding on to it would hide the retry behind a run
   * that is already over — a dead end of exactly the kind being fixed here. `Stop` is the other way
   * out, for the case where no reader ever attached and the snapshot is all the page has.
   */
  const runSettled = stream.status === 'complete' || stream.status === 'failed';
  const runInFlight = runId !== null && !detached && !runSettled;

  useEffect(() => {
    if (runId === null || detached || stream.status !== 'idle') return;

    void resume(runId, -1, attempt).then((outcome) => {
      // Same reason as `generate()`: the revision is persisted before `complete` is sent.
      if (outcome.status === 'complete') router.refresh();
    });
  }, [runId, attempt, detached, stream.status, resume, router]);

  /** Stop reading. The run carries on server-side (D-95); this page simply stops following it. */
  function stopFollowing() {
    setDetached(true);
    stop();
  }

  async function generate() {
    setLocalError(null);
    const outcome = await start(sessionId);

    // The revision is persisted before `complete` is sent, so refreshing here shows the card the
    // server would render on a reload — the same state, arrived at two ways (FR-017 AC-4).
    if (outcome.status === 'complete') router.refresh();
  }

  /**
   * The one door a session moves through — the same endpoint the interview panel calls (P1).
   *
   * Round 5, Р-3: this is where the wall was widest. The refusal used to be reported as
   * "That step is not available yet" no matter what the gate had said, and the wait had no end, no
   * status and no way out. Both are now the shared request's business, so the reason reaches the
   * user and `stop-waiting` is on screen for every second the request is in flight.
   */
  async function proceed(to: TransitionTargetModel) {
    setLocalError(null);
    await post('proceed', `/api/sessions/${sessionId}/transition`, {
      toStage: to.toStage,
      ...(to.toSubstage === null ? {} : { toSubstage: to.toSubstage }),
    });
  }

  async function send(action: 'approve' | 'changes', url: string, body?: Record<string, unknown>) {
    setLocalError(null);
    const outcome = await post(action, url, body);

    // A 200 that is not a spec-card state is a contract breach, not a refusal: the request layer
    // reports transport and refusals, and this is neither.
    if (outcome.ok && !isSpecCardState(outcome.payload)) {
      setLocalError('That did not work. Please try again.');
      return;
    }

    if (!outcome.ok) return;

    setInstruction('');
    setShowInstruction(false);
  }

  if (revision === null) {
    return (
      <Card data-testid="spec-card-empty">
        <CardHeader>
          <CardTitle>Generate the first specification file</CardTitle>
          <CardDescription>
            The document is written straight into the page as the model produces it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error !== null && (
            <p role="alert" data-testid="spec-error" className="text-sm text-red-700">
              {error}
            </p>
          )}

          {stream.error !== null && (
            <p role="alert" data-testid="generation-error" className="text-sm text-red-700">
              {stream.error.message}
            </p>
          )}

          {stream.text !== '' && (
            <pre
              data-testid="spec-stream"
              className="bg-canvas border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap"
            >
              {stream.text}
            </pre>
          )}

          {/*
            The research indicator (task 70; FR-019 AC-2). Distinct from ordinary generation on
            purpose: "reading the web" and "writing the document" take different amounts of time and
            a single spinner for both makes a slow search look like a stalled generation.
          */}
          {stream.researching && (
            <p className="text-ink-muted text-sm" data-testid="stream-researching">
              Reading current sources on the web…
            </p>
          )}

          {stream.status === 'reconnecting' && (
            <p className="text-ink-muted text-sm" data-testid="stream-reconnecting">
              The connection dropped. Reconnecting — nothing written so far is lost.
            </p>
          )}

          {/*
            Round 2, Д-1: **while a generation is in flight there must still be something to do.**
            The gate walk found the opposite — a stalled provider left the page with the generate
            control disabled, no cancel, and nothing else that moved the session. "Stop" is that
            something: it abandons the reader, publishes an `idle` state, and puts the generate
            control back. The run continues server-side and its chunks stay durable (P5), so
            stopping costs the user nothing but the wait.
          */}
          {(generating || runInFlight) && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" data-testid="stop-generation" onClick={stopFollowing}>
                Stop
              </Button>
              <span className="text-ink-muted text-xs">
                {generating
                  ? 'Generating… you can stop and start again; nothing written so far is lost.'
                  : 'A generation for this step is already running — this page is picking it up. Stop to take the page back; the run itself carries on either way.'}
              </span>
            </div>
          )}

          {!generating &&
            !runInFlight &&
            (generationBlocked ? (
              <p className="text-ink-muted text-sm" data-testid="generation-blocked">
                A question card is waiting for your answers above — nothing generates until it is
                submitted.
              </p>
            ) : !canGenerate ? (
              <p className="text-ink-muted text-sm" data-testid="generation-unavailable">
                This step does not draft a document. Use the controls above to move the session on.
              </p>
            ) : (
              <Button
                data-testid="generate-spec"
                onClick={() => {
                  void generate();
                }}
                className="self-start"
              >
                {stream.error !== null ? 'Try again' : 'Generate'}
              </Button>
            ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="spec-card">
      <CardHeader>
        <CardTitle>
          <span data-testid="spec-file-name">{revision.fileName}</span>
          <span className="text-ink-muted ml-2 text-xs font-normal">
            revision <span data-testid="spec-revision-number">{revision.revisionNumber}</span>
            {revision.approved ? ' · approved' : ' · awaiting your decision'}
          </span>
        </CardTitle>
        <CardDescription>
          {revision.approved
            ? 'Approved. It is included in the export.'
            : 'Nothing advances until you approve or ask for changes.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <pre
          data-testid="spec-content"
          className="bg-canvas border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap"
        >
          {revision.content}
        </pre>

        {error !== null && (
          <p role="alert" data-testid="spec-error" className="text-sm text-red-700">
            {error}
          </p>
        )}

        {!revision.approved && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Button
                data-testid="approve-spec"
                disabled={busy === 'approve'}
                onClick={() => {
                  void send('approve', `/api/specs/${revision.specFileId}/decision`, {
                    decision: 'approve',
                    revisionNumber: revision.revisionNumber,
                  });
                }}
              >
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                variant="secondary"
                data-testid="request-changes"
                disabled={busy === 'changes'}
                onClick={() => {
                  setShowInstruction(true);
                }}
              >
                Request changes
              </Button>
            </div>

            {showInstruction && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="instruction">What should change?</Label>
                <Textarea
                  id="instruction"
                  data-testid="change-instruction"
                  value={instruction}
                  onChange={(event) => {
                    setInstruction(event.target.value);
                  }}
                  placeholder="Tighten the scope section and add a non-goal."
                />
                <Button
                  data-testid="submit-changes"
                  disabled={busy === 'changes' || instruction.trim() === ''}
                  onClick={() => {
                    void send('changes', `/api/specs/${revision.specFileId}/decision`, {
                      decision: 'request_changes',
                      instruction,
                    });
                  }}
                  className="self-start"
                >
                  {busy === 'changes' ? 'Revising…' : 'Send instruction'}
                </Button>
              </div>
            )}
          </div>
        )}

        {target !== null && (
          <div className="flex flex-col gap-1">
            <Button
              variant={target.ready ? 'primary' : 'secondary'}
              data-testid="proceed"
              disabled={busy === 'proceed' || !target.ready}
              onClick={() => {
                void proceed(target);
              }}
              className="self-start"
            >
              {busy === 'proceed' ? 'Checking the gate…' : target.label}
            </Button>

            {!target.ready && target.unmet.length > 0 && (
              <p className="text-ink-muted text-xs" data-testid="proceed-unmet">
                still needed: {target.unmet.join(', ')}
              </p>
            )}
          </div>
        )}

        {/*
          Round 5, Р-3 item 2. The invariant that round 2 gave the stream now covers this card's
          requests as well: for as long as one is in flight there is a live control and a number
          that keeps moving. `proceed` from here is the transition that produces the review, so
          this is the wait that could last minutes and used to look like death.
        */}
        {busy !== null && (
          <WaitingOn
            what={WAITING_FOR[busy] ?? 'the server'}
            elapsedSeconds={elapsedSeconds}
            onStop={abandon}
          />
        )}
      </CardContent>
    </Card>
  );
}
