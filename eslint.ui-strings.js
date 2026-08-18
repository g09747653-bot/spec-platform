/**
 * "No copy in a component", as lint (task 143).
 *
 * The Russian interface is only worth building if it cannot be quietly un-built: one `Save` typed
 * straight into a button during a hurried fix is a surface that ships untranslated, and nobody
 * notices until a screenshot arrives from the customer. So the rule is build-blocking — every word
 * a person reads comes from the phrase dictionary, and the dictionary holds both languages in one
 * entry (see `src/modules/web/i18n/phrase.ts`).
 *
 * **The rule is contextual, not lexical.** It does not ask whether a string *looks* like prose —
 * that question has no good answer, and a rule that guesses is a rule people learn to work around.
 * It asks where the string is: text a browser paints, an attribute a screen reader announces, or an
 * expression printed into JSX. Those three positions are the whole of what a reader can see, and
 * `className`, `data-testid`, `href` and every other machine-facing attribute are outside the rule
 * by construction rather than by allowlist.
 *
 * The other half of the enforcement is the type system, and it covers what lint cannot see: copy
 * that never passes through JSX — a toast, a notice, a table of gate explanations — is typed as a
 * `PhraseKey`, so a literal there does not compile. Between the two, an untranslated surface is
 * unrepresentable rather than merely discouraged.
 *
 * Imported by `eslint.config.js`.
 */

/** Everything a user reads is rendered from these two trees. */
const LINTED = ['src/modules/web/**/*.tsx', 'src/app/**/*.tsx'];

/** The dictionary itself: the one place a literal phrase is the point. */
const EXEMPT = ['src/modules/web/i18n/**'];

/** Any letter in any script: the rule must catch a forgotten Russian literal too. */
const HAS_LETTER = /\p{L}/u;

/**
 * Attributes whose value is announced or shown to a person.
 *
 * `title` and `alt` are painted, `aria-label` and friends are spoken, `placeholder` is both. Every
 * other attribute — `className`, `href`, `data-*`, `role`, `type`, `id`, `key` — addresses the
 * machine and is deliberately absent.
 */
const SPOKEN_ATTRIBUTES = new Set([
  'title',
  'alt',
  'placeholder',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'summary',
]);

/**
 * Calls whose string arguments are machine tokens even inside JSX.
 *
 * `cn` composes class names, `String` converts, `encodeURIComponent` escapes. A literal in one of
 * these never reaches a reader as a word.
 */
const MACHINE_CALLS = new Set(['cn', 'String', 'JSON.stringify', 'encodeURIComponent']);

function calleeName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier') {
    return `${node.object.name}.${node.property.name ?? ''}`;
  }

  return '';
}

const noLiteralCopy = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid literal user-facing copy in components; every phrase comes from the dictionary (task 143).',
    },
    schema: [],
    messages: {
      text:
        'Literal copy "{{match}}" in JSX. Print it through the dictionary — `const t = useT()` in a ' +
        'client component, `const t = await serverT()` on the server — so the Russian interface ' +
        'cannot ship a forgotten English word (task 143).',
      attribute:
        'Literal copy in `{{name}}`: this text is shown or announced to a person. Take it from the ' +
        'dictionary with `t(...)` — an untranslated `{{name}}` is invisible in a screenshot and ' +
        'audible to a screen reader (task 143).',
      expression:
        'Literal copy "{{match}}" printed into JSX. Both languages of a phrase live in one entry in ' +
        'src/modules/web/i18n/dictionary; a literal here has only one (task 143).',
    },
  },

  create(context) {
    function considerPrinted(node, raw) {
      if (typeof raw !== 'string' || !HAS_LETTER.test(raw)) return;

      context.report({ node, messageId: 'expression', data: { match: raw.trim().slice(0, 40) } });
    }

    /**
     * Walks an expression printed into JSX, reporting the literals a reader would see.
     *
     * Only the node types that can *print* a string are descended into. A call expression is not
     * one of them — `{t('key')}` and `{cn(...)}` both stop the walk, which is what keeps the rule
     * free of an allowlist of helpers.
     */
    function walkPrinted(node) {
      if (node === null || node === undefined || typeof node.type !== 'string') return;

      switch (node.type) {
        case 'Literal':
          considerPrinted(node, node.value);
          return;
        case 'TemplateLiteral':
          for (const quasi of node.quasis) considerPrinted(quasi, quasi.value.cooked ?? '');
          for (const expression of node.expressions) walkPrinted(expression);
          return;
        case 'ConditionalExpression':
          walkPrinted(node.consequent);
          walkPrinted(node.alternate);
          return;
        case 'LogicalExpression':
        case 'BinaryExpression':
          walkPrinted(node.left);
          walkPrinted(node.right);
          return;
        case 'CallExpression':
          // `t('key')`, `cn('…')`, `String(n)` — the argument is a key or a token, not copy.
          if (!MACHINE_CALLS.has(calleeName(node.callee))) return;
          return;
        default:
          return;
      }
    }

    function reportAttribute(node, name) {
      context.report({ node, messageId: 'attribute', data: { name } });
    }

    return {
      JSXText(node) {
        if (!HAS_LETTER.test(node.value)) return;

        context.report({
          node,
          messageId: 'text',
          data: { match: node.value.trim().slice(0, 40) },
        });
      },

      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : '';
        if (!SPOKEN_ATTRIBUTES.has(name)) return;

        const value = node.value;
        if (value === null) return;

        if (value.type === 'Literal') {
          if (typeof value.value === 'string' && HAS_LETTER.test(value.value)) {
            reportAttribute(value, name);
          }
          return;
        }

        if (value.type !== 'JSXExpressionContainer') return;

        const inner = value.expression;

        if (inner.type === 'Literal') {
          if (typeof inner.value === 'string' && HAS_LETTER.test(inner.value)) {
            reportAttribute(inner, name);
          }
          return;
        }

        if (inner.type === 'TemplateLiteral') {
          for (const quasi of inner.quasis) {
            if (HAS_LETTER.test(quasi.value.cooked ?? '')) {
              reportAttribute(inner, name);
              return;
            }
          }
        }
      },

      JSXExpressionContainer(node) {
        // Attribute containers are handled above; this visitor owns the ones printed as children.
        if (node.parent.type === 'JSXAttribute') return;

        walkPrinted(node.expression);
      },
    };
  },
};

export const uiStringsPlugin = {
  rules: { 'no-literal-copy': noLiteralCopy },
};

/** The rule entry, so a fixtures configuration would enable exactly what production enables. */
export const uiStringsRule = { 'ui-strings/no-literal-copy': 'error' };

export const uiStringsConfigs = [
  {
    files: LINTED,
    ignores: EXEMPT,
    plugins: { 'ui-strings': uiStringsPlugin },
    rules: uiStringsRule,
  },
];
