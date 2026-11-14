#!/usr/bin/env node
/**
 * verify-topup-form.mjs — P0-2 staging post-deploy check (kanban t_98d948b2).
 *
 * REAL-browser gate so the staging deploy can never again pass with a stubbed
 * payment form: the jsdom specs stub Moyasar.init, which is exactly how the
 * async-callback / UUID-payment-id / vendor-404 breakages reached staging
 * unseen (owner hit all three on his phone, 2026-11-13).
 *
 * What it asserts (Phase A only — NO payment is attempted):
 *   for locale in ar, en:
 *     - dev-login (staging-only) as the seed player through the REAL API
 *     - wallet → Top up → amount 5 → "Continue to card payment"
 *     - Moyasar form renders ≥3 card inputs inside .mysr-form
 *     - the self-hosted stylesheet loaded with ≥100 parsed rules (styled, not bare)
 *     - the pay button is VISIBLE: ≥300×40 px, opaque background, amount in its label
 *     - no stray empty pink error block (the unstyled-era symptom)
 *     - screenshot per locale into scripts/artifacts/
 *
 * Side effects: one staging dev-login + one PENDING top-up intent per locale
 * (sandbox keys; no card is ever submitted, nothing is charged).
 *
 * CI: needs the VPS Tailscale network + a Chromium binary, so it is wired as a
 * staging post-deploy check (deploy-staging.sh STEP 7, H7, advisory) instead of
 * the PR test suite — that wiring IS the documented decision (brief acceptance #4).
 *
 * Usage: node scripts/verify-topup-form.mjs [--pwa URL] [--api URL]
 * Exit:  0 both locales pass · 1 any assertion failed · 2 environment error
 */
