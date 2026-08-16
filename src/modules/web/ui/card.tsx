import { type HTMLAttributes, forwardRef } from 'react';

import { cn } from '../lib/cn';

/**
 * shadcn/ui Card, vendored. The workhorse container of this product: interview choice cards,
 * spec cards and review boards are all built from it.
 */
type DivProps = HTMLAttributes<HTMLDivElement>;

export const Card = forwardRef<HTMLDivElement, DivProps>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('bg-surface border-border-subtle rounded-card border', className)}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, DivProps>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />;
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return <h2 ref={ref} className={cn('text-h3', className)} {...props} />;
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-foreground-muted text-sm', className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, DivProps>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, DivProps>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('flex items-center gap-2 p-5 pt-0', className)} {...props} />;
});
