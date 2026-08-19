import { tar } from '../docker/tar.ts';
import type { DockerEngine } from '../docker/engine.ts';

/**
 * The executor image (task 155).
 *
 * Node plus the Claude Code CLI plus git, and nothing else. It is built by the loop from the
 * Dockerfile below rather than pulled from a registry, for two reasons: nobody has to publish it,
 * and the version of the CLI the executor runs is a line in this repository rather than whatever a
 * tag pointed at that day.
 *
 * **The CLI version is pinned.** An executor is an unattended agent editing somebody's code; «the
 * latest release, whenever the image happened to be built» is not a property a run should have.
 */

/** Bumping this is a deliberate, reviewed change — the executor's behaviour rides on it. */
export const CLAUDE_CODE_VERSION = '2.1.236';

export const EXECUTOR_IMAGE = 'spec-platform-loop-executor:1';

export const EXECUTOR_DOCKERFILE = `
FROM node:24-bookworm-slim

# git because Claude Code reads repository state, ca-certificates because it calls the API, and
# ripgrep because its search tools are markedly slower without one.
RUN apt-get update \\
 && apt-get install -y --no-install-recommends git ca-certificates ripgrep \\
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# The workspace is bind-mounted here by the wrapper; the image ships no code of its own.
WORKDIR /workspace

# Deliberately NOT \`USER node\`. Everything the executor writes lands on the host through the bind
# mount, and a fixed uid baked into an image cannot match an arbitrary host uid: on Linux that is a
# container which cannot write its own workspace, which is an executor that cannot work. On the
# loop's actual host — Windows with Docker Desktop — the bind mount carries no ownership at all, so
# the choice costs nothing there. Isolation here is the container, not the uid inside it.
`.trimStart();

/** The build context: one file, deterministic bytes. */
export function executorBuildContext(): Buffer {
  return tar([{ name: 'Dockerfile', content: EXECUTOR_DOCKERFILE }]);
}

/**
 * Builds the executor image unless it is already there.
 *
 * Not «build every time»: the Dockerfile's bytes are fixed, so a rebuild is a no-op that still
 * costs a round trip through the daemon and a layer-cache walk on every task.
 */
export async function ensureExecutorImage(
  engine: DockerEngine,
  onProgress?: (message: string) => void,
): Promise<void> {
  if (await engine.hasImage(EXECUTOR_IMAGE)) return;

  onProgress?.(`образ исполнителя ${EXECUTOR_IMAGE} не найден — собираю`);
  await engine.buildImage(EXECUTOR_IMAGE, executorBuildContext());
  onProgress?.(`образ исполнителя ${EXECUTOR_IMAGE} готов`);
}
