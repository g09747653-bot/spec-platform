import { UNPACKED_TARGET } from '../capacity';
import type { ProviderEntry } from '../provider-registry';
import type { ProviderStream } from '../providers';
import { documentFromPrompt } from '../test-double';
import type { ProviderId } from '../types';

/**
 * Hand-built provider entries for the adapter suite (task 52; IR-001-AC-5; NFR-012 AC-5).
 *
 * Not one of these touches a network, an SDK object, or a credential. That is the requirement — no
 * automated test may reach a vendor — and it is also the proof of task 42's acceptance criterion:
 * the failover client is satisfied by entries assembled entirely from our own types, so nothing
 * vendor-shaped has leaked into the interface it consumes.
 */

export interface FakeBehaviour {
  /** Text to stream, split into whitespace-preserving chunks. */
  document?: string;
  /**
   * Answer the prompt instead: write the sections it asked for, in the order it asked for them.
   *
   * What a conformant document looks like is the section schema's business, so a test that needs one
   * derives it the same way the application does rather than spelling headings out (constitution P3).
   */
  followPrompt?: boolean;
  /** Fail after this many chunks. `0` refuses before streaming anything. */
  failAfterChunks?: number;
  /** Never resolve, so the caller's per-provider timeout is what ends the attempt. */
  hang?: boolean;
  /** Milliseconds between chunks. */
  delayMs?: number;
}

export class FakeProviderError extends Error {
  constructor(provider: ProviderId) {
    super(`fake ${provider} failure`);
    this.name = 'FakeProviderError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Splits on whitespace boundaries so joining the chunks reproduces the input byte for byte. */
export function chunksOf(text: string): string[] {
  return text.split(/(?<=\s)/).filter((chunk) => chunk !== '');
}

export function fakeProviderStream(id: ProviderId, behaviour: FakeBehaviour = {}): ProviderStream {
  return async ({ messages, onDelta, signal }) => {
    if (behaviour.hang === true) {
      return new Promise<string>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            reject(new FakeProviderError(id));
          },
          { once: true },
        );
      });
    }

    const document =
      behaviour.followPrompt === true
        ? documentFromPrompt(messages.map((message) => message.content).join('\n'))
        : (behaviour.document ?? `text from ${id}. `);

    const chunks = chunksOf(document);
    let emitted = 0;

    for (const chunk of chunks) {
      if (behaviour.failAfterChunks !== undefined && emitted >= behaviour.failAfterChunks) {
        throw new FakeProviderError(id);
      }

      signal?.throwIfAborted();
      if (behaviour.delayMs !== undefined) await sleep(behaviour.delayMs);

      onDelta(chunk);
      emitted += 1;
    }

    if (behaviour.failAfterChunks !== undefined && emitted >= behaviour.failAfterChunks) {
      throw new FakeProviderError(id);
    }

    return chunks.join('');
  };
}

export function fakeEntry(
  id: ProviderId,
  behaviour: FakeBehaviour = {},
  priority = 1,
): ProviderEntry {
  return {
    id,
    model: `${id}-test-model`,
    priority,
    // A fake provider has no window; declaring the unpacked one keeps these tests about failover.
    capacity: UNPACKED_TARGET.capacity,
    stream: fakeProviderStream(id, behaviour),
  };
}

/** A chain in attempt order, with priorities filled in from the position. */
export function fakeChain(
  ...entries: readonly (readonly [ProviderId, FakeBehaviour])[]
): ProviderEntry[] {
  return entries.map(([id, behaviour], index) => fakeEntry(id, behaviour, index + 1));
}
