#!/usr/bin/env node
/**
 * The application, against the throwaway database, with the **real** providers from `.env`.
 *
 * This is the milestone-gate configuration: the customer walks the whole journey by hand against a
 * live model, a live Blob store and live web research, but writes nothing to the Neon database that
 * serves the deployment. The end-to-end suite already runs this way with the stub — the only
 * difference here is that the provider chain is the one `.env` names, so the prompts, the questions
 * and the documents are a model's rather than the double's.
 *
 * Two variables are overridden. `DATABASE_URL` points at `pnpm db:test-server`, which holds its
 * data in memory for the lifetime of that process: the walk starts from an empty database and leaves
 * nothing behind. `LLM_PROVIDER_ORDER` names the local provider behind the funded one, so a spent
 * daily quota slows the walk down instead of ending it (round 3, D-90). Everything else — the Google
 * key, the OAuth clients, the Blob token, the search key — comes from `.env` untouched, because those
 * are precisely what the gate is meant to exercise.
 *
 * The chain is set here rather than in `.env` on purpose: `.env` is the customer's file and describes
 * their machine, while this is the gate's own configuration and belongs with the gate. Either of the
 * two spellings below overrides it, so the walk can still be run on one provider deliberately.
 *
 * Usage:
 *   pnpm db:test-server                        (one terminal — leave it running)
 *   pnpm dev:gate                              (another terminal)
 *   pnpm dev:gate -- --chain=google            (only the funded provider)
 *   LLM_PROVIDER_ORDER=ollama pnpm dev:gate    (only the local one)
 */
import { spawn } from 'node:child_process';

const PORT = Number(process.env.TEST_DB_PORT ?? 5497);
const TEST_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${String(PORT)}/postgres`;

/**
 * Google first because it is the better model and the deployment's own chain; Ollama second because
 * it is free and always there. Order matters: the reverse would run every gate walk on the local
 * model and stop testing what production actually does.
 */
const DEFAULT_CHAIN = 'google,ollama';

const flag = process.argv.slice(2).find((argument) => argument.startsWith('--chain='));
const CHAIN = flag?.slice('--chain='.length) ?? process.env.LLM_PROVIDER_ORDER ?? DEFAULT_CHAIN;

/**
 * A local model needs a bigger budget than a hosted one, and the default is not it.
 *
 * Measured on this machine: a constitution generation on `qwen2.5:14b` runs past the 60-second
 * per-provider default and is aborted at exactly that mark — the walk reaches "Try again" and the
 * document is never written. That is not a slow answer, it is no answer, and it would wall the gate
 * on every generation. The prose alone takes ~18 s; the rest is the longer prompt the interview
 * builds and the live research the generation makes inside the same call.
 *
 * Set only when the local provider is in the chain, and only here: this is the gate's configuration,
 * and it must not become the deployment's. Note the cost — the value is **per provider**, so a
 * hosted provider that hangs rather than refuses now holds the chain for this long before the local
 * one is tried. Refusals (429, 503) are unaffected; they fail fast and always did.
 */
const DEFAULT_LOCAL_TIMEOUT_MS = '300000';
const TIMEOUT_MS =
  process.env.LLM_REQUEST_TIMEOUT_MS ??
  (CHAIN.includes('ollama') ? DEFAULT_LOCAL_TIMEOUT_MS : undefined);

console.log(`Starting the application against the throwaway database on port ${String(PORT)}.`);
console.log(`Provider chain: ${CHAIN}`);
console.log('Providers, OAuth and storage come from .env — this walk makes real calls.');

if (CHAIN.includes('ollama')) {
  console.log(
    'The local provider needs `ollama serve` running; expect it to be slower than Google.',
  );
  console.log(`Per-provider timeout raised to ${String(Number(TIMEOUT_MS) / 1000)} s for it.`);
}

console.log('');

/*
 * `next dev` loads `.env` itself, so no `--env-file` flag is passed — Next re-executes itself and
 * forwards Node flags through `NODE_OPTIONS`, where `--env-file-if-exists` is refused. The override
 * below is set on the child's environment instead, which Next never overwrites.
 */
const child = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', 'dev', '--port', String(process.env.PORT ?? 3000)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      LLM_PROVIDER_ORDER: CHAIN,
      ...(TIMEOUT_MS === undefined ? {} : { LLM_REQUEST_TIMEOUT_MS: TIMEOUT_MS }),
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
