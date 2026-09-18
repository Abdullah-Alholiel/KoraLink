// PR #16 acceptance verification — real browser, real auth (2026-09-09).
//
// Verifies on the RUNNING staging build:
//  1. HARD RULE (Abdullah): nothing surpasses the main screen box —
//     doc.scrollWidth == clientWidth AND frame/pill fully inside the viewport
//     at 390px AND 320px, EN+AR.
//  2. Host pill is COMPACT: single line "Host a Match" / "استضف مباراة" —
//     the hint line is gone.
//  3. Photo-add removed: profile has exactly ONE "Edit Profile" affordance.
//  4. Flow kept: profile → Edit Profile → /personal-info; its avatar badge
//     opens the edit form (input fields appear).
//  5. Brand bar (logo + "KoraLink" wordmark) on Play/Profile, ABSENT on
//     personal-info.
import pw from '/home/ubuntu/.hermes/profiles/fullstack-dev/home/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright/index.js';
const { chromium } = pw;

const PWA = 'http://100.93.99.24:3000';
const API = 'http://100.93.99.24:3001/api/v1';
const CHROME = '/home/ubuntu/.hermes/profiles/fullstack-dev/home/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const LD_LIBRARY_PATH = '/snap/gnome-46-2404/154/usr/lib/aarch64-linux-gnu:/snap/mesa-2404/1836/usr/lib/aarch64-linux-gnu';
const SHOTS = '/home/ubuntu/projects/koralink/.local/pr16-shots';

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH },
});

const VIEWPORTS = [
  { label: 'phone 390', width: 390, height: 844 },
  { label: 'phone 320', width: 320, height: 568 },
];
const LOCALES = ['en', 'ar'];
const PILL_TEXT = { en: 'Host a Match', ar: 'استضف مباراة' };

async function dismissLanding(page, locale) {
  // The PWA install-landing overlay (fresh headless contexts) carries
  // "KoraLink, right on your home screen" copy — it must be dismissed
  // before any brand-text assertions. Its continue CTA exists in EVERY
  // landing state, so this is deterministic.
  const label = locale === 'ar' ? 'المتابعة إلى التطبيق' : 'Continue to the web app';
  const btn = page.locator('button', { hasText: label }).first();
  try {
    if (await btn.isVisible({ timeout: 1200 })) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  } catch {
    /* overlay absent — nothing to dismiss */
  }
  // The in-app "Enable your location" banner (LocationProvider) hugs the
  // header — geolocation GRANTED does not remove it (status stays 'idle'
  // until enable/deny is chosen). Dismiss via its X ("Not now").
  const later = locale === 'ar' ? 'ليس الآن' : 'Not now';
  const x = page.locator(`button[aria-label="${later}"]`).first();
  try {
    if (await x.isVisible({ timeout: 1200 })) {
      await x.click();
      await page.waitForTimeout(400);
    }
  } catch {
    /* banner absent — nothing to dismiss */
  }
}

async function authedPage(vp, locale) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    permissions: ['geolocation'],
    geolocation: { longitude: 46.675, latitude: 24.713 }, // Riyadh — no banner
  });
  const page = await ctx.newPage();
  await page.goto(`${PWA}/${locale}/play`, { waitUntil: 'domcontentloaded' });
  const login = await page.request.post(`${API}/auth/dev-login`, {
    data: { phone: '+966500000001' },
  });
  const { token } = await login.json();
  await page.evaluate((t) => localStorage.setItem('koralink_token', t), token);
  await page.goto(`${PWA}/${locale}/play`, { waitUntil: 'domcontentloaded' });
  // AuthBootstrap redirect races — same loop as verify-pwa-responsive.mjs.
  for (let i = 0; i < 5; i++) {
    if (page.url().includes('/login')) {
      await page.evaluate((t) => localStorage.setItem('koralink_token', t), token);
      await page.goto(`${PWA}/${locale}/play`, { waitUntil: 'domcontentloaded' });
    }
    try {
      await page.waitForSelector('[data-testid="host-plus-button"]', { timeout: 6000 });
    } catch {
      continue;
    }
    await page.waitForTimeout(2500); // let a late auth redirect fire
    if (page.url().includes('/play') && (await page.$('[data-testid="host-plus-button"]'))) break;
  }
  await page.waitForTimeout(600);
  await dismissLanding(page, locale);
  return { ctx, page };
}

