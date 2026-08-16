import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { contrastRatio, parseOklch, WCAG_AA_LARGE, WCAG_AA_TEXT, type Oklch } from './contrast';
import { resolveTheme, SERVER_DEFAULT_THEME, themeScriptSource, THEME_STORAGE_KEY } from './theme';

/**
 * The token gate (task 124).
 *
 * Three claims are made here, and each one is the kind that reviews miss:
 *
 * 1. **Contrast is measured, not eyeballed.** Every foreground/surface pair the components actually
 *    use is converted from OKLCH to sRGB and checked against WCAG AA — in both themes. A palette
 *    tweak that dims a badge below the threshold is a red test, not a discovery made by a user.
 * 2. **Colour has one home.** No CSS file in `src/` other than the brand file may name a colour.
 *    The TypeScript half of the same rule is `design-tokens/no-raw-colours` in lint.
 * 3. **The tint is ours.** The reference product's brand hues are recorded here as numbers, and our
 *    brand tokens must stay clear of them — copying their structure was the brief, copying their
 *    palette was explicitly not.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const BRAND_FILE = path.join(REPO_ROOT, 'src/app/brand.css');
const SRC_DIR = path.join(REPO_ROOT, 'src');

const brandCss = readFileSync(BRAND_FILE, 'utf8');

type Palette = Record<string, Oklch>;

/** Reads the `--palette-*` declarations out of one CSS block. */
function readPalette(selector: string): Palette {
  const start = brandCss.indexOf(selector);
  expect(start, `${selector} block is missing from brand.css`).toBeGreaterThanOrEqual(0);

  const open = brandCss.indexOf('{', start);
  const close = brandCss.indexOf('}', open);
  const block = brandCss.slice(open + 1, close);

  const palette: Palette = {};
  for (const match of block.matchAll(/--palette-([\w-]+):\s*([^;]+);/g)) {
    const name = match[1] ?? '';
    const value = match[2] ?? '';
    const colour = parseOklch(value);
    expect(colour, `--palette-${name} is not written in OKLCH notation: ${value}`).not.toBeNull();
    if (colour) palette[name] = colour;
  }

  return palette;
}

/** Fails loudly rather than silently skipping a pair the palette forgot to declare. */
function token(palette: Palette, name: string): Oklch {
  const colour = palette[name];
  if (!colour) throw new Error(`--palette-${name} is missing from brand.css`);
  return colour;
}

const light = readPalette(':root {');
const dark = readPalette(":root[data-theme='dark']");

/**
 * The pairs the interface actually paints, each with the threshold that applies to it.
 *
 * `4.5` is body text; `3` is the large-text and non-text-contrast threshold, used for the border
 * that outlines a control.
 */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ['foreground', 'background', WCAG_AA_TEXT],
  ['foreground', 'surface', WCAG_AA_TEXT],
  ['foreground', 'surface-muted', WCAG_AA_TEXT],
  ['foreground-muted', 'background', WCAG_AA_TEXT],
  ['foreground-muted', 'surface', WCAG_AA_TEXT],
  ['foreground-muted', 'surface-muted', WCAG_AA_TEXT],
  ['foreground-subtle', 'surface', WCAG_AA_TEXT],
  ['primary-ink', 'surface', WCAG_AA_TEXT],
  ['primary-ink', 'background', WCAG_AA_TEXT],
  ['primary-ink', 'primary-soft', WCAG_AA_TEXT],
  ['primary-foreground', 'primary', WCAG_AA_TEXT],
  ['primary-foreground', 'danger', WCAG_AA_TEXT],
  ['success-ink', 'surface', WCAG_AA_TEXT],
  ['success-ink', 'success-soft', WCAG_AA_TEXT],
  ['warning-ink', 'surface', WCAG_AA_TEXT],
  ['warning-ink', 'warning-soft', WCAG_AA_TEXT],
  ['danger-ink', 'surface', WCAG_AA_TEXT],
  ['danger-ink', 'danger-soft', WCAG_AA_TEXT],
  ['diff-added-ink', 'surface', WCAG_AA_TEXT],
  ['diff-added-ink', 'diff-added-soft', WCAG_AA_TEXT],
  ['diff-removed-ink', 'surface', WCAG_AA_TEXT],
  ['diff-removed-ink', 'diff-removed-soft', WCAG_AA_TEXT],
  ['border-strong', 'surface', WCAG_AA_LARGE],
  ['border-strong', 'background', WCAG_AA_LARGE],
  ['primary', 'surface', WCAG_AA_LARGE],
];

describe('brand palette', () => {
  it('declares the same tokens in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('backs every theme token with a palette variable', () => {
    const themeBlock = brandCss.slice(brandCss.indexOf('@theme inline'));
    const references = [...themeBlock.matchAll(/var\(--palette-([\w-]+)\)/g)].map(
      (match) => match[1] ?? '',
    );

    expect(references.length).toBeGreaterThan(0);
    for (const name of references) expect(light).toHaveProperty(name);
  });

  describe.each([
    ['light', light],
    ['dark', dark],
  ])('%s theme meets WCAG AA', (_name, palette) => {
    it.each(PAIRS)('%s on %s reaches %d:1', (foreground, background, minimum) => {
      expect(
        contrastRatio(token(palette, foreground), token(palette, background)),
      ).toBeGreaterThanOrEqual(minimum);
    });
  });

  /*
   * The reference product's brand colours (#5939e2, #02dede, #a249f9) converted to OKLCH. Recorded
   * as hue angles rather than as literals so that this file does not itself become a second place
   * where a colour is written down — and so the assertion is about the thing that reads as a brand,
   * which is hue, not a byte-exact value.
   */
  const REFERENCE_BRAND_HUES = [282.1, 194.8, 302.6];
  const MINIMUM_SEPARATION_DEGREES = 25;

  it.each([
    ['light', light],
    ['dark', dark],
  ])('keeps the %s brand clear of the reference product', (_name, palette) => {
    for (const name of ['brand', 'brand-accent', 'primary']) {
      for (const theirs of REFERENCE_BRAND_HUES) {
        const separation = hueDistance(token(palette, name).h, theirs);
        expect(
          separation,
          `--palette-${name} sits ${separation.toFixed(1)}° from a reference brand hue`,
        ).toBeGreaterThanOrEqual(MINIMUM_SEPARATION_DEGREES);
      }
    }
  });
});

describe('colour has one home', () => {
  it('is the only stylesheet in src that names a colour', () => {
    const offenders: string[] = [];

    for (const file of cssFiles(SRC_DIR)) {
      if (file === BRAND_FILE) continue;

      const source = readFileSync(file, 'utf8');
      const match =
        /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z])/.exec(source) ??
        /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/.exec(source);

      if (match) offenders.push(`${path.relative(REPO_ROOT, file)}: ${match[0]}`);
    }

    expect(offenders).toEqual([]);
  });
});

describe('theme persistence', () => {
  it('prefers a stored choice over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system when nothing is stored, and never returns junk', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('purple', false)).toBe(SERVER_DEFAULT_THEME);
  });

  it('ships a pre-hydration script that reads the same key the toggle writes', () => {
    const source = themeScriptSource();

    expect(source).toContain(THEME_STORAGE_KEY);
    expect(source).toContain('prefers-color-scheme: dark');
    // A throw inside <head> would stop the document; storage can be denied.
    expect(source).toContain('try{');
  });
});

function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}
