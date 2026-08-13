import { looksLikeRefinementPrompt, stubRefinementDocument } from './stub-refinement';
import { looksLikeReviewPrompt, specTypeFromReviewPrompt, stubReviewDocument } from './stub-review';
import {
  AllProvidersFailedError,
  type GenerateOptions,
  type GenerateResult,
  type LlmAdapter,
  type ProviderId,
} from './types';

/**
 * The deterministic stub provider (task 18; IR-001-AC-5; IR-X4; NFR-012 AC-5).
 *
 * Every automated test in this repository generates through this adapter, so no test — unit, parity or
 * end-to-end — ever reaches a model vendor. Determinism is the whole point: the same call produces the
 * same chunks in the same order, so an assertion about generated content is stable, and a failure is a
 * defect rather than a model having a different day.
 *
 * It also injects failures. `failAtChunk` stops the stream after a chosen number of chunks, which is
 * what the failover and mid-stream-restart tests of tasks 43–48 need: partial output followed by a
 * refusal is the interesting case, and it cannot be provoked from a real provider on demand.
 */
export interface TestDoubleOptions {
  /** The document to stream. Defaults to a small structured markdown file. */
  document?: string;
  /**
   * Answer the prompt instead of streaming a fixed document: write the sections the prompt asked for,
   * in the order it asked for them. This is the mode the parity check runs in (task 40).
   */
  followPrompt?: boolean;
  /** Words per chunk. Chunking is by whitespace, so the reassembled text is byte-identical. */
  wordsPerChunk?: number;
  /** Delay between chunks in milliseconds, for exercising streaming behaviour. Default 0. */
  chunkDelayMs?: number;
  /**
   * Fail after this many chunks have been emitted. `0` fails before the first chunk, which is the
   * "provider refused immediately" case as opposed to "provider died mid-stream".
   */
  failAtChunk?: number;
  /** Which provider the result claims to come from. Default `anthropic`. */
  providerUsed?: ProviderId;
}

/**
 * The stub's default document.
 *
 * Deliberately not a real specification: the walking skeleton proves the *path*, and the section schema
 * (task 39) is what will make generated structure meaningful. Keeping it obviously synthetic stops a
 * stub document from being mistaken for a parity artifact.
 */
export const STUB_DOCUMENT = [
  '# Stub Specification',
  '',
  'This document was produced by the deterministic stub provider, not by a model.',
  '',
  '## Purpose',
  '',
  'It exercises the generation path end to end: streaming, persistence as an unapproved revision,',
  'approval, and export.',
  '',
  '## Notes',
  '',
  '- Content is fixed, so tests can assert on it.',
  '- No network call is made.',
].join('\n');

/**
 * A stub document naming the file it stands in for.
 *
 * The label arrives as a plain string: an adapter may not import a core module (constitution A1), so the
 * spec-type vocabulary stays on the other side of the boundary and the composition root passes the name
 * through.
 */
export function stubDocumentFor(label: string): string {
  const title = label.charAt(0).toUpperCase() + label.slice(1);

  return [
    `# ${title}`,
    '',
    `Stub content for \`${label}.md\`, produced by the deterministic test double rather than a model.`,
    '',
    '## Purpose',
    '',
    'It exercises the generation path end to end: streaming, persistence as an unapproved revision,',
    'approval, and export.',
    '',
    '## Notes',
    '',
    '- Content is fixed, so tests can assert on it.',
    '- No network call is made.',
  ].join('\n');
}

/**
 * A stub that does what it was told: it reads the required sections out of the prompt and writes a
 * document with exactly those headings, in order.
 *
 * This is what lets the parity check (task 40) be a real end-to-end assertion rather than a fixture
 * comparison. The heading list reaches the stub the same way it reaches a real model — through the
 * prompt `assemblePrompt` derived from the section schema — so nothing here restates structural truth,
 * and renaming a section in the schema changes both the instruction and this output at once.
 *
 * The list is recognised by the numbered form `assemblePrompt` renders: `1. ## Section Name`.
 */
