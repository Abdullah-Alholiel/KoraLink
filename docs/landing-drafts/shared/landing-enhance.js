/* ============================================================
   KoraLink landing — shared behavior: theme toggle, language
   toggle, install-band platform logic + dismissal persistence.
   Zero dependencies. Loaded by both drafts (EN + AR).
   ============================================================ */
(function () {
  'use strict';

  var THEME_KEY = 'koralink.landing-theme';
  // Band-specific dismissal (2026-09-02): this key is NOT shared with the
  // in-app install intercept anymore — the old shared key made "Continue to
  // the web app" silently suppress the in-app install page for 30 days.
  var DISMISS_KEY = 'koralink.landing-band-dismissed-at';
  var DISMISS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function store(k, v) {
    try {
      if (arguments.length === 1) return window.localStorage.getItem(k);
      window.localStorage.setItem(k, v);
    } catch (e) { /* private mode */ }
    return null;
  }

  /* ---------- theme engine ----------
   * data-theme on <html>; default = each draft's authored mode
   * (A: light, B: dark). Persisted choice wins over OS; absence
   * defers to prefers-color-scheme; cycle toggles the OTHER mode.
   */
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var THEME_COLOR = { light: '#f7f8f7', dark: '#0d1a14' };

  function osDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme(mode, animate) {
    if (animate) {
      document.documentElement.classList.add('theme-anim');
      setTimeout(function () {
        document.documentElement.classList.remove('theme-anim');
      }, 300);
    }
    document.documentElement.setAttribute('data-theme', mode);
    if (themeMeta) themeMeta.setAttribute('content', THEME_COLOR[mode] || THEME_COLOR.light);
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var isDark = mode === 'dark';
      var lbl = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      btns[i].setAttribute('aria-label', lbl);
      btns[i].setAttribute('title', lbl);
      var sun = btns[i].querySelector('[data-icon-sun]');
      var moon = btns[i].querySelector('[data-icon-moon]');
      if (sun) sun.style.display = isDark ? '' : 'none';
      if (moon) moon.style.display = isDark ? 'none' : '';
    }
  }

  function initTheme(defaultMode) {
    // Priority: saved choice > pre-paint seed attribute > OS preference > draft default
    var seeded = document.documentElement.getAttribute('data-theme');
    var saved = store(THEME_KEY);
    var mode = (saved === 'light' || saved === 'dark')
      ? saved
      : (seeded === 'light' || seeded === 'dark')
        ? seeded
        : (function () {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
              return defaultMode === 'light' ? 'dark' : 'light';
            }
            return defaultMode;
          })();
    applyTheme(mode, false);

    // Sync the segmented theme toggle (light | dark): the active option gets
    // aria-pressed="true" → CSS fills it with the accent. Runs at init AND on
    // every toggle so the fill always tracks the real mode.
    function syncThemeSeg() {
      var cur = document.documentElement.getAttribute('data-theme') || 'light';
      var opts = document.querySelectorAll('[data-theme-opt]');
      for (var i = 0; i < opts.length; i++) {
        var isCur = opts[i].getAttribute('data-theme-opt') === cur;
        opts[i].setAttribute('aria-pressed', isCur ? 'true' : 'false');
      }
    }
    syncThemeSeg();
    // expose so the click handler below can re-sync after flipping
    window.__kxSyncThemeSeg = syncThemeSeg;

    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-theme-toggle]') : null;
      if (!btn) return;
      var cur = document.documentElement.getAttribute('data-theme') || defaultMode;
      var next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
      store(THEME_KEY, next);
      if (window.__kxSyncThemeSeg) window.__kxSyncThemeSeg();
    });

    // Segmented options: clicking a mode selects it directly (no cycling).
    document.addEventListener('click', function (ev) {
      var opt = ev.target.closest ? ev.target.closest('[data-theme-opt]') : null;
      if (!opt) return;
      var want = opt.getAttribute('data-theme-opt');
      var cur = document.documentElement.getAttribute('data-theme') || defaultMode;
      if (want === cur) return; // already active — nothing to do
      applyTheme(want, true);
      store(THEME_KEY, want);
      if (window.__kxSyncThemeSeg) window.__kxSyncThemeSeg();
    });
  }

  /* ---------- language toggle ---------- */
  function initLang() {
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-lang-toggle]') : null;
      if (!btn) return;
      var target = btn.getAttribute('data-lang-toggle'); // relative URL, e.g. ../draft-b-partner/index.ar.html
      var here = location.pathname.replace(/\/[^/]*$/, '/');
      // Cross-draft + cross-lang: resolve the target file under the drafts root
      var dest = new URL(target, location.href).pathname;
      location.href = location.origin + dest + location.search;
    });
  }

  /* ---------- install band ---------- */
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
  }
  function recentlyDismissed() {
    var t = Number(store(DISMISS_KEY) || 0);
    return t > 0 && Date.now() - t < DISMISS_MS;
  }

  function initInstallBand() {
    var band = document.querySelector('.install-band');
    if (!band) return;

    var installBtn = band.querySelector('[data-install]');
    var skipBtn = band.querySelector('[data-skip-install]');
    var standaloneNote = band.querySelector('[data-standalone-note]');
    var actions = band.querySelector('.install-band__actions');

    // Platform class → CSS shows the right step rows / hint
    if (isIOS()) document.body.classList.add('platform-ios');

    // Standalone users don't need the band at all
    if (isStandalone()) {
      band.setAttribute('data-dismissed', '1');
      return;
    }
    // Recently dismissed → hide
    if (recentlyDismissed()) {
      band.setAttribute('data-dismissed', '1');
      return;
    }

    // Chromium install path: capture beforeinstallprompt early (band may be
    // below the fold — listen now, not on first scroll)
    var deferred = null;
    function onBIP(e) {
      e.preventDefault();
      deferred = e;
      if (installBtn) installBtn.hidden = false;
    }
    window.addEventListener('beforeinstallprompt', onBIP);

    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (deferred) {
          deferred.prompt();
          deferred.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') {
              band.setAttribute('data-dismissed', '1');
            } else if (choice && choice.outcome === 'dismissed') {
              if (actions) actions.hidden = false;
            }
            deferred = null;
          });
        } else if (isIOS()) {
          showIOSHint(band);
        } else {
          // Non-Chromium desktop / in-app browsers: reveal how-to steps
          var how = band.querySelector('.install-band__how');
          if (how) how.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    function dismiss() {
      store(DISMISS_KEY, String(Date.now()));
      band.setAttribute('data-dismissed', '1');
    }
    if (skipBtn) skipBtn.addEventListener('click', dismiss);
    // "Continue to the app" links are a pure hand-off to the web app — they
    // must NOT dismiss the band (and never touched the in-app intercept's
    // flag, which now owns a separate key anyway).

    // iOS: no beforeinstallprompt — show Share-steps emphasis
    if (isIOS()) showIOSHint(band);
  }

  function showIOSHint(band) {
    var hint = band.querySelector('.install-band__ioshint');
    if (hint) hint.style.display = 'block';
    var how = band.querySelector('.install-band__how');
    if (how) {
      var steps = how.querySelectorAll('.install-band__step');
      for (var i = 0; i < steps.length; i++) steps[i].style.fontWeight = '600';
    }
  }

  /* ---------- boot (called with the draft's default theme) ---------- */
  window.KoraLanding = {
    init: function (defaultMode) {
      initTheme(defaultMode === 'dark' ? 'dark' : 'light');
      initLang();
      initInstallBand();
    },
  };
})();
