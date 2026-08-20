import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import type { Chain } from '../llm/chain.ts';

/**
 * The researcher: what is already in this workspace (task 161; бандл A0 Task 3.3).
 *
 * Its report answers the question every assignment silently assumes an answer to — «what am I
 * building *into*?» — and it answers it from the disk rather than from the bundle. The two differ
 * from the second task onwards: the bundle describes a project that does not exist yet, and by the
 * time task 7 is written its first six have already chosen a directory layout, a test runner and a
 * set of dependencies. An architect writing task 7 from the bundle alone proposes a structure the
 * project has already contradicted.
 *
 * **The survey is deterministic and the prose is optional.** The tree, the manifests and the
 * dependency names are read, not asked — a model cannot be wrong about a file listing, and a role
 * that needed a provider to state facts would take the loop's own control path through a vendor
 * (D-229). The model's part is a short brief on top, and its absence costs the brief, never the
 * report.
 */

/** Directories a survey never descends into: noise, or somebody else's build. */
const SKIP = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.data',
  'coverage',
  'handoff',
]);

/** Bounds, so the report stays a report. A tree of ten thousand files is not context, it is noise. */
export const SURVEY_LIMITS = { depth: 3, entries: 200 } as const;

export interface Manifest {
  file: string;
  /** What the project calls itself, when it says. */
  name?: string;
  /** Runnable scripts or targets, by name. */
  scripts?: string[];
  /** Direct dependencies, by name only — versions are churn, not context. */
  dependencies?: string[];
}

export interface WorkspaceSurvey {
  /** Paths relative to the workspace root, directories marked with a trailing slash. */
  tree: string[];
  manifests: Manifest[];
  /** True when the walk stopped at `SURVEY_LIMITS` rather than at the end of the tree. */
  truncated: boolean;
}

export function surveyWorkspace(projectDirectory: string): WorkspaceSurvey {
  const tree: string[] = [];
  const manifests: Manifest[] = [];
  let truncated = false;

  const walk = (directory: string, depth: number): void => {
    if (depth > SURVEY_LIMITS.depth) return;

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (tree.length >= SURVEY_LIMITS.entries) {
        truncated = true;
        return;
      }
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (SKIP.has(entry.name)) continue;

      const full = join(directory, entry.name);
      const shown = relative(projectDirectory, full).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        tree.push(`${shown}/`);
        walk(full, depth + 1);
        continue;
      }

      tree.push(shown);
      const manifest = readManifest(full, shown);
      if (manifest !== null) manifests.push(manifest);
    }
  };

  walk(projectDirectory, 1);

  return { tree, manifests, truncated };
}

/** The manifests worth reading, and what is worth taking out of each. */
function readManifest(path: string, shown: string): Manifest | null {
  const name = shown.split('/').pop() ?? '';

  if (name === 'package.json') {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        name?: unknown;
        scripts?: Record<string, unknown>;
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };

      return {
        file: shown,
        ...(typeof parsed.name === 'string' ? { name: parsed.name } : {}),
        scripts: Object.keys(parsed.scripts ?? {}),
        dependencies: [
          ...Object.keys(parsed.dependencies ?? {}),
          ...Object.keys(parsed.devDependencies ?? {}),
        ],
      };
    } catch {
      return { file: shown };
    }
  }

  if (['pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml'].includes(name)) {
    /*
     * Read as text and reported as text. Parsing three more formats to extract names would be three
     * more parsers to keep right, and the architect reading this can read a `go.mod` perfectly well.
     */
    try {
      return { file: shown, dependencies: firstLines(readFileSync(path, 'utf8'), 40) };
    } catch {
      return { file: shown };
    }
  }

  return null;
}

const firstLines = (text: string, count: number): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, count);

/** `handoff/RESEARCH.md` — beside the plan, inside the workspace every executor has mounted. */
export const RESEARCH_FILE = join('handoff', 'RESEARCH.md');

