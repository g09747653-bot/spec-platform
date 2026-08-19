/**
 * The allowed spelling of the fixture next door (task 143).
 *
 * A gate that only proves it rejects is half a gate, and this half is the one that decides whether
 * people can live with the rule. Four things below are not copy and must never be reported: a phrase
 * taken from the dictionary, the machine-facing attributes around it, the class names `cn` composes,
 * and — the reason this file is worth its weight — the union members a guard compares against.
 *
 * `view === 'raw'` and `state !== 'idle'` read a token to decide what to render; the literal is an
 * operand of a question, and what a reader sees is the other half of the `&&` or nothing at all. The
 * rule reported them once, which asked eight surfaces to translate the identifiers they switch on —
 * the exact opposite of §3 of the voice standard, which sends machine tokens to `data-` attributes
 * and keeps them out of the dictionary. Both spellings are pinned here so that fix cannot be undone
 * by accident.
 *
 * Linted only by `pnpm test:boundaries`.
 */
type PhraseKey = string;

declare function t(key: PhraseKey): string;
declare function cn(...parts: (string | false)[]): string;

export function RawTab({
  view,
  state,
  busy,
}: {
  view: 'raw' | 'preview';
  state: 'idle' | 'copied';
  busy: boolean;
}) {
  return (
    <div
      data-testid="viewer-tab-raw"
      data-view="raw"
      data-state={state}
      className={cn('rounded-md px-2 py-1', busy && 'opacity-50')}
    >
      <button type="button" aria-label={t('viewer.tabs.raw')} title={t('viewer.raw.copy')}>
        {busy ? t('common.loading') : t('common.copy')}
      </button>

      {view === 'raw' && <span>{t('viewer.tabs.raw')}</span>}
      {state !== 'idle' && <span>{t('viewer.raw.copied')}</span>}
    </div>
  );
}
