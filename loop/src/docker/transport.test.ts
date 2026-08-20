import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { frame, readLogFrames } from './log-frames.ts';
import { DEFAULT_UNIX_SOCKET, DEFAULT_WINDOWS_PIPE, resolveEndpoint } from './transport.ts';

/**
 * The platform seam and the log demultiplexer (task 154).
 *
 * The named-pipe branch has to be provable on CI, where no named pipe exists — so the platform is a
 * parameter, and both branches are reachable from either operating system. The live pipe is
 * exercised at the gate, on the customer's machine; what is asserted here is the *choice*.
 */
describe('the Docker endpoint seam (task 154)', () => {
  it('chooses the Windows named pipe on win32', () => {
    expect(resolveEndpoint('win32')).toEqual({
      kind: 'npipe',
      socketPath: DEFAULT_WINDOWS_PIPE,
      display: `npipe://${DEFAULT_WINDOWS_PIPE}`,
    });
  });

  it('names the A0 pipe exactly — the daemon exposes several, and only one is the contract', () => {
    expect(DEFAULT_WINDOWS_PIPE).toBe(String.raw`\\.\pipe\docker_engine`);
  });

  it.each(['linux', 'darwin'] as const)('chooses the Unix socket on %s', (platform) => {
    expect(resolveEndpoint(platform)).toEqual({
      kind: 'unix',
      socketPath: DEFAULT_UNIX_SOCKET,
      display: `unix://${DEFAULT_UNIX_SOCKET}`,
    });
  });

  it('lets each platform be overridden from .env, and only by its own variable', () => {
    const overrides = {
      DOCKER_ENGINE_PIPE: String.raw`\\.\pipe\dockerDesktopLinuxEngine`,
      DOCKER_ENGINE_SOCKET: '/run/user/1000/docker.sock',
    };

    expect(resolveEndpoint('win32', overrides).socketPath).toBe(overrides.DOCKER_ENGINE_PIPE);
    expect(resolveEndpoint('linux', overrides).socketPath).toBe(overrides.DOCKER_ENGINE_SOCKET);

    // A socket override on Windows is not a Windows endpoint, and must not become one.
    expect(
      resolveEndpoint('win32', { DOCKER_ENGINE_SOCKET: '/var/run/other.sock' }).socketPath,
    ).toBe(DEFAULT_WINDOWS_PIPE);
  });

  it('treats an absent override as absent rather than as an empty path', () => {
    expect(resolveEndpoint('linux', { DOCKER_ENGINE_SOCKET: undefined }).socketPath).toBe(
      DEFAULT_UNIX_SOCKET,
    );
  });
});

describe('the multiplexed log stream (task 154)', () => {
  const collect = async (chunks: Buffer[]) => {
    const lines = [];
    for await (const line of readLogFrames(Readable.from(chunks))) lines.push(line);
    return lines;
  };

  it('separates stdout from stderr', async () => {
    expect(await collect([frame('stdout', 'building\n'), frame('stderr', 'warning\n')])).toEqual([
      { stream: 'stdout', text: 'building' },
      { stream: 'stderr', text: 'warning' },
    ]);
  });

  it('yields one line per line, however the frames fall', async () => {
    expect(await collect([frame('stdout', 'one\ntwo\nthree\n')])).toEqual([
      { stream: 'stdout', text: 'one' },
      { stream: 'stdout', text: 'two' },
      { stream: 'stdout', text: 'three' },
    ]);
  });

  it('joins a line split across two frames', async () => {
    expect(await collect([frame('stdout', 'half a '), frame('stdout', 'line\n')])).toEqual([
      { stream: 'stdout', text: 'half a line' },
    ]);
  });

  it('joins a frame split across two reads', async () => {
    const whole = frame('stdout', 'сообщение\n');

    expect(await collect([whole.subarray(0, 5), whole.subarray(5)])).toEqual([
      { stream: 'stdout', text: 'сообщение' },
    ]);
  });

  it('keeps a multi-byte character whole across a frame boundary', async () => {
    // Cyrillic is two bytes per character in UTF-8, and the loop's own logs are in Russian: a
    // decoder that flushed per frame would turn every split character into two replacement marks.
    const bytes = Buffer.from('привет\n', 'utf8');

    expect(
      await collect([
        frame('stdout', '').subarray(0, 0), // no-op, keeps the shape of the case readable
        framed(bytes.subarray(0, 5)),
        framed(bytes.subarray(5)),
      ]),
    ).toEqual([{ stream: 'stdout', text: 'привет' }]);
  });

  it('flushes a last line that never got its newline', async () => {
    expect(await collect([frame('stdout', 'done')])).toEqual([{ stream: 'stdout', text: 'done' }]);
  });

  it('strips the carriage return a Windows-built image writes', async () => {
    expect(await collect([frame('stdout', 'line\r\n')])).toEqual([
      { stream: 'stdout', text: 'line' },
    ]);
  });

  it('yields nothing at all for an empty stream', async () => {
    expect(await collect([])).toEqual([]);
  });
});

/** A stdout frame around raw bytes — for the split-character case, which cannot go through a string. */
function framed(payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header[0] = 1;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
