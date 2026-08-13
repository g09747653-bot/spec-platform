/**
 * Line-level diffing (task 59; FR-011 AC-2; solution.md — `specs`).
 *
 * A pure function over two strings. It reads nothing, persists nothing, and is the only thing that
 * decides what "changed" means for a spec file — so a diff shown to the user and a diff asserted in
 * a test are produced by the same code.
 *
 * **Lines, not characters.** A specification is a document a human reads by section, and a
 * character-level diff of prose renders as confetti. Line granularity also makes the accept/reject
 * decision of FR-011 AC-3 legible: the user is agreeing to a set of line changes, not to a set of
 * insertions inside a sentence.
 */

export type DiffOp = 'context' | 'add' | 'remove';

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 1-based line number in the current revision; `null` for an added line. */
  oldLine: number | null;
  /** 1-based line number in the proposed content; `null` for a removed line. */
  newLine: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  hunks: DiffHunk[];
  added: number;
  removed: number;
  /** True when the two texts are byte-identical — nothing to decide (FR-011 AC-5). */
  identical: boolean;
}

/** Lines of context kept either side of a change, as `diff -U3` does. */
const CONTEXT_LINES = 3;

/**
 * The largest LCS table this will build, in cells.
 *
 * The table is quadratic, and a spec bundle is user-supplied text with no length ceiling worth
 * trusting. Past this size the function stops trying to find the minimal edit script and reports the
 * differing region as one replacement — a correct, if coarse, diff. Silently taking minutes and a
 * gigabyte instead would be the worse failure, and an unbounded allocation on a request path is a
 * denial of service with extra steps.
 */
const MAX_LCS_CELLS = 4_000_000;

const splitLines = (text: string): string[] => text.split('\n');

/**
 * The longest common subsequence of two line arrays, as a list of index pairs.
 *
 * Classic dynamic programming over a `Uint32Array`, which keeps the table at four bytes a cell
 * rather than the eight-plus a JavaScript array of numbers would take.
 */
function commonSubsequence(before: string[], after: string[]): [number, number][] {
  const rows = before.length + 1;
  const columns = after.length + 1;
  const table = new Uint32Array(rows * columns);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * columns + j] =
        before[i] === after[j]
          ? (table[(i + 1) * columns + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * columns + j] ?? 0, table[i * columns + j + 1] ?? 0);
    }
  }

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * columns + j] ?? 0) >= (table[i * columns + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return pairs;
}

/** Every line, tagged, with the two texts aligned on their common subsequence. */
function alignedLines(before: string[], after: string[]): DiffLine[] {
  const lines: DiffLine[] = [];

  // Identical head and tail are matched directly, which is what keeps the quadratic step small for
  // the ordinary case: an instruction that edits one section leaves the rest of the file untouched.
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;

  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }

  for (let index = 0; index < head; index += 1) {
    lines.push({
      op: 'context',
      text: before[index] ?? '',
      oldLine: index + 1,
      newLine: index + 1,
    });
  }

  const middleBefore = before.slice(head, before.length - tail);
  const middleAfter = after.slice(head, after.length - tail);

  const withinBudget = (middleBefore.length + 1) * (middleAfter.length + 1) <= MAX_LCS_CELLS;
  const pairs = withinBudget ? commonSubsequence(middleBefore, middleAfter) : [];

  let i = 0;
  let j = 0;

  const emitRemaining = (untilI: number, untilJ: number) => {
    while (i < untilI) {
      lines.push({
        op: 'remove',
        text: middleBefore[i] ?? '',
        oldLine: head + i + 1,
        newLine: null,
      });
      i += 1;
    }
    while (j < untilJ) {
      lines.push({ op: 'add', text: middleAfter[j] ?? '', oldLine: null, newLine: head + j + 1 });
      j += 1;
    }
  };

  for (const [pi, pj] of pairs) {
    emitRemaining(pi, pj);
    lines.push({
      op: 'context',
      text: middleBefore[pi] ?? '',
      oldLine: head + pi + 1,
      newLine: head + pj + 1,
    });
    i = pi + 1;
    j = pj + 1;
  }

  emitRemaining(middleBefore.length, middleAfter.length);

  for (let index = 0; index < tail; index += 1) {
    const oldIndex = before.length - tail + index;
    const newIndex = after.length - tail + index;
    lines.push({
      op: 'context',
      text: before[oldIndex] ?? '',
      oldLine: oldIndex + 1,
      newLine: newIndex + 1,
    });
  }

  return lines;
}

/** Groups changed lines into hunks with up to `CONTEXT_LINES` of context on each side. */
function toHunks(lines: DiffLine[]): DiffHunk[] {
  const changed = lines
    .map((line, index) => (line.op === 'context' ? -1 : index))
    .filter((index) => index !== -1);

  if (changed.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let start = Math.max((changed[0] ?? 0) - CONTEXT_LINES, 0);
  let end = Math.min((changed[0] ?? 0) + CONTEXT_LINES, lines.length - 1);

  for (const index of changed.slice(1)) {
    if (index - CONTEXT_LINES <= end + 1) {
      end = Math.min(index + CONTEXT_LINES, lines.length - 1);
      continue;
    }

    hunks.push(buildHunk(lines.slice(start, end + 1)));
    start = Math.max(index - CONTEXT_LINES, 0);
    end = Math.min(index + CONTEXT_LINES, lines.length - 1);
  }

  hunks.push(buildHunk(lines.slice(start, end + 1)));

  return hunks;
}

function buildHunk(lines: DiffLine[]): DiffHunk {
  const oldNumbers = lines.map((line) => line.oldLine).filter((n): n is number => n !== null);
  const newNumbers = lines.map((line) => line.newLine).filter((n): n is number => n !== null);

  return {
    oldStart: oldNumbers[0] ?? 0,
    oldLines: oldNumbers.length,
    newStart: newNumbers[0] ?? 0,
    newLines: newNumbers.length,
    lines,
  };
}

export function diffLines(before: string, after: string): FileDiff {
  if (before === after) return { hunks: [], added: 0, removed: 0, identical: true };

  const lines = alignedLines(splitLines(before), splitLines(after));

  return {
    hunks: toHunks(lines),
    added: lines.filter((line) => line.op === 'add').length,
    removed: lines.filter((line) => line.op === 'remove').length,
    identical: false,
  };
}

const MARKER: Record<DiffOp, string> = { context: ' ', add: '+', remove: '-' };

/** The diff in unified form — what a developer reads without being taught a new notation. */
export function formatUnifiedDiff(diff: FileDiff, fileName: string): string {
  if (diff.identical) return '';

  const body = diff.hunks.flatMap((hunk) => [
    `@@ -${String(hunk.oldStart)},${String(hunk.oldLines)} +${String(hunk.newStart)},${String(hunk.newLines)} @@`,
    ...hunk.lines.map((line) => `${MARKER[line.op]}${line.text}`),
  ]);

  return [`--- a/${fileName}`, `+++ b/${fileName}`, ...body].join('\n');
}
