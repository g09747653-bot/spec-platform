/**
 * "One home for colour", as lint (task 124).
 *
 * The design-token AC is only worth anything if it cannot be quietly undone: a single
 * `text-red-700` dropped into a component during a hurried fix is a surface that no longer follows
 * the theme, and nobody notices until the dark theme looks broken. So the rule is build-blocking —
 * every colour in `src/**` comes from a token, and the tokens are declared in exactly one file.
 *
 * This half covers TypeScript and TSX. The CSS half — "no file but the brand file names a colour" —
 * is asserted in `src/modules/web/theme/brand.test.ts`, because ESLint does not parse CSS.
 *
 * Imported by `eslint.config.js` (production lint) and `eslint.fixtures.config.js` (the
 * deliberate-violation fixtures behind `pnpm test:boundaries`), so the two can never disagree.
 */

/** The single file allowed to name a colour. Referenced in messages, not linted here (it is CSS). */
export const BRAND_FILE = 'src/app/brand.css';

/** Files this rule applies to. */
const LINTED = ['src/**/*.{ts,tsx}'];

/** `#abc`, `#abcd`, `#aabbcc`, `#aabbccdd` — and nothing else beginning with a hash. */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z])/;

/** `rgb(`, `oklch(`, `color-mix(` … — a colour written as a CSS function. */
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\s*\(/;

/**
 * A Tailwind utility carrying a palette colour rather than a token.
 *
 * `text-red-700` and `bg-white` are the shapes that matter: they bypass the theme entirely, which
 * is exactly the failure the token system exists to prevent.
 */
const PALETTE_UTILITY =
  /(?:^|[\s"'`:[])(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|placeholder|caret|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d{1,3})?(?![-\w])/;

const noRawColours = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid colour literals and palette utilities outside the brand file (task 124; Эталон §1.5).',
    },
    schema: [],
    messages: {
      literal:
        'Raw colour "{{match}}": colours live only in {{brand}} and reach components as tokens ' +
        '(bg-surface, text-foreground-muted, text-danger-ink…). A literal here does not follow the theme.',
      utility:
        'Palette utility "{{match}}": it paints the same colour in both themes. Use the token ' +
        'utility for the role instead — the tokens are declared in {{brand}}.',
    },
  },
  create(context) {
    function consider(node, raw) {
      if (typeof raw !== 'string') return;

      const literal = HEX_COLOUR.exec(raw) ?? COLOUR_FUNCTION.exec(raw);
      if (literal) {
        context.report({
          node,
          messageId: 'literal',
          data: { match: literal[0], brand: BRAND_FILE },
        });
        return;
      }

      const utility = PALETTE_UTILITY.exec(raw);
      if (utility) {
        context.report({
          node,
          messageId: 'utility',
          data: { match: utility[0].trim(), brand: BRAND_FILE },
        });
      }
    }

    return {
      Literal(node) {
        consider(node, node.value);
      },
      TemplateElement(node) {
        consider(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export const designTokensPlugin = {
  rules: { 'no-raw-colours': noRawColours },
};

/** The rule entry, so the fixtures configuration enables exactly what production enables. */
export const designTokensRule = { 'design-tokens/no-raw-colours': 'error' };

/*
 * No exemptions. The one file that converts OKLCH to sRGB does so with a regular expression, which
 * is a RegExp node rather than a string literal and is therefore not reported — the rule looks at
 * values, not at prose or patterns.
 */
export const designTokensConfigs = [
  {
    files: LINTED,
    plugins: { 'design-tokens': designTokensPlugin },
    rules: designTokensRule,
  },
];
