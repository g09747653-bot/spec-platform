/**
 * The handful of icons the surface needs, drawn inline (task 134).
 *
 * No icon package: three paths do not justify a runtime dependency, and a vendored SVG follows the
 * theme by construction — `currentColor` means the icon is whatever colour its text is, so it
 * cannot be the one element that ignores a theme switch.
 *
 * `aria-hidden` on every one of them, always. Each is drawn beside a word that already says what
 * the control does; an icon that announced itself as well would make a screen reader say it twice.
 */
export function EyeIcon({ open = false, className }: { open?: boolean; className?: string }) {
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
      <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z" />
      <circle cx="8" cy="8" r="1.9" />
      {/* The struck-through eye is «hide», so the control's two states differ at a glance. */}
      {open && <path d="M2.5 13.5 13.5 2.5" />}
    </svg>
  );
}

/** The side-panel glyph on the sidebar's collapse control (task 136). */
export function PanelIcon({ open = true, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.8" />
      <path d="M10 2.5v11" />
      {/* Filled when the pane is showing, hollow when it is hidden — two states, one glyph. */}
      {open && <path d="M10 2.5h4.5v11H10z" fill="currentColor" opacity="0.35" stroke="none" />}
    </svg>
  );
}

/** A downward chevron — «you are not at the end of this conversation» (task 137). */
export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6.5 8 10.5l4-4" />
    </svg>
  );
}

/** The close glyph on a pane header (task 138). */
export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * The ⓘ on an option that carries a справка (task 144; видео §5).
 *
 * Drawn rather than typed: `ⓘ` is one code point that a fallback font renders as a bare `i` in a
 * box, and the reference's mark is a filled disc. A glyph the theme cannot colour and the font may
 * not have is not an icon, it is a hope.
 */
export function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-3.5 w-3.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.2v4" />
      <circle cx="8" cy="4.8" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The ↗ on a link that leaves for the technology's own site (task 144; видео §5). */
export function ExternalLinkIcon({ className }: { className?: string }) {
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
      <path d="M6.5 3.2H3.4v9.4h9.4V9.5" />
      <path d="M9.6 3.2h3.2v3.2M12.8 3.2 7.6 8.4" />
    </svg>
  );
}

/** The paperclip on the composer's attach control (row `1.5-2`). */
export function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11.5 6.5 6.9 11.1a2.1 2.1 0 0 1-3-3l5-5a3.3 3.3 0 0 1 4.7 4.7l-5 5a4.5 4.5 0 0 1-6.4-6.4l4.6-4.6" />
    </svg>
  );
}
