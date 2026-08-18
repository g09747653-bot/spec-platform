import { describe, expect, it, vi } from 'vitest';

import { REASON_EXPLANATION } from './gate-copy';
import {
  ABANDONED_NOTICE,
  createSessionRequest,
  expiredNotice,
  FALLBACK_FAILURE_NOTICE,
  UNREACHABLE_NOTICE,
  type SessionRequestState,
} from './session-request';

/**
 * Round 5, Р-3 — **a request that moves the session always ends, and always says how.**
 *
 * The gate died in front of a request that had none of these properties: no deadline, no way to
 * abandon it, and a refusal reported as a sentence written at the call site. Each one is a test
 * here, because each one is what the page needed and did not have.
 *
 * Nothing waits on a real clock: `sleep` is the injected deadline and `fetchImpl` the injected
 * server, exactly as the stream reader's tests do it.
 */
const NEVER = () => new Promise<void>(() => undefined);

/** A server that never answers, and rejects the way `fetch` does when the signal aborts. */
function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })) as unknown as typeof fetch;
}

function answering(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(Response.json(body, { status }));
}

/** The states published, in order, so "what did the page see while it ran" is assertable. */
function recorder() {
  const states: SessionRequestState[] = [];
  return { states, onState: (state: SessionRequestState) => states.push(state) };
}

