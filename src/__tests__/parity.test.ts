import { describe, expect, it } from 'vitest';

import { createTestDoubleAdapter } from '@/modules/adapters/llm';
import { createSpecAgent } from '@/modules/agents/spec/spec-agent';
import { assembleBundle } from '@/modules/specs/export/bundle';
import { CORE_SPEC_TYPES, specFileName, type CoreSpecType } from '@/modules/specs/model/spec-files';
import { validateStructure } from '@/modules/specs/validate-structure';

/**
 * The parity structural check (task 40; constitution P3 and Testing Approaches item 4; NFR-007).
 *
 * This is the enforcement mechanism for P3, so it is build-blocking: it runs in `pnpm test:unit`,
 * which CI runs on every change.
 *
 * It is a **generation** test, not a fixture comparison. A prompt is assembled for each spec type,
 * the stub provider answers it by writing the sections the prompt asked for, and the output is checked
 * with `validateStructure`. Both halves therefore trace back to `section-schema.ts` and to nothing
 * else: renaming a section moves the instruction and the assertion together, and no file in this test
 * — or anywhere else outside the schema — spells a heading out.
 *
 * It lives outside `src/modules/` deliberately. The check spans `prompts`, `agents`, `adapters/llm`
 * and `specs`; putting it inside any one of those would mean that module importing the others, which
 * the allowed-edge table forbids (D-41).
 */

/** Generates one spec file the way the application does, against the deterministic stub (IR-001-AC-5). */
async function generate(specType: CoreSpecType): Promise<string> {
  const agent = createSpecAgent(createTestDoubleAdapter({ followPrompt: true }));

  const result = await agent.generate({
    specType,
    initialPrompt: 'A tool that turns a prompt into a specification bundle.',
    runId: `parity-${specType}`,
  });

  return result.content;
}

describe('parity: generated files carry their required sections', () => {
  for (const specType of CORE_SPEC_TYPES) {
    it(`${specType}.md conforms to the section schema`, async () => {
      const content = await generate(specType);
      const result = validateStructure(specType, content);

      expect(result.violations).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }

  it('every core type requires at least one section, so conformance is a real claim', async () => {
    for (const specType of CORE_SPEC_TYPES) {
      const content = await generate(specType);
      // A document with no headings at all must fail; if it passed, the schema for this type would be
      // empty and the check above would be asserting nothing.
      expect(validateStructure(specType, 'no headings here, only prose').valid).toBe(false);
      expect(content).toMatch(/^## /m);
    }
  });
});

describe('parity: the check blocks the build on violation', () => {
  it('rejects output with a required section removed', async () => {
    const [specType] = CORE_SPEC_TYPES;
    const content = await generate(specType);
    const headings = [...content.matchAll(/^## .+$/gm)].map((match) => match[0]);
    const [firstHeading] = headings;

    expect(firstHeading).toBeDefined();
    const mutilated = content.replace(`${firstHeading ?? ''}\n`, '');

    const result = validateStructure(specType, mutilated);
    expect(result.valid).toBe(false);
    expect(result.violations[0]?.code).toBe('MISSING_HEADING');
  });

  it('rejects output whose sections are in the wrong order', async () => {
    const [specType] = CORE_SPEC_TYPES;
    const content = await generate(specType);
    const headings = [...content.matchAll(/^## .+$/gm)].map((match) => match[0]);
    const [first, second] = headings;

    expect(second).toBeDefined();

    // Swap the first two section headings; every heading is still present, only the order changed.
    const swapped = content
      .replace(first ?? '', '@@FIRST@@')
      .replace(second ?? '', first ?? '')
      .replace('@@FIRST@@', second ?? '');

    const result = validateStructure(specType, swapped);
    expect(result.valid).toBe(false);
    expect(result.violations.map((violation) => violation.code)).toContain('HEADING_OUT_OF_ORDER');
  });
});

describe('parity: a default-mode export is exactly the four files', () => {
  it('contains the four parity names and nothing else', async () => {
    const files = await Promise.all(
      CORE_SPEC_TYPES.map(async (specType) => ({
        specType,
        fileName: specFileName(specType),
        content: await generate(specType),
        revisionNumber: 1,
      })),
    );

    const bundle = assembleBundle(files, 'default');

    expect(bundle.included).toEqual(CORE_SPEC_TYPES.map((specType) => specFileName(specType)));
    expect(bundle.omitted).toEqual([]);
    expect(bundle.included).not.toContain('quality.md');
    expect(bundle.mode).toBe('default');
  });

  it('omits quality.md even when a quality file exists on the project', async () => {
    const files = [
      ...(await Promise.all(
        CORE_SPEC_TYPES.map(async (specType) => ({
          specType,
          fileName: specFileName(specType),
          content: await generate(specType),
          revisionNumber: 1,
        })),
      )),
      {
        specType: 'quality' as const,
        fileName: specFileName('quality'),
        content: '# Quality\n\n## Traceability Matrix\n',
        revisionNumber: 1,
      },
    ];

    const bundle = assembleBundle(files, 'default');

    expect(bundle.included).toHaveLength(4);
    expect(bundle.included).not.toContain('quality.md');
  });
});
