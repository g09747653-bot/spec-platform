#!/usr/bin/env node
/**
 * Regenerates `src/modules/methodologies/templates/vendored.ts` from the vendored markdown files
 * beside it (task 116).
 *
 * The `.md` files are the vendored originals — byte-for-byte what their upstream repositories serve,
 * kept next to the LICENSE that permits the copy. The generated `.ts` exists because prompt assembly
 * runs inside a bundle where `fs` is not a dependency to reach for, and because a template read at
 * request time is a template that can differ from the one in the diff.
 *
 * `templates/vendored.test.ts` regenerates in memory and compares, so an edit to either side without
 * the other fails CI rather than drifting quietly.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(ROOT, 'src', 'modules', 'methodologies', 'templates');

/** Template directories, in the order their constants are emitted. */
const VENDORS = [
  {
    dir: 'myspec',
    source: 'this repository (no vendored material)',
    path: '',
    licence: 'own work',
  },
  {
    dir: 'speckit',
    source: 'https://github.com/github/spec-kit',
    path: 'templates/',
    licence: 'MIT',
  },
  {
    dir: 'openspec',
    source: 'https://github.com/Fission-AI/OpenSpec',
    path: 'schemas/spec-driven/templates/',
    licence: 'MIT',
  },
];

/** `speckit/spec-template.md` → `SPECKIT_SPEC`. */
function constantName(dir, file) {
  return `${dir}_${file.replace(/-template\.md$|\.md$/, '')}`.replace(/-/g, '_').toUpperCase();
}

function templateId(dir, file) {
  return `${dir}/${file.replace(/\.md$/, '')}`;
}

export function renderVendoredModule() {
  const entries = [];

  for (const vendor of VENDORS) {
    const files = readdirSync(join(TEMPLATES, vendor.dir))
      .filter((name) => name.endsWith('.md'))
      .sort();

    for (const file of files) {
      entries.push({
        vendor,
        file,
        constant: constantName(vendor.dir, file),
        id: templateId(vendor.dir, file),
        // Normalised to LF: git may hand these back with CRLF on Windows, and a prompt whose bytes
        // depend on the checkout is not a versioned asset.
        text: readFileSync(join(TEMPLATES, vendor.dir, file), 'utf8').replace(/\r\n/g, '\n'),
      });
    }
  }

  const lines = [
    '/*',
    ' * GENERATED FILE — do not edit by hand.',
    ' *',
    ' * Produced by `node scripts/build-methodology-templates.mjs` from the vendored markdown beside',
    ' * this file. Each constant is one upstream template, copied verbatim under the licence stored in',
    ' * that vendor directory; `templates/vendored.test.ts` fails if this file and the markdown disagree.',
    ' */',
    '',
    '/** Every vendored template, keyed by `<vendor>/<file>`. */',
    '',
  ];

  for (const entry of entries) {
    lines.push(
      `/** \`${entry.vendor.path}${entry.file}\` from ${entry.vendor.source} (${entry.vendor.licence}). */`,
      `const ${entry.constant} = ${JSON.stringify(entry.text)};`,
      '',
    );
  }

  lines.push(
    'export const VENDORED_TEMPLATES = Object.freeze({',
    ...entries.map((entry) => `  '${entry.id}': ${entry.constant},`),
    '});',
    '',
    'export type VendoredTemplateId = keyof typeof VENDORED_TEMPLATES;',
    '',
    'export const VENDORED_TEMPLATE_IDS = Object.keys(VENDORED_TEMPLATES) as VendoredTemplateId[];',
    '',
  );

  return lines.join('\n');
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('build-methodology-templates.mjs')
) {
  const target = join(TEMPLATES, 'vendored.ts');
  writeFileSync(target, renderVendoredModule(), 'utf8');
  console.log(`wrote ${target}`);
}
