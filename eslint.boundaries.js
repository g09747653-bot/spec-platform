/**
 * Module boundaries — the single encoding of the allowed-edge table in
 * `.specs/solution.md` § "Enforced Module Boundaries" (constitution A1, D-17).
 *
 * This file is the only place the table exists in code. It is imported by
 * `eslint.config.js` (production lint) and by `eslint.fixtures.config.js`
 * (the deliberate-violation fixtures exercised by `pnpm test:boundaries`).
 *
 * A zone reads: files under `target` may not import from `from`.
 */

const MODULES = 'src/modules';

/**
 * For each module, the module paths it may NOT import, derived by complement from the
 * allowed-edge table. Anything not listed here is an allowed edge.
 */
const FORBIDDEN_IMPORTS = {
  // `web` may reach the domain only through server actions and route handlers.
  web: ['agents', 'quality', 'adapters'],
  // `workflow` may import repository interfaces, `specs` types, capability interfaces.
  workflow: ['agents', 'prompts', 'projects', 'quality', 'adapters', 'web'],
  // `agents` may import prompts, specs, projects, adapters/llm, adapters/research, workflow.
  agents: ['quality', 'web', 'adapters/parsing', 'adapters/storage'],
  // `quality` may import prompts, specs, adapters/llm.
  quality: [
    'workflow',
    'agents',
    'projects',
    'web',
    'adapters/research',
    'adapters/parsing',
    'adapters/storage',
  ],
  // `specs` may import repository interfaces and capability interfaces only.
  specs: ['workflow', 'agents', 'prompts', 'projects', 'quality', 'adapters', 'web'],
  // `projects` may import repository interfaces, adapters/parsing, adapters/storage.
  projects: [
    'workflow',
    'agents',
    'prompts',
    'specs',
    'quality',
    'web',
    'adapters/llm',
    'adapters/research',
  ],
  // `prompts` may import `specs` (the section schema) only.
  prompts: ['workflow', 'agents', 'projects', 'quality', 'adapters', 'web'],
  // `adapters/*` may import external SDKs and configuration only — never a core module.
  adapters: ['workflow', 'agents', 'prompts', 'specs', 'projects', 'quality', 'web'],
};

/** Repository implementations `web` must never reach directly (solution.md; D-13). */
const REPOSITORY_PATHS = [
  `./${MODULES}/projects/repositories`,
  `./${MODULES}/specs/repositories`,
  `./${MODULES}/workflow/repositories`,
];

const zones = [];

for (const [target, forbidden] of Object.entries(FORBIDDEN_IMPORTS)) {
  for (const from of forbidden) {
    zones.push({
      target: `./${MODULES}/${target}`,
      from: `./${MODULES}/${from}`,
      message: `Forbidden module edge: '${target}' may not import '${from}'. See .specs/solution.md § Enforced Module Boundaries.`,
    });
  }
}

zones.push({
  target: `./${MODULES}/web`,
  from: REPOSITORY_PATHS,
  message:
    "Forbidden module edge: 'web' may not import a repository directly; go through a server action or route handler.",
});

// Constitution A6: nothing may import `quality`; it is reachable only through the
// capability registry. Route handlers and server actions are covered here; the core
// modules are covered by their own deny lists above.
zones.push({
  target: ['./src/app', './src/config', './src/db'],
  from: `./${MODULES}/quality`,
  message:
    "Forbidden module edge: nothing may import 'quality'. It is reachable only through the capability registry (constitution A6).",
});

export const boundaryZones = zones;

/** The rule entry shared by every ESLint configuration in this repository. */
export const noRestrictedPathsRule = [
  'error',
  {
    basePath: import.meta.dirname,
    zones,
  },
];
