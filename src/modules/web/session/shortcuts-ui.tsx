'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';

import {
  SHORTCUTS,
  setShortcutsOpen,
  shortcutsOpen,
  shortcutsServerSnapshot,
  subscribeShortcuts,
  type Shortcut,
} from './shortcuts';

/**
 * The discoverable half of the keyboard story (task 141 AC — «every shortcut works and is listed
 * in-app»).
 *
 * A shortcut nobody can find is a shortcut nobody has. The `?` in the application header is the
 * affordance for people who do not know there are any, and `?` on the keyboard is the affordance for
 * people who do. Both open this, and this is generated from `SHORTCUTS`, so the list cannot fall
 * behind what the handler binds.
 */
export function ShortcutsButton() {
  const t = useT();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('session.shortcuts.title')}
        title={t('session.shortcuts.title')}
        data-testid="shortcuts-open"
        onClick={() => {
          setShortcutsOpen(true);
        }}
        className="text-foreground-muted h-8 w-8 px-0"
      >
        ?
      </Button>
      <ShortcutsDialog />
    </>
  );
}

/**
 * The words for the three grouping tokens `shortcuts.ts` sorts by (task 143).
 *
 * The headings used to be the token itself — `Document viewer` printed as a heading because it
 * happened to read as English. A record rather than a rename keeps the token stable for anything
 * grouping by it, and keeps the type exhaustive: a fourth scope without a heading does not compile.
 */
const SCOPE_PHRASE: Readonly<Record<Shortcut['scope'], PhraseKey>> = {
  Anywhere: 'session.shortcuts.scope-anywhere',
  Session: 'session.shortcuts.scope-session',
  'Document viewer': 'session.shortcuts.scope-viewer',
};

function groupsOf(shortcuts: readonly Shortcut[]): [Shortcut['scope'], Shortcut[]][] {
  const groups = new Map<Shortcut['scope'], Shortcut[]>();

  for (const shortcut of shortcuts) {
    const bucket = groups.get(shortcut.scope) ?? [];
    bucket.push(shortcut);
    groups.set(shortcut.scope, bucket);
  }

  return [...groups.entries()];
}

function ShortcutsDialog() {
  const t = useT();
  const open = useSyncExternalStore(subscribeShortcuts, shortcutsOpen, shortcutsServerSnapshot);
  const closeRef = useRef<HTMLButtonElement>(null);

  /*
   * Focus moves into the dialog when it opens, because a dialog nobody's keyboard is inside is a
   * dialog `Escape` cannot close and `Tab` walks straight past. The `?` key that opened it is
   * handled by the shell, which is also what closes it — this only has to put the caret somewhere.
   */
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="bg-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="shortcuts-overlay"
      onClick={() => {
        setShortcutsOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('session.shortcuts.title')}
        data-testid="shortcuts-dialog"
        className="border-border-subtle bg-surface flex w-full max-w-md flex-col gap-4 rounded-xl border p-5 shadow-xl"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-h3">{t('session.shortcuts.title')}</h2>
          <Button
            ref={closeRef}
            variant="ghost"
            size="sm"
            data-testid="shortcuts-close"
            onClick={() => {
              setShortcutsOpen(false);
            }}
          >
            {t('common.close')}
          </Button>
        </div>

        {groupsOf(SHORTCUTS).map(([scope, shortcuts]) => (
          <section key={scope} className="flex flex-col gap-1.5">
            <h3 className="text-label text-foreground-muted tracking-widest uppercase">
              {t(SCOPE_PHRASE[scope])}
            </h3>
            <ul className="flex flex-col gap-1">
              {shortcuts.map((shortcut) => (
                <li
                  key={shortcut.id}
                  className="flex items-baseline justify-between gap-4 text-sm"
                  data-testid="shortcut-row"
                  data-shortcut={shortcut.id}
                >
                  <span>{t(shortcut.phrase)}</span>
                  <kbd className="border-border-subtle bg-background text-foreground-muted shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs">
                    {shortcut.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="text-foreground-muted text-xs">{t('session.shortcuts.note')}</p>
      </div>
    </div>
  );
}
