import { strToU8, zipSync } from 'fflate';

import { definedIdentifier, readLines } from '../lint/identifiers';
import { DEPENDS_LINE, TASK_BULLET, TASK_CHECKBOX, TASK_HEADING } from '../model/task-notation';
import type { ExportableFile } from '../repositories/spec-files';
import { requirementSectionBodies } from '../validate-structure';

/**
 * The machine-readable bundle — the contract between the platform and the autonomous delivery loop
 * (task 150; А-20; бандл A0 «Integration: Spec Platform Bundle»).
 *
 * Four entries under one `bundle/` directory: the constitution and the approved solution verbatim
 * (the loop calls the latter `architecture.md`), and two JSON files derived from the same approved
 * revisions the ZIP prints. **No model in the loop, no separate generation**: everything below is a
 * pure function of the markdown, so a fixed bundle exports byte-identically every time — the JSON
 * by construction, the archive because every entry carries a fixed timestamp.
 *
 * The JSON shapes are pinned by the shared schema fixtures in `fixtures/spec-bundle/` — copied
 * verbatim from the A0 bundle — and by a golden-fixture unit test, so schema drift on either side of
 * the contract is a red diff rather than a runtime surprise.
 *
 * **Parsing is conservative and total.** A generated requirements document may define explicit
 * `FR-…`/`NFR-…` identifiers or may organise its rows as subsections (the A0 bundle does the
 * latter); both shapes map, and a document that does neither still produces one honest row rather
 * than a refusal. Requirement rows come from the two requirement-bearing sections, sliced by
 * `validate-structure` — the baseline's sanctioned reader — so no heading is restated here (P3).
 */

/* ------------------------------------------------------------------ shared line scanning */

