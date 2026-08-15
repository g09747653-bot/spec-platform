import { methodologyConfig } from '@/modules/methodologies';

import { cn } from '../lib/cn';

/**
 * «MySpec · Greenfield · V1» — the badge of Эталон §1.5, rendered from configuration (task 117).
 *
 * The three parts are separate fields of the config and are joined here, which is the whole of AC-4:
 * a component holding the string `'MySpec · Greenfield · V1'` would render the same pixels and be
 * wrong the moment a session runs a different workflow. Each part carries its own `data-` attribute
 * so a test can assert the *parts*, not the punctuation between them.
 */
export interface MethodologyBadgeProps {
  methodologyId: string | null | undefined;
  className?: string;
}

export function MethodologyBadge({ methodologyId, className }: MethodologyBadgeProps) {
  const config = methodologyConfig(methodologyId);
  const { vendor, flavour, version } = config.badge;

  return (
    <span
      className={cn(
        'border-border-subtle text-ink-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs',
        className,
      )}
      data-testid="methodology-badge"
      data-methodology={config.id}
      title={config.name}
    >
      <span data-testid="methodology-vendor">{vendor}</span>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span data-testid="methodology-flavour">{flavour}</span>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span data-testid="methodology-version">{version}</span>
    </span>
  );
}
