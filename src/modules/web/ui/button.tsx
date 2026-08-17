import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { cn } from '../lib/cn';

/**
 * shadcn/ui Button, vendored (solution.md — Technology Stack: components live in the repo, so
 * there is no third-party component runtime to track).
 *
 * Deliberately built on the native `<button>` rather than a headless component library: nothing
 * here needs a portal, focus trap or composed slot, and every added runtime is one more thing
 * between us and the browser.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        /*
         * The brand gradient, for the one control the reference paints with it — Send (task 133;
         * row `1.5-2`; Эталон §1.5). Both stops are contrast-checked against the label in
         * `brand.test.ts`, which is why the far stop is `brand-strong` rather than the mark's
         * brighter `brand-accent`.
         */
        brand:
          'bg-gradient-to-r from-brand to-brand-strong text-primary-foreground hover:opacity-90',
        secondary: 'bg-surface text-foreground border border-border-subtle hover:bg-background',
        ghost: 'text-foreground hover:bg-background',
        danger: 'bg-danger text-primary-foreground hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
