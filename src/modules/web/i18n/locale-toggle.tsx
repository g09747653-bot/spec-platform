import { cn } from '../lib/cn';

import { chooseLocale } from './locale-action';
import { LOCALES } from './phrase';
import { currentLocale, serverT } from './server-locale';

/**
 * The language switch in the header (task 143).
 *
 * A server component wrapping a form, not a button with an `onClick`. The theme toggle next to it is
 * a client component because a theme is CSS and the browser can apply it alone; a language is the
 * text itself, and only the server can re-render that. Posting the choice and receiving the page in
 * the new language is therefore one request rather than a write followed by a refresh — see
 * `locale-action.ts`.
 *
 * Two locales, so the control is the other one rather than a menu: the label is the language the
 * press would switch *to*, which is what a two-state switch should say.
 */
export async function LocaleToggle({ className }: { className?: string }) {
  const locale = await currentLocale();
  const t = await serverT();
  const next = LOCALES.find((candidate) => candidate !== locale) ?? locale;
  const label = next === 'ru' ? t('shell.locale.to-russian') : t('shell.locale.to-english');

  return (
    <form action={chooseLocale}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        data-testid="locale-toggle"
        data-locale={locale}
        data-locale-next={next}
        aria-label={label}
        title={label}
        className={cn(
          'border-border-subtle text-foreground-muted hover:bg-surface-muted hover:text-foreground inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-medium uppercase transition-colors',
          className,
        )}
      >
        {next}
      </button>
    </form>
  );
}
