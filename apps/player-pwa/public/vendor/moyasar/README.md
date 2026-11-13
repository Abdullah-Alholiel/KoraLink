Vendor: moyasar-payment-form@2.3.0 (npm), MIT — https://docs.moyasar.com

Files (copied from the npm tarball dist/, unmodified except where noted):
- moyasar.umd.js   — UMD bundle (jsDelivr's moyasar.umd.min.js is this same file
                     minified on the fly; npm ships it unminified).
- moyasar.css      — PATCHED: scoped for KoraLink.
    * `html,div#mysr :host{...}` -> `div#mysr,div#mysr :host{...}` (drops the
      app-global html rule whose ui-sans-serif font-family would fight Tajawal).
    * bare `body{margin:0;line-height:inherit}` removed (app-global).
    * generically-named @keyframes prefixed (dialog-in/-out/-in-mobile/-out-mobile,
      fade-in/-out, spin -> mysr-*) so they cannot collide with the app's own
      keyframes; .animate-* selector class names keep the vendor spelling.
  Regenerate with the patch recipe in this README (three deterministic string
  edits) after any version bump; integrity attributes in TopupSheet.tsx must be
  updated to match.

Load order: the stylesheet link is injected by TopupSheet BEFORE Moyasar.init,
AFTER the app's global.css, so the scoped rules cannot win a tie against the
app's own styles and the form inherits the app font (the dropped html/body
rules let Tajawal cascade in).

Integrity (sha256, for the subresource-integrity attributes in TopupSheet.tsx):
- moyasar.umd.js: see topup.ts MOYASAR_SCRIPT_INTEGRITY (keep in sync)
- moyasar.css:    sha256-20e6688f18fd506ae5cf3fffeeaa67f2cc6d96a42b51dff4e699723c01b433a4
