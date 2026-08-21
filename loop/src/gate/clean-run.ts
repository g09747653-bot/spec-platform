import type { DockerEngine } from '../docker/engine.ts';
import { readLogFrames } from '../docker/log-frames.ts';
import { bindMount } from '../docker/paths.ts';

/**
 * One command, in a fresh container, over a copy of the code (tasks 157, 161).
 *
 * Lifted out of `accept.ts` when the controller arrived, because the two need exactly the same
 * thing and for the same reasons: a container that has never met the executor, a copy rather than
 * the workspace, both streams collected in arrival order, and a bound the caller owns. A second
 * near-identical runner beside it would be the place where one of the two quietly stops mounting
 * read-only.
 */

export interface CleanRunDeps {
  onLine?: (line: { stream: 'stdout' | 'stderr'; text: string }) => void;
  /** Bounds one command. Tests are slower than an edit; the caller's default reflects that. */
  timeoutMs?: number;
}

export const CLEAN_RUN_TIMEOUT_MS = 15 * 60_000;

/**
 * Runs one command in the clean container and returns everything it said.
 *
 * `stdout` and `stderr` are concatenated, in arrival order, because `successRegex` is specified to
 * match against both (бандл A0 §Artifact Walks) — a build tool that reports success on stderr is
 * common enough that splitting them would make the contract wrong for half of them.
 */
export async function runInCleanCopy(
  engine: DockerEngine,
  image: string,
  copyPath: string,
  name: string,
  command: string,
  deps: CleanRunDeps,
): Promise<{ exitCode: number | null; output: string }> {
  const stale = await engine.findByName(name);
  if (stale !== null) await engine.removeContainer(stale, { force: true });

  const id = await engine.createContainer({
    name,
    image,
    /*
     * `-c`, НЕ `-lc` — замерено гейтом M17а: login-шелл перечитывает /etc/profile и ЗАТИРАЕТ
     * контейнерный PATH, так что в golang:1.23-bookworm `sh -lc 'go version'` отвечает 127
     * «go: not found», а `sh -c` — версией (у rust /usr/local/cargo/bin гибнет так же). Дефект
     * спал, пока планы были nodejs (/usr/local/bin переживает /etc/profile), и убил все go-приёмки
     * живого прогона. `-l` пришёл из привычек бандла A0 и не давал здесь ничего.
     */
    cmd: ['sh', '-c', command],
    binds: [bindMount(copyPath, '/workspace')],
    workingDir: '/workspace',
    /*
     * No environment at all beyond what the image ships. The acceptance run is not the executor: it
     * has no assignment to read and no key to spend, and a gate that could reach a paid API is a
     * gate whose verdict costs money to obtain.
     */
    env: {},
  });

  const collected: string[] = [];

  try {
    await engine.startContainer(id);

    const draining = (async () => {
      try {
        for await (const line of readLogFrames(await engine.attachLogs(id, { follow: true }))) {
          collected.push(line.text);
          deps.onLine?.({ stream: line.stream, text: line.text });
        }
      } catch {
        // A stream that ends abruptly costs the tail of a log, not the verdict.
      }
    })();

    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, deps.timeoutMs ?? CLEAN_RUN_TIMEOUT_MS);
    timer.unref();

    let exitCode: number | null;
    try {
      exitCode = await engine.waitContainer(id, abort.signal);
    } catch {
      await engine.stopContainer(id, 0).catch(() => undefined);
      exitCode = null;
    } finally {
      clearTimeout(timer);
    }

    await draining;
    return { exitCode, output: collected.join('\n') };
  } finally {
    await engine.removeContainer(id, { force: true }).catch(() => undefined);
  }
}
