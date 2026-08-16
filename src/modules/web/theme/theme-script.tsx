import { themeScriptSource } from './theme';

/**
 * The pre-hydration theme script, rendered into `<head>` by the root layout (task 124).
 *
 * `dangerouslySetInnerHTML` is the documented way to emit a synchronous inline script from the App
 * Router; the content is a constant this module builds, never anything user-supplied, so there is
 * no injection surface. It has to be inline and synchronous — a deferred or imported script runs
 * after the first paint, which is the flash the AC forbids.
 *
 * The `type` switch is the documented companion to that (Next.js — "Preventing flash before
 * hydration"): React warns when a component renders a `<script>`, because a script inserted by a
 * DOM update never executes. Ours only ever needs to run during the server-rendered parse, so it is
 * `text/javascript` there and inert `text/plain` on the client. `suppressHydrationWarning` covers
 * the resulting attribute difference.
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeScriptSource() }}
    />
  );
}