interface ScannedLine {
  text: string;
  /** True inside a fenced code block: never an entry boundary, always part of a body. */
  fenced: boolean;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;

/** Splits markdown into lines that know whether they sit inside a code fence. */
function scanLines(markdown: string): ScannedLine[] {
  const lines: ScannedLine[] = [];
  let fence: string | null = null;

  for (const text of markdown.split(/\r?\n/)) {
    const match = FENCE.exec(text);

    if (fence !== null) {
      lines.push({ text, fenced: true });
      if (match !== null) {
        const marker = match[1] ?? '';
        if (marker.startsWith(fence.charAt(0)) && marker.length >= fence.length) fence = null;
      }
      continue;
    }

    if (match !== null) {
      fence = match[1] ?? '';
      lines.push({ text, fenced: true });
      continue;
    }

    lines.push({ text, fenced: false });
  }

  return lines;
}

const trimBlankEdges = (body: readonly string[]): string => body.join('\n').trim();

/* ------------------------------------------------------------------ requirements.json */

export interface FunctionalRequirementRow {
  id: string;
  title: string;
  description: string;
}

export interface NonFunctionalRequirementRow {
  id: string;
  category: string;
  description: string;
}

export interface MachineRequirements {
  bundleId: string;
  functionalRequirements: FunctionalRequirementRow[];
  nonFunctionalRequirements: NonFunctionalRequirementRow[];
}

/** `FR-001` → `FR`; the family a canonical identifier belongs to. */
const familyOf = (identifier: string): string => identifier.split('-')[0] ?? '';

/**
 * The words of an entry line once its own markers are gone: list bullet, heading marks, emphasis,
 * the identifier itself and the separator after it.
 */
function titleAfterIdentifier(lineText: string, display: string): string {
  // A table row titles its entry in the cell after the identifier's.
  if (lineText.trimStart().startsWith('|')) {
    const cells = lineText.split('|').map((cell) => cell.trim());
    const at = cells.findIndex((cell) => cell.includes(display));
    const next = cells.slice(at + 1).find((cell) => cell !== '');
    if (next !== undefined) return stripEmphasis(next);
  }

  const marker = new RegExp(
    `^\\s*(?:#{1,6}\\s+|[-*+]\\s+|\\d+[.)]\\s+|\\|\\s*)?[*_\`]{0,3}${display}[*_\`]{0,3}\\s*[—–:.-]?\\s*`,
  );

  return stripEmphasis(lineText.replace(marker, '').trim());
}

/**
 * Markdown dress off a title: emphasis asterisks, inline-code backticks, and *wrapping*
 * underscores. Underscores inside a word stay — `clean_slate` and `TODO_WORK_DIR` are names, not
 * emphasis, and CommonMark agrees (intra-word `_` does not open emphasis). Found by the M14а gate:
 * the first cut stripped every underscore and handed the loop `cleanslate`.
 */
const stripEmphasis = (value: string): string =>
  value.replaceAll(/[*`]/g, '').trim().replace(/^_+/, '').replace(/_+$/, '').trim();

interface ParsedEntry {
  id: string | null;
  title: string;
  body: string[];
}

/**
 * Rows of one requirement-bearing section.
 *
 * Three shapes, tried in order. **Identifier-defined**: a line that introduces `FR-001`-style
 * identifiers of this family opens a row; its body runs to the next definition or heading.
 * **Subsectioned** (the A0 shape): each heading inside the section opens a row. **Bare**: one row
 * for the whole section. Identifiers win over subsections because they are the stronger claim —
 * a document that says «FR-012» has named its row, and inventing a second id for it would break
 * «every requirement row present exactly once».
 */
function sectionRows(sectionBody: string, family: string): ParsedEntry[] {
  const defined = readLines(sectionBody)
    .map((line) => definedIdentifier(line))
    .filter((occurrence) => occurrence !== null)
    .filter((occurrence) => familyOf(occurrence.identifier) === family);

  const lines = scanLines(sectionBody);

  if (defined.length > 0) {
    const starts = new Set(defined.map((occurrence) => occurrence.line.number - 1));
    const entries: ParsedEntry[] = [];
    let current: ParsedEntry | null = null;

    for (const [index, line] of lines.entries()) {
      if (!line.fenced && starts.has(index)) {
        if (current !== null) entries.push(current);
        const occurrence = defined.find((candidate) => candidate.line.number - 1 === index);
        current = {
          id: occurrence?.identifier ?? null,
          title: titleAfterIdentifier(line.text, occurrence?.display ?? ''),
          body: [],
        };
        continue;
      }

      // Any heading ends the entry: a new subsection is not part of the row that precedes it.
      if (!line.fenced && HEADING.test(line.text) && current !== null) {
        entries.push(current);
        current = null;
        continue;
      }

      if (current !== null) current.body.push(line.text);
    }

    if (current !== null) entries.push(current);
    return entries;
  }

  const subsections: ParsedEntry[] = [];
  let open: ParsedEntry | null = null;
  let openLevel = 0;

  for (const line of lines) {
    const heading = line.fenced ? null : HEADING.exec(line.text);

    if (heading !== null) {
      const level = (heading[1] ?? '').length;
      const text = stripEmphasis(heading[2] ?? '');

      if (open !== null && level <= openLevel) {
        subsections.push(open);
        open = null;
      }
      if (open === null) {
        open = { id: null, title: text, body: [] };
        openLevel = level;
        continue;
      }
    }

    if (open !== null) open.body.push(line.text);
  }

  if (open !== null) subsections.push(open);
  if (subsections.length > 0) return subsections;

  const whole = trimBlankEdges(lines.map((line) => line.text));
  if (whole === '') return [];

  const firstLine = lines.find((line) => !line.fenced && line.text.trim() !== '');

  return [
    {
      id: null,
      title: stripEmphasis((firstLine?.text ?? '').replace(/^\s*[-*+]\s+/, '')),
      body: lines.map((line) => line.text),
    },
  ];
}

/**
 * Fills in ids for rows the document did not name: `FR-1`, `FR-2`, … in document order. Stable
 * across re-export because the numbering is a function of the same content every time.
 */
function withIds(rows: readonly ParsedEntry[], family: string): (ParsedEntry & { id: string })[] {
  let counter = 0;

  return rows.map((row) => {
    counter += 1;
    return { ...row, id: row.id ?? `${family}-${String(counter)}` };
  });
}

export function deriveRequirements(
  requirementsMarkdown: string,
  bundleId: string,
): MachineRequirements {
  const sections = requirementSectionBodies(requirementsMarkdown);

  const functionalRequirements = withIds(sectionRows(sections.functional, 'FR'), 'FR').map(
    (row) => ({
      id: row.id,
      title: row.title,
      description: trimBlankEdges(row.body),
    }),
  );

  const nonFunctionalRequirements = withIds(sectionRows(sections.nonFunctional, 'NFR'), 'NFR').map(
    (row) => ({
      id: row.id,
      category: row.title,
      description: trimBlankEdges(row.body),
    }),
  );

  return { bundleId, functionalRequirements, nonFunctionalRequirements };
}

/* ------------------------------------------------------------------ tasks.json */

export interface MachineTaskRow {
  taskId: string;
  title: string;
  description: string;
  dependsOn: string[];
  metadata: { expectedArtifacts: never[] };
}

export interface MachineTasks {
  bundleId: string;
  projectId: string;
  tasks: MachineTaskRow[];
}

/*
 * The three recognised entry shapes and the dependency clause live in `model/task-notation.ts` —
 * one notation, read here and rendered into the tasks-generation instruction (task 169). All three
 * stay recognised as **tolerance**: a bundle sealed before the instruction named a canonical form
 * must keep exporting, and forgetting one of them is how the loop received zero tasks from a
 * non-empty document at the M14а gate.
 */

/** A task token: `148`, `1.1`, `2.4` — not the digits inside `А-2.1` or `FR-003`. */
const TOKEN = String.raw`\d+(?:\.\d+)*`;
const TOKEN_OR_RANGE = new RegExp(
  `(?<![A-Za-zА-Яа-я0-9.-])(${TOKEN})(?:\\s*[–—-]\\s*(${TOKEN}))?`,
  'gu',
);

/**
 * The task tokens a dependencies clause names, ranges expanded.
 *
 * The clause ends where its emphasis or its line-mate begins: `_Dependencies: 148–150_ ·
 * _Requirements: А-2.1_` states two dependencies and no more, and reading past the closing `_`
 * would hand the requirement reference to the dependency list. `148–150` → 148, 149, 150; a range
 * between dotted tokens (`1.1–1.3`) has no defined walk, so it contributes its two endpoints. `—`,
 * `none` and prose contribute nothing: only tokens count.
 */
export function parseDependsOn(clause: string): string[] {
  const found: string[] = [];
  const own = clause.split(/[_·;|]/, 1)[0] ?? '';

  for (const match of own.matchAll(TOKEN_OR_RANGE)) {
    const [, from = '', to] = match;

    if (to === undefined) {
      found.push(from);
      continue;
    }

    const start = Number(from);
    const end = Number(to);
    const wholeRange =
      Number.isInteger(start) && Number.isInteger(end) && !from.includes('.') && !to.includes('.');

    if (wholeRange && start <= end && end - start <= 500) {
      for (let value = start; value <= end; value += 1) found.push(String(value));
    } else {
      found.push(from, to);
    }
  }

  return [...new Set(found)];
}

interface OpenTask {
  taskId: string;
  title: string;
  level: number | null;
  body: ScannedLine[];
}

/**
 * Every task entry the document states, in document order.
 *
 * A heading entry's body runs to the next entry or to any heading at its own level or shallower —
 * the next milestone ends the last task of the previous one. A checkbox entry's body runs to the
 * next entry or to any heading at all. Fenced lines are body wherever they fall, never boundaries.
 */
export function parseTaskEntries(tasksMarkdown: string): MachineTaskRow[] {
  const rows: MachineTaskRow[] = [];
  let open: OpenTask | null = null;

  const close = () => {
    if (open === null) return;

    const description = trimBlankEdges(open.body.map((line) => line.text));
    const dependsClause = open.body
      .filter((line) => !line.fenced)
      .map((line) => DEPENDS_LINE.exec(line.text))
      .filter((match) => match !== null)
      .map((match) => match.input.slice(match.index + match[0].length));

    rows.push({
      taskId: open.taskId,
      title: open.title,
      description,
      dependsOn: dependsClause.flatMap((clause) => parseDependsOn(clause)),
      metadata: { expectedArtifacts: [] },
    });
    open = null;
  };

  for (const line of scanLines(tasksMarkdown)) {
    if (!line.fenced) {
      const heading = TASK_HEADING.exec(line.text);
      if (heading !== null) {
        close();
        open = {
          taskId: heading[2] ?? '',
          title: stripEmphasis(heading[3] ?? ''),
          level: (heading[1] ?? '').length,
          body: [],
        };
        continue;
      }

      const checkbox = TASK_CHECKBOX.exec(line.text);
      if (checkbox !== null) {
        close();
        open = {
          taskId: checkbox[1] ?? '',
          title: stripEmphasis(checkbox[2] ?? ''),
          level: null,
          body: [],
        };
        continue;
      }

      const bullet = TASK_BULLET.exec(line.text);
      if (bullet !== null) {
        close();
        open = {
          taskId: bullet[1] ?? '',
          title: stripEmphasis(bullet[2] ?? ''),
          level: null,
          body: [],
        };
        continue;
      }

      const plainHeading = HEADING.exec(line.text);
      if (plainHeading !== null && open !== null) {
        const level = (plainHeading[1] ?? '').length;
        const bounds = open.level ?? 7;
        if (open.level === null || level <= bounds) {
          close();
          continue;
        }
      }
    }

    if (open !== null) open.body.push(line);
  }

  close();
  return rows;
}

export function deriveTasks(
  tasksMarkdown: string,
  bundleId: string,
  projectId: string,
): MachineTasks {
  return { bundleId, projectId, tasks: parseTaskEntries(tasksMarkdown) };
}

/* ------------------------------------------------------------------ the archive */

/** The machine bundle's entries, in bundle order, named as the A0 contract names them. */
export const MACHINE_BUNDLE_FILES = Object.freeze({
  constitution: 'bundle/constitution.md',
  solution: 'bundle/architecture.md',
  requirements: 'bundle/requirements.json',
  tasks: 'bundle/tasks.json',
} as const);

/**
 * One timestamp for every entry, fixed. An archive is a container of bytes plus timestamps, and a
 * fresh `Date` per export would make two exports of identical content differ — which would turn
 * «deterministic for a fixed bundle» into a claim about everything except the file one hashes.
 */
const FIXED_MTIME = new Date('2026-01-01T00:00:00Z');

export interface MachineBundleResult {
  zip: Uint8Array;
  included: string[];
  omitted: string[];
  /** The serialized JSON payloads, for callers that validate or hash them without unzipping. */
  requirementsJson: string | null;
  tasksJson: string | null;
}

const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export function assembleMachineBundle(
  files: readonly ExportableFile[],
  projectId: string,
): MachineBundleResult {
  const byType = new Map(files.map((file) => [file.specType, file] as const));

  const included: string[] = [];
  const omitted: string[] = [];
  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};

  const put = (name: string, content: string) => {
    entries[name] = [strToU8(content), { mtime: FIXED_MTIME }];
    included.push(name);
  };

  const constitution = byType.get('constitution');
  if (constitution === undefined) omitted.push(MACHINE_BUNDLE_FILES.constitution);
  else put(MACHINE_BUNDLE_FILES.constitution, constitution.content);

  const solution = byType.get('solution');
  if (solution === undefined) omitted.push(MACHINE_BUNDLE_FILES.solution);
  else put(MACHINE_BUNDLE_FILES.solution, solution.content);

  const requirements = byType.get('requirements');
  let requirementsJson: string | null = null;
  if (requirements === undefined) omitted.push(MACHINE_BUNDLE_FILES.requirements);
  else {
    requirementsJson = serialize(deriveRequirements(requirements.content, projectId));
    put(MACHINE_BUNDLE_FILES.requirements, requirementsJson);
  }

  const tasks = byType.get('tasks');
  let tasksJson: string | null = null;
  if (tasks === undefined) omitted.push(MACHINE_BUNDLE_FILES.tasks);
  else {
    tasksJson = serialize(deriveTasks(tasks.content, projectId, projectId));
    put(MACHINE_BUNDLE_FILES.tasks, tasksJson);
  }

  return { zip: zipSync(entries, { level: 6 }), included, omitted, requirementsJson, tasksJson };
}
