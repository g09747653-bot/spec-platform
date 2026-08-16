import { cn } from '../lib/cn';

/**
 * The product mark (task 124).
 *
 * Ours, not theirs: a bracketed sheet in azure and gold rather than the reference product's
 * violet/cyan wordmark. Both colours come from tokens, so the mark follows the theme like every
 * other surface — the reason the gradient stops name `var(--color-brand…)` instead of a literal.
 *
 * The animated loader of task 125 draws the same geometry, so the thing that spins during a load
 * and the thing in the header are recognisably one mark.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-5 w-5', className)}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
    >
      <defs>
        <linearGradient id="brand-mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" />
          <stop offset="100%" stopColor="var(--color-brand-accent)" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#brand-mark-gradient)" />
      <path
        d="M8.4 7.2 6 12l2.4 4.8M15.6 7.2 18 12l-2.4 4.8"
        fill="none"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 6.6 10.8 17.4"
        fill="none"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