export function researchPath(projectDirectory: string): string {
  return join(projectDirectory, RESEARCH_FILE);
}

export function renderSurvey(survey: WorkspaceSurvey, brief: string | null): string {
  const lines = [
    '# Контекст рабочей директории',
    '',
    'Составлен исследователем контура по состоянию диска. Дерево и манифесты прочитаны, не угаданы.',
    '',
  ];

  if (brief !== null) lines.push('## Кратко', '', brief, '');

  lines.push('## Дерево', '');
  lines.push(
    survey.tree.length === 0 ? '_Пусто._' : survey.tree.map((entry) => `- \`${entry}\``).join('\n'),
  );
  if (survey.truncated)
    lines.push('', `_Показаны первые ${String(SURVEY_LIMITS.entries)} записей._`);

  lines.push('', '## Манифесты', '');

  if (survey.manifests.length === 0) {
    lines.push('_Манифестов не найдено._');
  } else {
    for (const manifest of survey.manifests) {
      lines.push(`### \`${manifest.file}\``);
      if (manifest.name !== undefined) lines.push(`- имя: \`${manifest.name}\``);
      if (manifest.scripts !== undefined && manifest.scripts.length > 0) {
        lines.push(`- команды: ${manifest.scripts.map((entry) => `\`${entry}\``).join(', ')}`);
      }
      if (manifest.dependencies !== undefined && manifest.dependencies.length > 0) {
        lines.push(`- зависимости: ${manifest.dependencies.slice(0, 40).join(', ')}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

const SYSTEM = [
  'Ты — исследователь автономного контура доставки. По снимку рабочей директории ты пишешь',
  'КОРОТКУЮ справку для агента, который будет писать в этот проект: что здесь уже есть, какой',
  'слой куда положен, какими командами это проверяется. Только факты из снимка, без советов и',
  'без предположений. Не более восьми строк, обычным текстом.',
].join(' ');

export interface ResearchResult {
  /** The whole report, as written to `handoff/RESEARCH.md`. */
  report: string;
  /** Which provider wrote the brief, or `null` when only the survey is there. */
  writtenBy: string | null;
  survey: WorkspaceSurvey;
}

/**
 * Surveys the workspace, asks for a brief if a chain is configured, and writes the report to disk.
 *
 * Written to disk rather than kept in memory for the same reason everything else here is: the file
 * is inside the workspace each executor container mounts, so the report an architect saw and the
 * report an executor can read are one file.
 */
export async function research(
  projectDirectory: string,
  chain: Chain | null,
): Promise<ResearchResult> {
  const survey = surveyWorkspace(projectDirectory);
  let brief: string | null = null;
  let writtenBy: string | null = null;

  if (chain !== null && chain.providers.length > 0) {
    try {
      const answer = await chain.generate({
        system: SYSTEM,
        prompt: renderSurvey(survey, null),
        maxOutputTokens: 700,
      });

      const text = answer.text.trim();
      if (text !== '') {
        brief = text;
        writtenBy = answer.provider;
      }
    } catch {
      /* A brief nobody could write costs the brief. The survey is the report either way. */
    }
  }

  const report = renderSurvey(survey, brief);

  /*
   * Into `handoff/`, creating it if the intake has not yet — the researcher runs *before* the
   * assignments are written, and the report belongs beside them whichever arrives first.
   */
  mkdirSync(dirname(researchPath(projectDirectory)), { recursive: true });
  writeFileSync(researchPath(projectDirectory), report, 'utf8');

  return { report, writtenBy, survey };
}

/** What an assignment prompt carries: the report, trimmed to a size a prompt can hold. */
export function researchForPrompt(report: string, limit = 4_000): string {
  return report.length <= limit ? report : `${report.slice(0, limit)}\n…`;
}

/** Whether a directory has been surveyed at all — read by the cycle before a re-survey. */
export function hasResearch(projectDirectory: string): boolean {
  const path = researchPath(projectDirectory);

  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}
