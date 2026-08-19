import type { ComponentType } from 'react';

/**
 * The vendor marks an option may wear beside its label (task 144; видео §5).
 *
 * Drawn here, in this repository, for the reason `icons.tsx` gives and one more (D-187). The reason
 * it gives: a vendored SVG on `currentColor` follows the theme by construction, so a mark cannot be
 * the one element that ignores a theme switch. The one more: these stand beside model-authored text,
 * and a remote `<img>` would turn a drafted round into a request to eight third parties — this
 * project has no image host, no image configuration and no intention of acquiring either.
 *
 * They are approximations, and deliberately so: each is the vendor's silhouette at 16 px, drawn from
 * its published shape in as few strokes as still read as that vendor — an A, a hexagonal blossom, a
 * fan of routes, the Next.js disc, the React atom, Neon's rounded square, MongoDB's leaf, a database
 * cylinder. They are not the vendors' artwork and are not offered as it. What names the technology on
 * screen is the option's own label; the mark is what makes the row scannable.
 *
 * Kept apart from `icons.tsx` because the two answer to different rules. An icon there is chrome we
 * design; a mark here belongs to somebody else and is redrawn to a **closed set** — the eight slugs
 * the round schema will accept (`OPTION_LOGO_SLUGS`). The set is closed on both sides and neither
 * side can widen it alone: a slug this file cannot draw renders nothing, which is what an option
 * without a logo renders anyway.
 *
 * `aria-hidden` on every one, exactly as in `icons.tsx`: the mark sits immediately before the
 * technology's own name, and a mark that announced itself would make a screen reader say it twice.
 */

/** Anthropic — the wordmark's «A», its apex and its bar. */
function AnthropicMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.6 13.4 8 2.6l5.4 10.8" />
      <path d="M5.1 9.6h5.8" />
    </svg>
  );
}

/** OpenAI — the six-fold blossom, reduced to its hexagon and the knot inside it. */
function OpenAiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13.8 8 10.9 13 5.1 13 2.2 8 5.1 3 10.9 3Z" />
      <path d="M8 8h5.8M8 8 5.1 13M8 8 5.1 3" />
    </svg>
  );
}

/** OpenRouter — one key in, several vendors out: a trunk and the routes leaving it. */
function OpenRouterMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.8 3.4v9.2" />
      <path d="M2.8 5.4h8.2M2.8 10.6h8.2" />
      <path d="M9.3 3.8 10.9 5.4 9.3 7M9.3 9 10.9 10.6 9.3 12.2" />
    </svg>
  );
}

/** Next.js — the disc with the long diagonal of its «N». */
function NextMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.4" />
      <path d="M5.6 11V5l5.2 6.4" />
      <path d="M10.4 5v3.1" />
    </svg>
  );
}

/** React — the nucleus and its three orbits. */
function ReactMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      aria-hidden
    >
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <ellipse cx="8" cy="8" rx="6.6" ry="2.5" />
      <ellipse cx="8" cy="8" rx="6.6" ry="2.5" transform="rotate(60 8 8)" />
      <ellipse cx="8" cy="8" rx="6.6" ry="2.5" transform="rotate(120 8 8)" />
    </svg>
  );
}

/** Neon — the rounded square, and the «N» held inside it. */
function NeonMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="1.7" y="1.7" width="12.6" height="12.6" rx="3.4" />
      <path d="M5.3 11.2V4.8l5.4 6.4V4.8" />
    </svg>
  );
}

/** MongoDB — the leaf and its midrib. */
function MongoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 1.6c2.7 2.7 4.1 5 4.1 7.2 0 2.6-1.9 4.4-4.1 5.4-2.2-1-4.1-2.8-4.1-5.4 0-2.2 1.4-4.5 4.1-7.2Z" />
      <path d="M8 5.4v8.8" />
    </svg>
  );
}

/** SQLite — a database, and the file it all lives in has no other silhouette. */
function SqliteMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <ellipse cx="8" cy="4.3" rx="5.3" ry="2.2" />
      <path d="M2.7 4.3v7.4c0 1.2 2.4 2.2 5.3 2.2s5.3-1 5.3-2.2V4.3" />
      <path d="M2.7 8c0 1.2 2.4 2.2 5.3 2.2s5.3-1 5.3-2.2" />
    </svg>
  );
}

/**
 * Slug → mark, keyed by **string** on purpose.
 *
 * The slugs are the schema's closed set, and `web` may not import `agents` (constitution A1), so
 * they cross the boundary the way `questionsPerRound` and the audience profile already do: as plain
 * values a renderer looks up. Typing this `Record<OptionLogoSlug, …>` would buy exhaustiveness at
 * the price of the boundary, and the fallback below is the honest version of that safety anyway —
 * a mark this build does not have is not an error, it is one fewer mark.
 */
const MARKS: Readonly<Record<string, ComponentType<{ className?: string }>>> = Object.freeze({
  anthropic: AnthropicMark,
  openai: OpenAiMark,
  openrouter: OpenRouterMark,
  nextjs: NextMark,
  react: ReactMark,
  neon: NeonMark,
  mongodb: MongoMark,
  sqlite: SqliteMark,
});

/**
 * The mark for a slug, or nothing at all — which is exactly what a slugless option draws.
 *
 * `testId` rides on the wrapper rather than on the caller's own element on purpose: it then exists
 * if and only if a mark was actually drawn, so «this option shows its logo» is a claim about the
 * drawing and not about the intention. A caller that wrapped an unknown slug in its own tagged span
 * would report a mark that is not on screen.
 */
export function TechnologyLogo({
  slug,
  testId,
  className,
}: {
  slug: string;
  testId?: string;
  className?: string;
}) {
  const Mark = MARKS[slug];

  if (Mark === undefined) return null;

  return (
    <span className={className} data-testid={testId}>
      <Mark />
    </span>
  );
}