describe('a session-moving request', () => {
  it('publishes a running state a live control can be rendered from', async () => {
    const { states, onState } = recorder();

    const request = createSessionRequest({
      onState,
      fetchImpl: answering(200, { stage: 'constitution' }),
      sleep: NEVER,
      now: () => 1_000,
    });

    const result = await request.send('proceed', '/api/sessions/s/transition', { toStage: 'x' });

    expect(states[0]).toEqual({
      running: 'proceed',
      startedAt: 1_000,
      notice: null,
      noticeKind: null,
      noticeReason: null,
    });
    expect(states.at(-1)).toEqual({
      running: null,
      startedAt: null,
      notice: null,
      noticeKind: null,
      noticeReason: null,
    });
    expect(result).toEqual({ ok: true, payload: { stage: 'constitution' } });
  });

  it('reports a refusal in the words of the reason the gate gave', async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      sleep: NEVER,
      fetchImpl: answering(409, {
        error: {
          code: 'GATE_REJECTED',
          message: 'That step is not available yet — the page lists what is still needed for it.',
          details: { reason: 'NO_ANSWERED_ROUND' },
        },
      }),
    });

    const result = await request.send('proceed', '/api/sessions/s/transition');

    expect(result.ok).toBe(false);
    expect(request.state.notice).toBe(REASON_EXPLANATION.NO_ANSWERED_ROUND);
    // Task 143: the sentence is the user's, the code is the test's — asserted against the same
    // refusal so a hand-written RU explanation cannot make this suite red.
    expect(request.state.noticeKind).toBe('refused');
    expect(request.state.noticeReason).toBe('NO_ANSWERED_ROUND');
    expect(request.state.running).toBeNull();
  });

  it('explains an exhausted question budget rather than naming its code', async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      sleep: NEVER,
      fetchImpl: answering(409, {
        error: {
          code: 'ROUND_LIMIT_REACHED',
          message: 'anything',
          details: { reason: 'ROUND_LIMIT_REACHED' },
        },
      }),
    });

    await request.send('ask', '/api/sessions/s/rounds');

    expect(request.state.notice).toBe(REASON_EXPLANATION.ROUND_LIMIT_REACHED);
    expect(request.state.notice).not.toContain('ROUND_LIMIT_REACHED');
    // The code the words deliberately do not name is still there for anything that has to know it.
    expect(request.state.noticeKind).toBe('refused');
    expect(request.state.noticeReason).toBe('ROUND_LIMIT_REACHED');
  });

  it("falls back to the handler's message when the rejection carries no reason", async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      sleep: NEVER,
      fetchImpl: answering(422, {
        error: { code: 'VALIDATION_FAILED', message: 'The request was not valid.' },
      }),
    });

    await request.send('fallback', '/api/sessions/s/answers');

    expect(request.state.notice).toBe('The request was not valid.');
    // Still a refusal; there was simply no code to carry with it.
    expect(request.state.noticeKind).toBe('refused');
    expect(request.state.noticeReason).toBeNull();
  });

  it('says something even when the failure carries nothing at all', async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      sleep: NEVER,
      fetchImpl: answering(500, 'not json at all'),
    });

    await request.send('proceed', '/api/sessions/s/transition');

    expect(request.state.notice).toBe(FALLBACK_FAILURE_NOTICE);
    expect(request.state.noticeKind).toBe('refused');
    expect(request.state.noticeReason).toBeNull();
  });

  /*
   * The defect itself. Before the fix this awaited a `fetch` with no timeout, so the control that
   * started it stayed disabled for as long as the server held the socket — which is forever, when
   * the socket is held by something that is never going to answer.
   */
  it('stops believing the server once its own worst case has passed', async () => {
    const { onState } = recorder();
    const sleep = vi.fn(() => Promise.resolve());

    const request = createSessionRequest({
      onState,
      fetchImpl: hangingFetch(),
      sleep,
      deadlineMs: 615_000,
    });

    const result = await request.send('proceed', '/api/sessions/s/transition');

    expect(sleep).toHaveBeenCalledWith(615_000);
    expect(result.ok).toBe(false);
    expect(request.state.running).toBeNull();
    expect(request.state.notice).toBe(expiredNotice(615_000));
    // Named in seconds, because that is the unit the user waited in.
    expect(request.state.notice).toContain('615 s');
    // The backstop firing is its own ending, not the user's choice to stop waiting.
    expect(request.state.noticeKind).toBe('expired');
    expect(request.state.noticeReason).toBeNull();
  });

  it('can be abandoned while it is still running, and says so', async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      fetchImpl: hangingFetch(),
      sleep: NEVER,
    });

    const pending = request.send('proceed', '/api/sessions/s/transition');

    // The state a renderer offers `stop-waiting` from.
    expect(request.state.running).toBe('proceed');
    expect(request.state.startedAt).not.toBeNull();

    request.abandon();
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(request.state.running).toBeNull();
    expect(request.state.notice).toBe(ABANDONED_NOTICE);
    expect(request.state.noticeKind).toBe('abandoned');
    expect(request.state.noticeReason).toBeNull();
  });

  it('tells a dropped connection apart from a request the user abandoned', async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      sleep: NEVER,
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    await request.send('proceed', '/api/sessions/s/transition');

    expect(request.state.notice).toBe(UNREACHABLE_NOTICE);
    // The token keeps the two apart the same way the words do — and without reading the words.
    expect(request.state.noticeKind).toBe('unreachable');
    expect(request.state.noticeReason).toBeNull();
  });

  it('refuses a second request while one is in flight', async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      fetchImpl: hangingFetch(),
      sleep: NEVER,
    });

    const first = request.send('proceed', '/api/sessions/s/transition');
    const second = await request.send('ask', '/api/sessions/s/rounds');

    expect(second).toEqual({ ok: false, payload: null });
    // The first is untouched: still running, still the action the user started.
    expect(request.state.running).toBe('proceed');

    request.abandon();
    await first;
  });

  /*
   * Task 125. The connection banner is built from what these requests already learn, so what they
   * report — and what they deliberately do not — is the whole contract behind it.
   */
  describe('reporting whether the server was reachable', () => {
    it('reports reachable when a response arrives, whatever it says', async () => {
      const { onState } = recorder();
      const reachability = vi.fn();

      const request = createSessionRequest({
        onState,
        sleep: NEVER,
        onReachability: reachability,
        fetchImpl: answering(409, {
          error: { code: 'CONFLICT', message: 'The session moved on.' },
        }),
      });

      await request.send('proceed', '/api/sessions/s/transition');

      // A 409 is the server answering. Only the network's silence is a lost connection.
      expect(reachability).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('reports unreachable when the request never got there', async () => {
      const { onState } = recorder();
      const reachability = vi.fn();

      const request = createSessionRequest({
        onState,
        sleep: NEVER,
        onReachability: reachability,
        fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
      });

      await request.send('proceed', '/api/sessions/s/transition');

      expect(reachability).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('reports nothing when the user abandoned the wait', async () => {
      const { onState } = recorder();
      const reachability = vi.fn();

      const request = createSessionRequest({
        onState,
        sleep: NEVER,
        onReachability: reachability,
        fetchImpl: hangingFetch(),
      });

      const inFlight = request.send('proceed', '/api/sessions/s/transition');
      request.abandon();
      await inFlight;

      // The user stopped waiting; that says nothing about the server, and a banner claiming it had
      // gone would be the page inventing a fault out of a user's choice.
      expect(reachability).not.toHaveBeenCalled();
    });

    it('reports nothing when its own deadline expired', async () => {
      const { onState } = recorder();
      const reachability = vi.fn();
      const fired: (() => void)[] = [];

      const request = createSessionRequest({
        onState,
        deadlineMs: 1_000,
        onReachability: reachability,
        fetchImpl: hangingFetch(),
        sleep: () => new Promise<void>((resolve) => fired.push(resolve)),
      });

      const inFlight = request.send('proceed', '/api/sessions/s/transition');
      fired.forEach((release) => {
        release();
      });
      await inFlight;

      expect(request.state.notice).toBe(expiredNotice(1_000));
      // A server past its own worst case may still be working. "Slow" is not "gone".
      expect(reachability).not.toHaveBeenCalled();
    });
  });

  it('clears a notice on request, so the next interaction starts clean', async () => {
    const { onState } = recorder();

    const request = createSessionRequest({
      onState,
      sleep: NEVER,
      fetchImpl: answering(409, { error: { code: 'CONFLICT', message: 'The session moved on.' } }),
    });

    await request.send('proceed', '/api/sessions/s/transition');
    expect(request.state.notice).not.toBeNull();
    expect(request.state.noticeKind).toBe('refused');

    request.dismiss();
    expect(request.state.notice).toBeNull();
    // Dismissing takes the whole ending with it: a token left behind would outlive its own sentence.
    expect(request.state.noticeKind).toBeNull();
    expect(request.state.noticeReason).toBeNull();
  });
});
