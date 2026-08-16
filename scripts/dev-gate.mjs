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
/*
 * **Raised from 300 s to 600 s in round 4, by measurement.**
 *
 * 300 s carried every generation and every review. What it did not carry is the Edit proposal, which
 * is the largest answer the product ever asks for: the model restates *whole documents* as JSON, and
 * the walk's bundle has four of them. The log of round 4's third walk has the numbers — a 5 500-token
 * prompt read at ~100 tok/s, then 4 520 tokens of answer written at ~19 tok/s, and the per-provider
 * deadline arrived with the JSON unfinished. `AllProvidersFailedError` after five attempts, and the
 * user is told the draft could not be produced.
 *
 * That is a fact about this machine, not about the product: an answer of six to eight thousand
 * tokens needs six to eight minutes at 19 tok/s, and the variable that says how long a provider may
 * take is the one to change. Kept below the walk's own 900 s waits, so a genuinely stuck call still
 * ends as a refusal the script can report rather than as a hang.
 */
const DEFAULT_LOCAL_TIMEOUT_MS = '600000';
const TIMEOUT_MS =
  process.env.LLM_REQUEST_TIMEOUT_MS ??
  (CHAIN.includes('ollama') ? DEFAULT_LOCAL_TIMEOUT_MS : undefined);

/**
 * The window the gate's `ollama serve` is started with, declared to the application as well (А-8).
 *
 * **One number, two readers.** The server sizes its context slot from `OLLAMA_CONTEXT_LENGTH`; the
 * assembler packs prompts to it. If the two disagree, the symptom is not a warning — it is a prompt
 * silently cut from the front, the system instruction thrown away, and a document written from the
 * web research that survived at the tail (D-146). Setting it here, next to the chain and the
 * timeout, is what makes «the gate's configuration» one place rather than two.
 *
 * Ollama's own default is 4 096, which no generation prompt fits; D-92 raised the gate's server to
 * 16 384 and D-146 established that 32 768 removes the truncation but cannot be read inside the
 * budget. So this is the value the server must also be started with, and the message below says so.
 */
const DEFAULT_LOCAL_CONTEXT_LENGTH = '16384';
const CONTEXT_LENGTH = process.env.OLLAMA_CONTEXT_LENGTH ?? DEFAULT_LOCAL_CONTEXT_LENGTH;

console.log(`Starting the application against the throwaway database on port ${String(PORT)}.`);
console.log(`Provider chain: ${CHAIN}`);
console.log('Providers, OAuth and storage come from .env — this walk makes real calls.');

if (CHAIN.includes('ollama')) {
  console.log(
    'The local provider needs `ollama serve` running; expect it to be slower than Google.',
  );
  console.log(`Per-provider timeout raised to ${String(Number(TIMEOUT_MS) / 1000)} s for it.`);
  console.log(
    `Prompts are packed to a ${CONTEXT_LENGTH}-token window. Start the server with the same one:`,
  );
  console.log(
    `  OLLAMA_CONTEXT_LENGTH=${CONTEXT_LENGTH} OLLAMA_KEEP_ALIVE=4h OLLAMA_NUM_PARALLEL=1 ollama serve`,
  );
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
      OLLAMA_CONTEXT_LENGTH: CONTEXT_LENGTH,
      ...(TIMEOUT_MS === undefined ? {} : { LLM_REQUEST_TIMEOUT_MS: TIMEOUT_MS }),
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
