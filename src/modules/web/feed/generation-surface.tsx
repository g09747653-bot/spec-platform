'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useGenerationStream } from '../session/generation-context';
import { Button } from '../ui/button';
import { EyeIcon } from '../ui/icons';
import { useViewerControl } from '../viewer/viewer-control';

import { BlockCaption } from './bubbles';
import type { TailPrimary } from './tail-primary';

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
  /**
   * Which control the tail says is the loud one (task 142).
   *
   * Handed in rather than decided here: this card cannot see the door out of the stage or the
   * refinement box, and deciding on its own is exactly how three primaries ended up stacked in the
   * customer's screenshot. `tail-primary.ts` is where the answer is worked out.
   */
  primary?: TailPrimary;
}

export function GenerationSurface({
  sessionId,
  stage,
  activeRun,
  canGenerate,
  blocked,
  revisionOwed = null,
  primary = null,
}: GenerationSurfaceProps) {
  const router = useRouter();
  /*
   * The session's reader, not one of this card's own (task 138). Lifting it to the surface is what
   * lets the viewer pane show the same words as they arrive without opening a second stream — and
   * what makes `Stop` here and `Stop` there the same control over the same run.
   */
  const { state: stream, start, resume, detached, detach } = useGenerationStream();
  const viewerControl = useViewerControl();

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

  /*
   * What pressing the control would do, as a token: `retry` after a failed attempt, `apply-review`
   * when the board sent the document back, `generate` when this is the step the session is waiting
   * on, and `regenerate` over a document that is already written (task 143). Worked out from the
   * same conditions in the same order as the label below, so the token and the words cannot come
   * apart — the label is free to be re-worded or translated, and this is what a walk reads instead.
   */
  const action: 'retry' | 'apply-review' | 'generate' | 'regenerate' =
    stream.error !== null
      ? 'retry'
      : owed !== null
        ? 'apply-review'
        : primary === 'generate-spec'
          ? 'generate'
          : 'regenerate';

  return (
    <div
      className="border-border-subtle bg-surface flex w-full flex-col gap-3 rounded-xl border p-4"
      data-testid="generation-surface"
    >
      <div className="flex items-center justify-between gap-2">
        <BlockCaption stage={stage} trailing="drafting" />

        {/*
          The eye, on a document that is still being written (task 138 AC — «generating» is one of
          the three states). It opens the same reader in the pane, so a person can watch the
          document take shape at reading width instead of through the card's excerpt.
        */}
        {viewerControl !== null && (generating || stream.text !== '') && (
          <button
            type="button"
            data-testid="open-viewer-live"
            aria-label="Open this document in the viewer"
            title="Open in the viewer"
            className="text-foreground-muted hover:text-foreground inline-flex items-center gap-1.5 text-xs"
            onClick={() => {
              viewerControl.open({ kind: 'live', stage, fileName: 'Draft in progress' });
            }}
          >
            <EyeIcon />
            Open
          </button>
        )}
      </div>

      {stream.error !== null && (
        <p role="alert" data-testid="generation-error" className="text-sm text-danger-ink">
          {stream.error.message}
        </p>
      )}

      {stream.text !== '' && (
        <pre
          data-testid="spec-stream"
          className="bg-background border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap"
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
        <p className="text-foreground-muted text-sm" data-testid="stream-researching">
          Reading current sources on the web…
        </p>
      )}

      {/*
        Waiting is not an error, and the page should say which one it is (round 5, Р-4; А-9).

        Between the `run` event and the first token there can be minutes: a provider working through
        a quota back-off before the chain fails over, a local model reading a long prompt, a local
        model reasoning before it writes prose. The connection is alive throughout — the heartbeat
        is what proves it — so the honest thing to render is what is being waited for, not a
        spinner that looks the same as one over a broken socket.
      */}
      {stream.status === 'streaming' && stream.text === '' && !stream.researching && (
        <p className="text-foreground-muted text-sm" data-testid="stream-waiting">
          Waiting for the first words. A local model can think for a minute or two before it starts
          writing — nothing is stuck, and nothing is lost if you stop.
        </p>
      )}

      {stream.status === 'reconnecting' && (
        <p className="text-foreground-muted text-sm" data-testid="stream-reconnecting">
          The connection dropped. Reconnecting — nothing written so far is lost.
        </p>
      )}

      {(generating || runInFlight) && (
        <div className="flex items-center gap-2">
          {/*
            Promoted while a run is in flight, because then it is the only control on the page that
            does anything: Generate is gone, the door is refused by the gate, and «stop and start
            again» is the whole of what a reader can do about a generation they are watching.
          */}
          <Button
            variant={primary === 'stop-generation' ? 'primary' : 'secondary'}
            data-testid="stop-generation"
            onClick={detach}
          >
            Stop
          </Button>
          <span className="text-foreground-muted text-xs">
            {generating
              ? 'Generating… you can stop and start again; nothing written so far is lost.'
              : 'A generation for this step is already running — this page is picking it up. Stop to take the page back; the run itself carries on either way.'}
          </span>
        </div>
      )}

      {idle &&
        (blocked ? (
          <p className="text-foreground-muted text-sm" data-testid="generation-blocked">
            A question card is waiting for your answers above — nothing generates until it is
            submitted.
          </p>
        ) : !canGenerate ? (
          <p className="text-foreground-muted text-sm" data-testid="generation-unavailable">
            This step does not draft a document. Use the controls below to move the session on.
          </p>
        ) : (
          <>
            {owed !== null && (
              <p className="text-foreground-muted text-sm" data-testid="revision-owed">
                The review sent this document back with {owed.points}{' '}
                {owed.points === 1 ? 'point' : 'points'} ticked. Rewriting applies exactly those and
                leaves the rest as it stands.
              </p>
            )}
            {/*
              Loud while there is something to write, quiet once the document is written and
              approved — and it says which of the two it is. «Generate» over a document that already
              exists and has already been approved was the button the customer's eye went to first,
              and pressing it was never the next step.
            */}
            <Button
              variant={primary === 'generate-spec' ? 'primary' : 'secondary'}
              data-testid="generate-spec"
              data-action={action}
              onClick={() => {
                void generate();
              }}
              className="self-start"
            >
              {stream.error !== null
                ? 'Try again'
                : owed !== null
                  ? 'Apply the review points'
                  : primary === 'generate-spec'
                    ? 'Generate'
                    : 'Write it again'}
            </Button>
          </>
        ))}
    </div>
  );
}
