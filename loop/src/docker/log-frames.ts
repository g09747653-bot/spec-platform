import type { Readable } from 'node:stream';

/**
 * Demultiplexing the Docker log stream (task 154; consumed by task 155).
 *
 * A container started without a TTY does not hand back plain text. Its stdout and stderr are
 * interleaved on one connection in frames: one byte of stream id, three zero bytes, a big-endian
 * 32-bit length, then that many bytes of payload. Reading that stream as if it were text puts a
 * four-byte header in the middle of every log line the operator reads — and the header bytes are
 * control characters, so it corrupts the line rather than merely decorating it.
 *
 * Frames also split across TCP reads, and a payload can carry a partial UTF-8 sequence or half a
 * line. Both are buffered here so a consumer receives whole lines of whole characters: the SSE feed
 * writes them straight to the page, and a broken multi-byte character there is a mojibake nobody can
 * distinguish from a genuinely mangled log.
 */

export type LogStream = 'stdout' | 'stderr';

export interface LogLine {
  stream: LogStream;
  text: string;
}

const HEADER = 8;

/**
 * Reads a Docker multiplexed stream and yields complete lines.
 *
 * A trailing fragment with no newline is flushed when the stream ends: the last line of a process
 * that exits without one is still a line, and it is often the interesting one.
 */
export async function* readLogFrames(source: Readable): AsyncGenerator<LogLine> {
  let buffered = Buffer.alloc(0);
  const partial: Record<LogStream, string> = { stdout: '', stderr: '' };
  const decoder = new TextDecoder('utf8');

  for await (const chunk of source) {
    buffered = Buffer.concat([buffered, chunk as Buffer]);

    while (buffered.length >= HEADER) {
      const stream: LogStream = buffered[0] === 2 ? 'stderr' : 'stdout';
      const length = buffered.readUInt32BE(4);

      if (buffered.length < HEADER + length) break;

      const payload = buffered.subarray(HEADER, HEADER + length);
      buffered = buffered.subarray(HEADER + length);

      // `stream: true` keeps a split multi-byte character until its remaining bytes arrive.
      partial[stream] += decoder.decode(payload, { stream: true });

      const lines = partial[stream].split('\n');
      partial[stream] = lines.pop() ?? '';

      for (const text of lines) yield { stream, text: text.replace(/\r$/, '') };
    }
  }

  for (const stream of ['stdout', 'stderr'] as const) {
    const rest = partial[stream];
    if (rest !== '') yield { stream, text: rest.replace(/\r$/, '') };
  }
}

/** Frames a payload the way the daemon does — used by the tests, and by nothing else. */
export function frame(stream: LogStream, text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(HEADER);

  header[0] = stream === 'stderr' ? 2 : 1;
  header.writeUInt32BE(payload.length, 4);

  return Buffer.concat([header, payload]);
}
