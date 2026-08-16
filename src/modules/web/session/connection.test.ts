import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectionFromStream,
  connectionServerSnapshot,
  connectionSnapshot,
  reportCheckingConnection,
  reportServerAnswered,
  reportServerUnreachable,
  resetConnectionForTest,
  STREAM_DISCONNECTED,
  subscribeConnection,
} from './connection';

/**
 * The connection store (task 125).
 *
 * What is worth asserting here is not that a setter sets — it is the two judgements the store makes
 * about what the existing request paths report, because both are places where an over-eager banner
 * would appear over a working page.
 */
describe('connection state', () => {
  beforeEach(() => {
    resetConnectionForTest();
  });

  it('starts online and notifies only on a change', () => {
    const listener = vi.fn();
    subscribeConnection(listener);

    expect(connectionSnapshot()).toBe('online');

    reportServerAnswered();
    expect(listener).not.toHaveBeenCalled();

    reportServerUnreachable();
    expect(connectionSnapshot()).toBe('lost');
    expect(listener).toHaveBeenCalledTimes(1);

    reportServerUnreachable();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears a lost connection the moment anything reaches the server', () => {
    reportServerUnreachable();
    reportServerAnswered();

    expect(connectionSnapshot()).toBe('online');
  });

  it('distinguishes "asked to reconnect" from "reconnected"', () => {
    reportServerUnreachable();
    reportCheckingConnection();

    // Not `online`: the re-read has been requested and has not answered yet. Saying otherwise would
    // be the page guessing on the user's behalf.
    expect(connectionSnapshot()).toBe('checking');

    reportServerAnswered();
    expect(connectionSnapshot()).toBe('online');
  });

  it('unsubscribes', () => {
    const listener = vi.fn();
    const stop = subscribeConnection(listener);

    stop();
    reportServerUnreachable();

    expect(listener).not.toHaveBeenCalled();
  });

  it('renders as online on the server, where a render is proof of reachability', () => {
    expect(connectionServerSnapshot()).toBe('online');
  });
});

describe('what a stream reader says about the connection', () => {
  it('treats reconnecting as lost and reading as online', () => {
    expect(connectionFromStream({ status: 'reconnecting', error: null })).toBe('lost');
    expect(connectionFromStream({ status: 'streaming', error: null })).toBe('online');
    expect(connectionFromStream({ status: 'complete', error: null })).toBe('online');
  });

  it('treats a reader that ran out of reconnects as lost', () => {
    expect(connectionFromStream({ status: 'failed', error: { code: STREAM_DISCONNECTED } })).toBe(
      'lost',
    );
  });

  /*
   * The judgement that matters. The reader also ends in `failed` when the *run* failed — the
   * provider chain refused it — with the server perfectly reachable and its message already on the
   * card. A banner saying "the server stopped answering" over that would be false, and would train
   * people to ignore it for the times it is true.
   */
  it('says nothing about a failed run, which is not an unreachable server', () => {
    expect(
      connectionFromStream({ status: 'failed', error: { code: 'GENERATION_FAILED' } }),
    ).toBeNull();
    expect(connectionFromStream({ status: 'idle', error: null })).toBeNull();
  });
});