const PROMPTED_SECTION = /^[ \t]*\d+\.[ \t]+(#{1,6})[ \t]+(.+?)[ \t]*$/;

export function documentFromPrompt(prompt: string, fallback: string = STUB_DOCUMENT): string {
  const sections = prompt
    .split(/\r?\n/)
    .map((line) => PROMPTED_SECTION.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ level: (match[1] ?? '').length, heading: match[2] ?? '' }));

  if (sections.length === 0) return fallback;

  return [
    '# Specification',
    '',
    'Written by the deterministic stub provider, following the section list it was given.',
    ...sections.flatMap((section) => [
      '',
      `${'#'.repeat(section.level)} ${section.heading}`,
      '',
      `Content for ${section.heading.toLowerCase()}.`,
    ]),
    '',
  ].join('\n');
}

const DEFAULT_WORDS_PER_CHUNK = 6;

/** Splits text into chunks that reassemble to exactly the original string. */
export function chunkDocument(document: string, wordsPerChunk: number): string[] {
  if (wordsPerChunk < 1) throw new Error('wordsPerChunk must be at least 1');

  // Keep the separators: joining the pieces must reproduce the input byte for byte.
  const pieces = document.split(/(\s+)/).filter((piece) => piece !== '');
  const chunks: string[] = [];
  let current = '';
  let words = 0;

  for (const piece of pieces) {
    current += piece;
    if (!/^\s+$/.test(piece)) {
      words += 1;
      if (words === wordsPerChunk) {
        chunks.push(current);
        current = '';
        words = 0;
      }
    }
  }

  if (current !== '') chunks.push(current);

  return chunks;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The double as a **provider**, for the registry (D-48).
 *
 * It answers the prompt it is given — writing exactly the sections the assembled prompt asked for —
 * so an end-to-end run against it exercises the whole path, including structural validation, without
 * a vendor. Delays are simulated so the streaming path is genuinely streaming rather than one batch.
 */
export function createStubProviderStream(): (input: {
  messages: readonly { role: string; content: string }[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}) => Promise<string> {
  return async ({ messages, onDelta, signal }) => {
    const prompt = messages.map((message) => message.content).join('\n');
    const document = looksLikeReviewPrompt(prompt)
      ? stubReviewDocument(specTypeFromReviewPrompt(prompt))
      : looksLikeRefinementPrompt(prompt)
        ? stubRefinementDocument(prompt)
        : documentFromPrompt(prompt);

    for (const chunk of chunkDocument(document, DEFAULT_WORDS_PER_CHUNK)) {
      signal?.throwIfAborted();
      await sleep(1);
      onDelta(chunk);
    }

    return document;
  };
}

export function createTestDoubleAdapter(options: TestDoubleOptions = {}): LlmAdapter {
  const document = options.document ?? STUB_DOCUMENT;
  const wordsPerChunk = options.wordsPerChunk ?? DEFAULT_WORDS_PER_CHUNK;
  const chunkDelayMs = options.chunkDelayMs ?? 0;
  const providerUsed = options.providerUsed ?? 'anthropic';
  const failAtChunk = options.failAtChunk;

  return {
    async generateStreaming(generateOptions: GenerateOptions): Promise<GenerateResult> {
      const text =
        options.followPrompt === true
          ? documentFromPrompt(
              generateOptions.messages.map((message) => message.content).join('\n'),
              document,
            )
          : document;

      const chunks = chunkDocument(text, wordsPerChunk);
      let emitted = 0;

      for (const chunk of chunks) {
        if (failAtChunk !== undefined && emitted >= failAtChunk) {
          // Partial output is never returned: the caller sees a failure, and the mid-stream policy
          // (discard, restart from zero) belongs to the failover client, not to a provider.
          throw new AllProvidersFailedError(1);
        }

        generateOptions.signal?.throwIfAborted();

        if (chunkDelayMs > 0) await sleep(chunkDelayMs);

        generateOptions.onChunk?.(chunk);
        emitted += 1;
      }

      if (failAtChunk !== undefined && emitted >= failAtChunk) {
        throw new AllProvidersFailedError(1);
      }

      return { text, providerUsed, attempts: 1 };
    },
  };
}
