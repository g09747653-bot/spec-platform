import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderVendoredModule } from '../../../../scripts/build-methodology-templates.mjs';

import { templateSections, templateText } from './sections';
import { VENDORED_TEMPLATES, VENDORED_TEMPLATE_IDS } from './vendored';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The vendoring is honest, and stays honest (task 116 AC-4).
 *
 * Three claims are asserted, and each one is a way the vendoring could quietly stop being vendoring:
 *
 * 1. **The generated module is the markdown.** Regenerating in memory and comparing means an edit to
 *    either side alone is a red build — nobody can "fix" a template by editing the `.ts` and leave
 *    the file the LICENSE covers saying something else.
 * 2. **Every vendor directory carries its licence**, and the README carries the NOTICE section that
 *    names them. A copy without its licence is not a copy that was permitted.
 * 3. **The section lists come from the templates**, including the case where a template prescribes
 *    none — asserted by value, so a parser change that silently emptied a list would fail here rather
 *    than in a live generation.
 */
describe('vendored methodology templates (task 116)', () => {
  it('is regenerated exactly from the markdown beside it', () => {
    const generated = readFileSync(join(HERE, 'vendored.ts'), 'utf8').replace(/\r\n/g, '\n');

    expect(generated).toBe(renderVendoredModule());
  });

  it('ships one licence per vendor directory', () => {
    for (const vendor of ['speckit', 'openspec']) {
      const files = readdirSync(join(HERE, vendor));

      expect(files).toContain('LICENSE');
      expect(readFileSync(join(HERE, vendor, 'LICENSE'), 'utf8')).toContain('MIT License');
    }
  });

  it('is named in the repository README’s NOTICE section', () => {
    const readme = readFileSync(join(HERE, '..', '..', '..', '..', 'README.md'), 'utf8');
    const notice = readme.slice(readme.indexOf('## NOTICE'));

    expect(notice).not.toBe('');
    expect(notice).toContain('github/spec-kit');
    expect(notice).toContain('Fission-AI/OpenSpec');
    expect(notice).toContain('src/modules/methodologies/templates');
  });

  it('exposes every template it vendors, non-empty', () => {
    expect(VENDORED_TEMPLATE_IDS.length).toBe(Object.keys(VENDORED_TEMPLATES).length);

    for (const id of VENDORED_TEMPLATE_IDS) {
      expect(templateText(id).trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * The headings are the template's, not ours — asserted as a property, not as a list of strings.
   *
   * Writing the expected headings out here was the first draft, and lint rejected it: two of them
   * are also baseline section names, and a file naming two baseline headings is the duplicated
   * structural truth P3 forbids (D-16). The rule was right, and the property is the better test
   * anyway. What is worth proving is that the parser *takes* headings rather than inventing them,
   * and that it drops exactly the scaffolding — which is checkable without repeating a single one.
   */
  const headings = (id: (typeof VENDORED_TEMPLATE_IDS)[number]) =>
    (templateSections(id) ?? []).map((section) => section.heading);

  it('returns only headings that appear verbatim in the template', () => {
    for (const id of VENDORED_TEMPLATE_IDS) {
      const lines = templateText(id).split('\n');

      for (const heading of headings(id)) {
        const found = lines.some((line) => {
          const match = /^ {0,3}##[ \t]+(.+?)[ \t]*$/.exec(line);
          return match !== null && (match[1] ?? '').replace(/\s*\*\([^)]*\)\*\s*$/, '') === heading;
        });

        expect(found, `${id}: "${heading}" is not a level-2 heading of the template`).toBe(true);
      }

      // Every section is level 2 — the document title is level 1 and varies with the product.
      for (const section of templateSections(id) ?? []) expect(section.level).toBe(2);
    }
  });

  it('drops placeholders, comments and ordinals, and keeps everything else', () => {
    for (const id of VENDORED_TEMPLATE_IDS) {
      for (const heading of headings(id)) {
        expect(heading, `${id}: "${heading}" carries a placeholder`).not.toMatch(/\[|<!--/);
        expect(heading, `${id}: "${heading}" is ordinal`).not.toMatch(
          /(^|\s)(\d+|[A-Z])(\.|:|\)|\b)/,
        );
      }
    }

    // spec-kit's constitution names five principles and two extra sections as placeholders; only the
    // two fixed headings survive. spec-kit's task list numbers its phases per user story, so none of
    // the `Phase …` headings is required — the four that remain are the ones every list carries.
    expect(headings('speckit/constitution-template')).toHaveLength(2);
    expect(headings('speckit/spec-template')).toHaveLength(4);
    expect(headings('speckit/plan-template')).toHaveLength(5);
    expect(headings('speckit/tasks-template')).toHaveLength(4);
    expect(headings('speckit/tasks-template').some((heading) => heading.startsWith('Phase'))).toBe(
      false,
    );

    expect(headings('openspec/proposal')).toHaveLength(4);
    expect(headings('openspec/spec')).toHaveLength(2);
    expect(headings('openspec/design')).toHaveLength(4);
    expect(headings('myspec/proposal-template')).toHaveLength(5);
  });

  it('answers null for a template that prescribes no fixed headings', () => {
    // OpenSpec's task list is `## 1. <Task Group Name>` — numbered groups the change names. There is
    // no heading to require, and inventing one would be exactly what vendoring exists to avoid.
    expect(templateSections('openspec/tasks')).toBeNull();
  });
});
