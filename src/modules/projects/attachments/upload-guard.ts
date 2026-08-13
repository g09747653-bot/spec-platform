import { sniffMimeType } from '@/modules/adapters/parsing/sniff';

/**
 * The upload guard (task 64; FR-004 AC-4; NFR-008 AC-1/AC-3; SC-9).
 *
 * A pure function, and that is the design: it decides, it does not act. The caller cannot write bytes
 * to storage before consulting it, because the caller has no key to write them under until this returns
 * `ok` — the store is contacted for the first time *after* the verdict. "Rejected before storage" is
 * therefore a property of the call graph rather than of a cleanup path, which is what SC-9 asks for:
 * not "the blob was written and then removed", but that no blob was ever written.
 *
 * Three checks in a deliberate order:
 *
 * 1. **Size**, from the declared length and again from the bytes actually received. The declared value
 *    is a client's claim and cannot be the only test; checking it first is what lets an oversized
 *    request be refused without the rest of the work.
 * 2. **Declared type** against the allowed list — cheap, and it refuses the obvious case.
 * 3. **Sniffed type** against the same list, and the sniffed type is the one that survives. A file
 *    saying it is a PDF while being something else is refused rather than trusted-then-mislabelled,
 *    because the type is what selects an extractor and what the untrusted-block label will claim.
 */

export interface UploadLimits {
  maxBytes: number;
  allowedTypes: readonly string[];
}

export interface UploadCandidate {
  fileName: string;
  /** The client's `Content-Type` for this part. Never trusted as the answer. */
  declaredType: string;
  /** What the client said the length was, when it said anything. */
  declaredSizeBytes?: number;
  bytes: Uint8Array;
}

export type UploadRejectionReason = 'size' | 'empty' | 'type';

export type GuardOutcome =
  | { ok: true; mimeType: string; sizeBytes: number }
  | {
      ok: false;
      code: 'UPLOAD_REJECTED';
      reason: UploadRejectionReason;
      /** Names the limit or the supported types — FR-004 AC-4 requires the message to say which. */
      message: string;
    };

const reject = (reason: UploadRejectionReason, message: string): GuardOutcome => ({
  ok: false,
  code: 'UPLOAD_REJECTED',
  reason,
  message,
});

/** Megabytes, to one decimal place, for a message a person reads rather than counts. */
const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;

/**
 * The supported types, in the wording the user sees.
 *
 * Derived from the configured list rather than restated, so a deployment that narrows
 * `ALLOWED_UPLOAD_TYPES` cannot end up advertising a format it will then refuse.
 */
export function describeAllowedTypes(allowedTypes: readonly string[]): string {
  const names: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'text/plain': 'plain text',
    'text/markdown': 'Markdown',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
  };

  const described = [...new Set(allowedTypes.map((type) => names[type] ?? type))];

  return described.join(', ');
}

/** Extension → the type a file with that suffix claims to be. */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * What the client actually claimed, or `null` when it claimed nothing.
 *
 * Browsers disagree about `File.type`: Chrome names `text/markdown` for a `.md` file, others send an
 * empty string or `application/octet-stream` for the same bytes. Treating "no claim" as "a claim of an
 * unsupported type" would refuse a supported document on the strength of a browser's MIME table, so an
 * absent or generic claim falls back to the file's extension and, failing that, to no claim at all —
 * in which case the sniffed type decides alone, which it does in every case anyway.
 */
export function resolveDeclaredType(fileName: string, declaredType: string): string | null {
  const stated = declaredType.trim().toLowerCase();

  if (stated !== '' && stated !== 'application/octet-stream') return stated;

  const extension = fileName.toLowerCase().split('.').pop() ?? '';

  return BY_EXTENSION[extension] ?? null;
}

export function guardUpload(candidate: UploadCandidate, limits: UploadLimits): GuardOutcome {
  const declared = candidate.declaredSizeBytes;

  if (declared !== undefined && declared > limits.maxBytes) {
    return reject(
      'size',
      `That file is larger than the ${megabytes(limits.maxBytes)} upload limit.`,
    );
  }

  const sizeBytes = candidate.bytes.length;

  if (sizeBytes === 0) {
    return reject('empty', 'That file is empty, so there is nothing to read from it.');
  }

  if (sizeBytes > limits.maxBytes) {
    return reject(
      'size',
      `That file is larger than the ${megabytes(limits.maxBytes)} upload limit.`,
    );
  }

  const supported = describeAllowedTypes(limits.allowedTypes);
  const declaredType = resolveDeclaredType(candidate.fileName, candidate.declaredType);

  if (declaredType !== null && !limits.allowedTypes.includes(declaredType)) {
    return reject('type', `That file type is not supported. Supported types: ${supported}.`);
  }

  const mimeType = sniffMimeType({ bytes: candidate.bytes, declaredType: declaredType ?? '' });

  if (mimeType === null || !limits.allowedTypes.includes(mimeType)) {
    return reject('type', `That file type is not supported. Supported types: ${supported}.`);
  }

  /*
   * The two agree, or the file is not what it claims. A mismatch is refused rather than silently
   * resolved in favour of the bytes: the user picked a file and named a type, and one of those is
   * wrong — proceeding would store something they did not knowingly upload.
   */
  if (declaredType !== null && mimeType !== declaredType) {
    return reject(
      'type',
      `That file's contents do not match its declared type (${declaredType}). Supported types: ${supported}.`,
    );
  }

  return { ok: true, mimeType, sizeBytes };
}
