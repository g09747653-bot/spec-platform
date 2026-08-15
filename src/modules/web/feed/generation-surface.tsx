'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../ui/button';
import { useResumableStream } from '../session/useResumableStream';

import { BlockCaption } from './bubbles';

/**
 * Where a document is written into the conversation (tasks 105, 107; FR-008, FR-018).
 *
 * One surface, two ways in — starting a generation and coming back to one already running — because
 * they are the same card from the reader's side and the M3 resume rule is about exactly that: the
 * page that returns mid-generation must pick the run up, not offer a second one.
 *
 * The three defects of round 5 are all properties of this component:
 *
 * - **D-99** — a run the server reported in flight is reattached to in an effect, replaying the
 *   durable chunk log from the start; the reader's de-duplication by sequence is what makes that safe.
 * - **D-100/D-101** — while such a run is in flight the control on offer is `Stop`, never `Generate`,
 *   and "in flight" is the complement of the terminal statuses rather than `status = 'running'`,
 *   because a run that has moved to the next provider sits in `restarted` for as long as that
 *   provider takes.
 * - **Д-1** — `Stop` exists at all. It abandons the *reader*; the run carries on server-side and its
 *   chunks stay durable, so stopping costs the wait and nothing else.
 */
interface GenerationSurfaceProps {
  sessionId: string;
  stage: string;
  /** The run the server says is in flight, or `null`. Known before any of this code has run. */
  activeRun: { runId: string; attempt: number } | null;
  /** Whether the position drafts a document at all (round 2, Д-4). */
  canGenerate: boolean;
  /** True while a question card awaits submission: generation is blocked (FR-005 AC-4). */
  blocked: boolean;
  /**
   * The rewrite the review board asked for, when the stage owes one (task 113).
   *
   * It changes what the control *says*, not what it does: the same endpoint, the same run, the same
   * context — which already carries the ticked points (task 57). A button labelled "Generate" over a
   * document that exists is a button whose effect the user has to infer, and the effect here is
   * specific: apply these N points and change nothing else.
   */
  revisionOwed?: { specType: string; points: number } | null;
}

export function GenerationSurface({
  sessionId,
  stage,
  activeRun,
  canGenerate,
  blocked,
  revisionOwed = null,
}: GenerationSurfaceProps) {
  const router = useRouter();
  const { state: stream, start, resume, stop } = useResumableStream();
  const [detached, setDetached] = useState(false);

  const generating = stream.status === 'streaming' || stream.status === 'reconnecting';
  const runId = activeRun?.runId ?? null;
  const attempt = activeRun?.attempt ?? 1;

  /*
   * The server's claim, yielding to anything more recent. See the long note this replaces on the
   * spec card: the snapshot is what makes "no Generate over a live run" a property of the render
   * rather than of an effect's timing, and `runSettled` is what stops it outliving the run.
   */
  const runSettled = stream.status === 'complete' || stream.status === 'failed';
  const runInFlight = runId !== null && !detached && !runSettled;

  const attachedTo = useRef<string | null>(null);

  useEffect(() => {
    if (runId === null || detached || stream.status !== 'idle') return;
    if (attachedTo.current === runId) return;

    attachedTo.current = runId;

    void resume(runId, -1, attempt).then((outcome) => {
      if (outcome.status === 'complete') router.refresh();
    });

    return () => {
      attachedTo.current = null;
    };
  }, [runId, attempt, detached, stream.status, resume, router]);

  function stopFollowing() {
    setDetached(true);
    stop();
  }

  async function generate() {
    const outcome = await start(sessionId);

    // The revision is persisted before `complete` is sent, so refreshing here shows the card the
    // server would render on a reload — the same state, arrived at two ways (FR-017 AC-4).
    if (outcome.status === 'complete') router.refresh();
  }

  const idle = !generating && !runInFlight;
  /** Only this stage's own debt: another stage's owed rewrite is not this card's business. */
  const owed = revisionOwed !== null && revisionOwed.specType === stage ? revisionOwed : null;

  /*
   * Nothing to say: the position does not draft, no card is holding drafting up, nothing is
   * running, and no attempt has failed. `blocked` is in the condition because "a question card is
   * waiting for your answers" is the one thing worth saying at a position that cannot draft —
   * without it, answering a round would silently be the *only* explanation for why the button that
   * was there a moment ago is gone.
   */
  if (idle && !canGenerate && !blocked && stream.error === null && stream.text === '') {
    return null;
  }

  return (
    <div
      className="border-border-subtle bg-surface flex w-full max-w-[46rem] flex-col gap-3 rounded-xl border p-4"
      data-testid="generation-surface"
    >
      <BlockCaption stage={stage} trailing="drafting" />

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
        The research indicator (task 70; FR-019 AC-2). Distinct from ordinary generation on purpose:
        "reading the web" and "writing the document" take different amounts of time, and one spinner
        for both makes a slow search look like a stalled generation.
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

      {idle &&
        (blocked ? (
          <p className="text-ink-muted text-sm" data-testid="generation-blocked">
            A question card is waiting for your answers above — nothing generates until it is
            submitted.
          </p>
        ) : !canGenerate ? (
          <p className="text-ink-muted text-sm" data-testid="generation-unavailable">
            This step does not draft a document. Use the controls below to move the session on.
          </p>
        ) : (
          <>
            {owed !== null && (
              <p className="text-ink-muted text-sm" data-testid="revision-owed">
                The review sent this document back with {owed.points}{' '}
                {owed.points === 1 ? 'point' : 'points'} ticked. Rewriting applies exactly those and
                leaves the rest as it stands.
              </p>
            )}
            <Button
              data-testid="generate-spec"
              onClick={() => {
                void generate();
              }}
              className="self-start"
            >
              {stream.error !== null
                ? 'Try again'
                : owed !== null
                  ? 'Apply the review points'
                  : 'Generate'}
            </Button>
          </>
        ))}
    </div>
  );
}
