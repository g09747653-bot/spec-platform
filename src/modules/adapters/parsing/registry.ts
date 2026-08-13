/**
 * The extractor registry (task 65; IR-004; DR-8; solution.md — `adapters/parsing`).
 *
 * Three properties, each of them the answer to a specific way this goes wrong:
 *
 * 1. **Keyed by the sniffed MIME type**, and a type with no entry never reaches an extractor. Not
 *    "reaches one that then declines" — the lookup fails first, so a format the platform does not
 *    handle cannot get a parser to look at its bytes at all.
 * 2. **Bounded by `PARSE_TIMEOUT_MS`.** A malformed document that sends a parser into a long loop is
 *    a denial of service on a request path; the ceiling turns it into a recorded failure.
 * 3. **Never throws.** Every outcome is a value: extraction failing is a normal thing that happens to
 *    a user's file, and the session must survive it (FR-004 AC-5, IR-004-AC-3).
 */

export type ExtractionOutcome =
  { status: 'ok'; text: string } | { status: 'passthrough' } | { status: 'failed'; reason: string };

/** Reads bytes for a stored object. The upload path serves the bytes it already holds (DR-8). */
export type BlobSource = (blobKey: string) => Promise<Uint8Array>;

/**
 * One format's extractor.
 *
 * It returns text or throws; it never reports failure as a value. Failure handling — the timeout, the
 * reason string, the fact that nothing propagates out of the adapter — belongs to the registry, in one
 * place, rather than to each of five implementations that would each get it slightly differently.
 *
 * `passthrough` extractors return `null`: an image has nothing to extract, which is not the same as an
 * extraction that produced nothing (IR-004-AC-2).
 */
export type Extractor = (bytes: Uint8Array) => Promise<string | null>;

export interface ParsingAdapter {
  extract(input: { blobKey: string; mimeType: string }): Promise<ExtractionOutcome>;
}

export interface ExtractorRegistryOptions {
  extractors: Readonly<Record<string, Extractor>>;
  read: BlobSource;
  timeoutMs: number;
}

/**
 * Runs a promise under a ceiling.
 *
 * The losing promise is not cancellable — a parser deep in a WASM call cannot be interrupted — so what
 * this guarantees is that the *caller* is released on time and the late result is discarded. That is
 * the property the acceptance criterion needs: the row records a failure and the session stays usable.
 */
async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`extraction exceeded ${String(timeoutMs)} ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The first line of an error, with no stack and no vendor payload — it is stored and shown. */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n')[0]?.trim() ?? '';

  return firstLine === '' ? 'the file could not be read' : firstLine.slice(0, 300);
}

export function createExtractorRegistry(options: ExtractorRegistryOptions): ParsingAdapter {
  const { extractors, read, timeoutMs } = options;

  return {
    async extract({ blobKey, mimeType }): Promise<ExtractionOutcome> {
      const extractor = extractors[mimeType];

      // Unregistered: the lookup is the gate, and nothing below this line runs.
      if (extractor === undefined) {
        return { status: 'failed', reason: `no extractor is registered for ${mimeType}` };
      }

      try {
        const bytes = await withTimeout(read(blobKey), timeoutMs);
        const text = await withTimeout(extractor(bytes), timeoutMs);

        if (text === null) return { status: 'passthrough' };

        /*
         * A parser that returns whitespace has failed, whatever it thinks. Storing it as success would
         * put an empty section in every later prompt under the file's name, which reads to a model as
         * "the user supplied an empty document" rather than "this document could not be read".
         */
        if (text.trim() === '') {
          return { status: 'failed', reason: 'no text could be extracted from the file' };
        }

        return { status: 'ok', text };
      } catch (error) {
        return { status: 'failed', reason: reasonOf(error) };
      }
    },
  };
}
