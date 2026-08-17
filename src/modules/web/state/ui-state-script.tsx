'use client';

import { uiStateScriptSource } from './ui-state';

/**
 * The pre-paint device-state script, rendered into `<head>` beside {@link ThemeScript} (task 141).
 *
 * Same contract as the theme's, for the same reason and with the same two subtleties: it must be
 * inline and synchronous (a deferred script runs after the first paint, which is the flash), and it
 * is `text/javascript` on the server and inert `text/plain` on the client so React does not warn
 * about a `<script>` in a component — a script inserted by a DOM update never executes anyway.
 *
 * Two scripts rather than one because they say different things: the theme sets an attribute the
 * stylesheet keys off, and this sets a length the layout is painted from. Both read their keys from
 * `UI_STATE_KEYS`, so there is still one inventory of what this device remembers.
 */
export function UiStateScript() {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: uiStateScriptSource() }}
    />
  );
}
