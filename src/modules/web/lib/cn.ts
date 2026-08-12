import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names, letting a later Tailwind utility win over an earlier one of
 * the same kind. The standard shadcn/ui helper, vendored here with the primitives.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
