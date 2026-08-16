import { cn } from '../lib/cn';

/**
 * The loading screen (task 125; Эталон §1.5 — «загрузочный экран с анимированным брендовым SVG»).
 *
 * The same geometry as `BrandMark`, drawn large and animated: the two brackets trace themselves and
 * the slash between them pulses. Ours, in our azure and gold — the animation is the reference
 * product's idea, the mark is not.
 *
 * **It cannot trap the page**, and that is structural rather than careful: this is a route-level
 * Suspense fallback, so React replaces it with the page the moment the server component resolves.
 * It renders no control, disables nothing, and covers nothing — there is no state in which it is
 * both on screen and the thing standing between the user and a session (Д-1).
 *
 * The whole thing is one `role="status"` live region, so the wait is announced rather than merely
 * animated, and every stroke stops under `prefers-reduced-motion` (the keyframes in `globals.css`).
 */
export function BrandLoader({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="brand-loader"
      className={cn('flex flex-col items-center justify-center gap-4 py-20', className)}
    >
      <svg viewBox="0 0 24 24" className="h-14 w-14" aria-hidden="true">
        <defs>
          <linearGradient id="brand-loader-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" />
            <stop offset="100%" stopColor="var(--color-brand-accent)" />
          </linearGradient>
        </defs>
        <rect
          x="1.5"
          y="1.5"
          width="21"
          height="21"
          rx="6"
          fill="none"
          stroke="url(#brand-loader-gradient)"
          strokeWidth="1.5"
          className="brand-loader-frame"
        />
        <path
          d="M8.4 7.2 6 12l2.4 4.8M15.6 7.2 18 12l-2.4 4.8"
          fill="none"
          stroke="url(#brand-loader-gradient)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="brand-loader-brackets"
        />
        <path
          d="M13.2 6.6 10.8 17.4"
          fill="none"
          stroke="var(--color-brand-accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="brand-loader-slash"
        />
      </svg>

      <p className="text-foreground-muted text-caption">{label}</p>
    </div>
  );
}
