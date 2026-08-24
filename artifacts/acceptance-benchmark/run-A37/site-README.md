# Story — local static site

A hand-rebuilt, static single-page site (`index.html` + CSS + vanilla JS)
reconstructed from a set of reference screenshots and captured assets — not
a copy of any original template source files.

## Attribution

Original: **"Story" by HTML5 UP** ([html5up.net/story](https://html5up.net/story)),
licensed under **Creative Commons Attribution 3.0 Unported (CC BY 3.0)**
([creativecommons.org/licenses/by/3.0](https://creativecommons.org/licenses/by/3.0/)).

This repository is a **derivative and modified work**: the markup, CSS and
JavaScript in `assets/` were written from scratch against reference
screenshots (`reference/`) of the original design, at breakpoints
375 / 768 / 1440 px, reusing the original's imagery/iconography/license
terms rather than its original source files. Demo photography is
CC0 (Unsplash); icons are from Font Awesome (see
`assets/media/webfonts/` and `assets/css/vendor/font-awesome.css`).
Font Awesome is provided under its own license — the icon font files
here are used as attribution-free glyphs per Font Awesome's terms.

See `assets/media/LICENSE-html5up-story.txt` for the full CC BY 3.0 license
text that applies to the original "Story" design this site derives from.

## Running it

No build step, no package manager, no internet connection required.

1. Double-click **`start.cmd`** (Windows).
2. It launches a local static file server (`server.ps1`, plain
   `System.Net.HttpListener`, no external dependencies) on
   `http://localhost:8080/` and opens that URL in your default browser.
3. Close the server console window (or press `Ctrl+C` in it) to stop.

The server always binds to port **8080**. If that port is already in use,
it prints an error explaining the port conflict and exits with a non-zero
status instead of silently choosing a different port — free the port and
run `start.cmd` again.

## Structure

```
index.html
assets/css/            main.css, banner.css, spotlights.css, gallery.css,
                        elements.css, footer.css, vendor/font-awesome.css
assets/js/              main.js, banner.js, spotlight.js,
                        gallery-lightbox.js, contact-form.js, nav.js
assets/media/           images/, webfonts/, LICENSE-html5up-story.txt
gallery-pairs.json      thumbnail -> full-size image pairing for the gallery
server.ps1 / start.cmd  local single-command launcher
```
