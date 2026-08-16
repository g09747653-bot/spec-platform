import {
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from 'react';

import { cn } from '../lib/cn';

/**
 * shadcn/ui form primitives, vendored: Label, Input and Textarea.
 *
 * The prompt box that starts a session (task 15) and the interview's free-text escape hatch
 * (FR-005 AC-3) are both built from these.
 */
const controlClasses =
  'bg-surface border-border-subtle placeholder:text-foreground-muted flex w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return <label ref={ref} className={cn('text-sm font-medium', className)} {...props} />;
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...props }, ref) {
    return (
      <input ref={ref} type={type} className={cn(controlClasses, 'h-9', className)} {...props} />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClasses, 'min-h-24', className)} {...props} />;
});