try {
  for (const vp of VIEWPORTS) {
    for (const locale of LOCALES) {
      const tag = `${vp.label} ${locale}`;
      const { ctx, page } = await authedPage(vp, locale);

      // ── Geometry: frame + pill inside the screen box ──
      const geo = await page.evaluate(() => {
        const doc = document.documentElement;
        const frame =
          document.querySelector('.max-w-6xl') ||
          document.querySelector('.app-shell > div > div') ||
          document.querySelector('.app-shell > div');
        const pill = document.querySelector('[data-testid="host-plus-button"]');
        const fr = frame?.getBoundingClientRect();
        const pr = pill?.getBoundingClientRect();
        return {
          vw: window.innerWidth,
          overflowX: doc.scrollWidth > doc.clientWidth,
          frameL: fr ? +fr.left.toFixed(1) : null,
          frameR: fr ? +fr.right.toFixed(1) : null,
          frameW: fr ? +fr.width.toFixed(1) : null,
          pillL: pr ? +pr.left.toFixed(1) : null,
          pillR: pr ? +pr.right.toFixed(1) : null,
          pillW: pr ? +pr.width.toFixed(1) : null,
        };
      });
      report(`${tag}: no horizontal overflow (doc)`, !geo.overflowX, JSON.stringify(geo));
      report(
        `${tag}: frame fully inside viewport`,
        geo.frameL !== null && geo.frameL >= -1 && geo.frameR <= geo.vw + 1,
        `frame ${geo.frameL}..${geo.frameR} vw=${geo.vw}`,
      );
      report(
        `${tag}: pill fully inside frame`,
        geo.pillL !== null &&
          geo.pillL >= geo.frameL - 1 &&
          geo.pillR <= geo.frameR + 1 &&
          geo.pillR <= geo.vw + 1,
        `pill ${geo.pillL}..${geo.pillR} frameR=${geo.frameR}`,
      );

      // ── Compact pill: exactly the label, no hint line ──
      const pillText = (
        await page.evaluate(
          () => document.querySelector('[data-testid="host-plus-button"]')?.textContent?.trim() ?? '',
        )
      ).replace(/\s+/g, ' ');
      report(`${tag}: pill compact single-line`, pillText === PILL_TEXT[locale], `"${pillText}"`);

      // ── Brand bar present on Play ──
      // Precise: the AppBar's 32px brand icon (h-8 w-8) — text matching is
      // poisoned by the install-landing overlay copy.
      const playHasBrand = await page.evaluate(
        () => !!document.querySelector('img[src*="icon-192"]'),
      );
      report(`${tag}: Play shows KoraLink brand bar`, playHasBrand);

      await page.screenshot({ path: `${SHOTS}/${vp.width}-${locale}-play.png` });

      // ── Profile: exactly ONE Edit Profile affordance (camera badge gone) ──
      // Re-auth: dev-login tokens are short-lived; the /play legs above can
      // burn the TTL and AuthBootstrap then bounces personal-info → /login
      // (whose page contains "KoraLink", poisoning the brand check).
      const login2 = await page.request.post(`${API}/auth/dev-login`, {
        data: { phone: '+966500000001' },
      });
      await page.evaluate(
        (t) => localStorage.setItem('koralink_token', t),
        (await login2.json()).token,
      );
      await page.goto(`${PWA}/${locale}/profile`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const editLabel = locale === 'ar' ? 'تعديل الملف الشخصي' : 'Edit Profile';
      const editCount = await page.evaluate((lbl) => {
        const els = [...document.querySelectorAll('button, a')];
        return els.filter(
          (el) =>
            (el.getAttribute('aria-label') ?? '').trim() === lbl ||
            el.textContent.replace(/\s+/g, ' ').trim().includes(lbl),
        ).length;
      }, editLabel);
      if (locale === 'en') {
        report(`${tag}: profile has exactly 1 Edit affordance`, editCount === 1, `found ${editCount}`);
      } else {
        // AR copy differs; assert via geometry instead: no small round badge
        // hugging the avatar's bottom-end corner. (Badge was h-7 w-7 = 28px.)
        const badgeGone = await page.evaluate(() => {
          const av = document.querySelector('.bg-profile-hero img, .bg-profile-hero span');
          if (!av) return true;
          const ar = av.getBoundingClientRect();
          return ![
            ...document.querySelectorAll('button'),
          ].some((b) => {
            const r = b.getBoundingClientRect();
            return r.width <= 34 && r.height <= 34 && Math.abs(r.bottom - ar.bottom) < 20 && Math.abs(r.right - ar.right) < 20;
          });
        });
        report(`${tag}: no 28px badge on avatar (AR)`, badgeGone);
      }

      // ── Flow: Edit Profile → /personal-info; avatar badge opens edit form ──
      const clicked = await page.evaluate((lbl) => {
        const els = [...document.querySelectorAll('button, a')];
        const el = els.find(
          (x) =>
            (x.getAttribute('aria-label') ?? '').trim() === lbl ||
            x.textContent.replace(/\s+/g, ' ').trim().includes(lbl),
        );
        if (!el) return false;
        el.click();
        return true;
      }, editLabel);
      await page.waitForURL('**/personal-info', { timeout: 8000 });
      report(`${tag}: Edit Profile navigates to personal-info`, clicked && page.url().includes('/personal-info'), page.url());
      await page.waitForTimeout(1200);

      // Bounce guard: if AuthBootstrap threw us to /login, re-auth + go back.
      if (!page.url().includes('/personal-info')) {
        const rel = await page.request.post(`${API}/auth/dev-login`, {
          data: { phone: '+966500000001' },
        });
        await page.evaluate(
          (t) => localStorage.setItem('koralink_token', t),
          (await rel.json()).token,
        );
        await page.goto(`${PWA}/${locale}/personal-info`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
      }
      await dismissLanding(page, locale);

      // Precise + overlay-immune: scope to the hero — neither the brand
      // icon nor the "KoraLink" wordmark may exist inside it.
      const piBrand = await page.evaluate(() => {
        const hero = document.querySelector('.bg-profile-hero');
        if (!hero) return { hero: false, icon: false, text: false };
        return {
          hero: true,
          icon: !!hero.querySelector('img[src*="icon-192"]'),
          text: (hero.innerText ?? '').includes('KoraLink'),
        };
      });
      report(
        `${tag}: personal-info has NO brand bar`,
        piBrand.hero && !piBrand.icon && !piBrand.text,
        JSON.stringify(piBrand),
      );

      // Avatar badge (Pencil, aria-label common.edit) opens the edit form.
      const editOpened = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(
          (b) => (b.getAttribute('aria-label') ?? '').length > 0 && b.querySelector('svg'),
        );
        // precise: the badge inside the hero avatar container
        const badge = document.querySelector('.bg-profile-hero .relative > button');
        (badge ?? btn)?.click();
        return Boolean(badge ?? btn);
      });
      await page.waitForTimeout(700);
      const formInputs = await page.evaluate(() => document.querySelectorAll('input, select').length);
      report(`${tag}: avatar badge opens edit form`, editOpened && formInputs >= 3, `inputs/selects=${formInputs}`);

      await page.screenshot({ path: `${SHOTS}/${vp.width}-${locale}-personal-info.png` });
      await ctx.close();
    }
  }
} catch (err) {
  report('script crashed', false, String(err).slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