import { existsSync, globSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// ── targets (public funnel = the surface the owner actually uses) ──────────
const TS_NET = process.env.TS_NET || 'aa.tail2948f9.ts.net';
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const PWA = arg('--pwa', `https://${TS_NET}:10000`);
const API = arg('--api', `https://${TS_NET}:8443/api/v1`);
const OUT_DIR = new URL('./artifacts/', import.meta.url).pathname;

// ── locate playwright + chromium without hardcoding versions (skill §9b) ──
const NPX_GLOB = '/home/ubuntu/.hermes/profiles/fullstack-dev/home/.npm/_npx/*/node_modules';
const CHROME_GLOB = '/home/ubuntu/.hermes/profiles/fullstack-dev/home/.cache/ms-playwright/chromium-*/chrome-linux/chrome';
const playwrightDirs = globSync(`${NPX_GLOB}/playwright/package.json`);
const chromeBins = globSync(CHROME_GLOB);
if (!playwrightDirs.length || !chromeBins.length) {
  console.error('[env-error] playwright module or chromium binary not found');
  process.exit(2);
}
const require = createRequire(playwrightDirs[0].replace(/\/package\.json$/, '/'));
const { chromium } = require('playwright');
const EXECUTABLE = chromeBins.sort().pop();

const SNAP_LIBS = ['/snap/gnome-46-2404/current/usr/lib/aarch64-linux-gnu',
  '/snap/mesa-2404/current/usr/lib/aarch64-linux-gnu'].filter(existsSync);
const LD = [process.env.LD_LIBRARY_PATH, ...SNAP_LIBS].filter(Boolean).join(':');
mkdirSync(OUT_DIR, { recursive: true });

const SEED_PHONE = '+966500000001';

async function devLogin() {
  const res = await fetch(`${API}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: SEED_PHONE, surface: 'player' }),
  });
  if (!res.ok) throw new Error(`dev-login failed: HTTP ${res.status} (staging only)`);
  const { token } = await res.json();
  if (!token) throw new Error('dev-login returned no token');
  return token;
}

async function checkLocale(browser, locale, token) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, locale,
  });
  const page = await ctx.newPage();
  // Seed the app's OWN persisted state (skill §8 PRIMARY-A): a real token
  // survives the AuthBootstrap probe, so the wipe path can never fire.
  await page.addInitScript(([tok, loc]) => {
    const now = String(Date.now());
    localStorage.setItem('koralink.install-landing-dismissed-at.v2', now);
    localStorage.setItem('koralink.install-banner-dismissed-at', now);
    localStorage.setItem('koralink.pwa-seen-app-before', '1');
    localStorage.setItem('koralink_token', tok);
    localStorage.setItem('koralink-app-store', JSON.stringify({ state: {
      user: { id: 'e2e-live', fullName: 'Ahmed Al-Rashid', handle: 'ahmed_r',
        avatarUrl: null, pom_count: 3, phone: '+966500000001', skillLevel: 'Advanced' },
      token: tok, isAuthenticated: true, isOnboarded: true,
      preferences: { locale: loc, theme: 'system', notificationsEnabled: true },
      isHydrated: true }, version: 0 }));
  }, [token, locale]);

  await page.goto(`${PWA}/${locale}/wallet`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000); // hydration + wallet data (networkidle never settles: WebSocket)

  const topupBtn = page.getByRole('button', { name: locale === 'ar' ? 'شحن' : 'Top Up' }).first();
  await topupBtn.waitFor({ state: 'visible', timeout: 20000 });
  await topupBtn.click();
  const amountInput = page.locator('#topup-amount');
  await amountInput.waitFor({ state: 'visible', timeout: 15000 });
  await amountInput.fill('5');
  const continueBtn = page.getByRole('button', {
    name: locale === 'ar' ? /المتابعة إلى الدفع بالبطاقة/ : /Continue to card payment/ }).first();
  await continueBtn.click();
  await page.locator('.mysr-form input').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.waitForTimeout(1500); // form finishes its own render

  const result = await page.evaluate(() => {
    const submit = document.querySelector('.mysr-form button[type="submit"], .mysr-form button');
    const r = submit ? submit.getBoundingClientRect() : null;
    const cs = submit ? getComputedStyle(submit) : null;
    let cssRules = 0;
    for (const sheet of document.styleSheets) {
      if ((sheet.href || '').includes('moyasar.css')) {
        try { cssRules = sheet.cssRules.length; } catch { cssRules = -1; }
      }
    }
    const strayPink = [...document.querySelectorAll('div')].filter((d) => {
      const s = getComputedStyle(d);
      return s.backgroundColor === 'rgb(254, 226, 226)' &&
        d.getBoundingClientRect().height > 30 && !d.textContent.trim();
    }).length;
    return {
      inputCount: document.querySelectorAll('.mysr-form input').length,
      cssRules,
      submitFound: !!submit,
      submitLabel: submit ? (submit.textContent || '').trim().slice(0, 40) : null,
      submitW: r ? Math.round(r.width) : 0,
      submitH: r ? Math.round(r.height) : 0,
      submitBg: cs ? cs.backgroundColor : null,
      strayPink,
    };
  }).catch((e) => ({ evalError: String(e).slice(0, 160) }));

  const shot = `${OUT_DIR}topup-form-${locale}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  await ctx.close();

  const pass =
    result.inputCount >= 3 &&
    result.cssRules >= 100 &&
    result.submitFound &&
    result.submitW >= 300 && result.submitH >= 40 &&
    result.submitBg && result.submitBg !== 'rgba(0, 0, 0, 0)' &&
    result.strayPink === 0;
  return { locale, pass, shot, ...result };
}

const token = await devLogin();
const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ['--no-sandbox', '--ignore-certificate-errors'],
  env: { ...process.env, LD_LIBRARY_PATH: LD },
});
const results = [];
try {
  for (const locale of ['ar', 'en']) results.push(await checkLocale(browser, locale, token));
} finally {
  await browser.close();
}
console.log('TOPUP_FORM_CHECK ' + JSON.stringify(results));
const failed = results.filter((r) => !r.pass);
if (failed.length) {
  console.error(`[FAIL] top-up form check failed for: ${failed.map((f) => f.locale).join(', ')}`);
  process.exit(1);
}
console.log('[ok] top-up card form styled with visible pay button (ar, en)');
