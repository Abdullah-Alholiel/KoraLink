#!/usr/bin/env node
/**
 * KoraLink P2-371 — Playwright real-browser layout audit (factory run #220 baseline)
 *
 * Owner directive D-20261113-33 ("make the standards enforce themselves", Life-OS brief Part 2).
 * 12 pages × {ar,en} × {360,390,430} on the live staging PWA (localhost:3000) with a real
 * dev-login session: the zustand persist blob is seeded via addInitScript BEFORE app code
 * (mirrors koralink-frontend-patterns e2e-auth-seeding.md), so AuthGuard renders authenticated
 * content deterministically (no cold-storage bounce).
 *
 * Checks: H-SCROLL / OOB / OVERLAP (text-leaf pairs >8px, ancestor-aware) / TAP (<44px) /
 * CONSOLE (errors + MISSING_MESSAGE). Only app API traffic (glob api-slash-v1) is intercepted
 * (forwarded to 127.0.0.1:3001 with cookie + allowlisted origin); Sentry ingest is untouched.
 * Deferred: sheet-interaction probes, CI wiring, skill updates.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));

const EXE = process.env.PW_CHROMIUM || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const PWA = 'http://localhost:3000';
const API = 'http://127.0.0.1:3001';
const SEED_PHONE = '+966500000001';
const VIEWPORTS = [
  { w: 360, h: 640, tag: '360' },
  { w: 390, h: 844, tag: '390' },
  { w: 430, h: 932, tag: '430' },
];
const OUT = process.env.OUT || '/tmp/p2371';

const PAGES = [
  { id: 'login', path: l => `/${l}/login`, auth: false },
  { id: 'play', path: l => `/${l}/play`, auth: true },
  { id: 'clubs', path: l => `/${l}/clubs`, auth: true },
  { id: 'club-detail', path: l => `/${l}/clubs/${CLUB_ID}`, auth: true },
  { id: 'my-games', path: l => `/${l}/my-games`, auth: true },
  { id: 'wallet', path: l => `/${l}/wallet`, auth: true },
  { id: 'profile', path: l => `/${l}/profile`, auth: true },
  { id: 'messages', path: l => `/${l}/messages`, auth: true },
  { id: 'match-detail', path: l => `/${l}/match/${MATCH_ID}`, auth: true },
  { id: 'privacy', path: l => `/${l}/privacy`, auth: false },
  { id: 'terms', path: l => `/${l}/terms`, auth: false },
  { id: 'host', path: l => `/${l}/host`, auth: true },
];

let CLUB_ID = null;
let MATCH_ID = null;

async function api(pathname, cookie) {
  const r = await fetch(`${API}${pathname}`, { headers: { cookie: `access_token=${cookie}`, origin: 'http://localhost:3000' } });
  if (!r.ok) return null;
  return r.json();
}

(async () => {
  // ── auth: single dev-login (route is throttled 3/min — one call is safe) ──
  const lr = await fetch(`${API}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: SEED_PHONE, surface: 'player' }),
  });
  if (!lr.ok) throw new Error(`dev-login failed: ${lr.status}`);
  const COOKIE = decodeURIComponent((lr.headers.get('set-cookie') || '').match(/access_token=([^;]+)/)[1]);

  // ── fixtures (real endpoints; /matches/nearby does NOT exist — bare GET /matches) ──
  const venues = await api('/api/v1/venues', COOKIE);
  if (Array.isArray(venues) && venues.length) CLUB_ID = venues[0].id;
  const matchesResp = await api('/api/v1/matches', COOKIE);
  const matches = Array.isArray(matchesResp) ? matchesResp : (matchesResp?.matches || []);
  if (matches.length) {
    const up = matches.find(m => new Date(m.scheduled_at).getTime() > Date.now());
    MATCH_ID = (up || matches[0]).id;
  }
  console.log(`fixtures: CLUB_ID=${CLUB_ID} MATCH_ID=${MATCH_ID}`);

  // ── /users/me for the persisted store blob ──
  const me = await api('/api/v1/users/me', COOKIE);
  if (!me) throw new Error('/users/me failed');

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const report = { generatedAt: new Date().toISOString(), pwa: PWA, api: API, fixtures: { CLUB_ID, MATCH_ID }, results: [] };

  for (const locale of ['ar', 'en']) {
    const storeUser = {
      id: me.id, fullName: me.full_name, handle: me.handle, avatarUrl: me.avatar_url || '',
      phone: me.phone, preferredLocation: me.preferred_location || '', preferredPosition: me.preferred_position || '',
      locale,
    };
    const persistBlob = JSON.stringify({
      state: {
        preferences: { locale, theme: 'system', notificationsEnabled: true },
        token: COOKIE, user: storeUser, isAuthenticated: true, isOnboarded: true,
        bookedMatchIds: [], balance: 0, paymentMethods: [],
      },
      version: 0,
    });

    for (const vp of VIEWPORTS) {
      for (const pg of PAGES) {
        if (pg.id === 'club-detail' && !CLUB_ID) { report.results.push({ locale, viewport: vp.tag, page: pg.id, skipped: 'no club fixture' }); continue; }
        if (pg.id === 'match-detail' && !MATCH_ID) { report.results.push({ locale, viewport: vp.tag, page: pg.id, skipped: 'no match fixture' }); continue; }

        const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        await ctx.addInitScript(([blob]) => { localStorage.setItem('koralink-app-store', blob); }, [persistBlob]);
        await ctx.addCookies([{ name: 'access_token', value: COOKIE, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
        const page = await ctx.newPage();
        const consoleErrs = [];
        page.on('console', msg => {
          const t = msg.text();
          if (msg.type() === 'error' || /MISSING_MESSAGE/i.test(t)) consoleErrs.push(t.slice(0, 400));
        });
        page.on('pageerror', e => consoleErrs.push(`pageerror: ${String(e).slice(0, 300)}`));

        // Intercept ONLY app API calls (funnel origin + any /api/v1/**); forward to loopback
        // with the auth cookie and an allowlisted origin header. Sentry ingest (/api/<id>/)
        // does NOT match this glob and stays untouched.
        await page.route('**/api/v1/**', async route => {
          try {
            const req = route.request();
            const u = new URL(req.url());
            const headers = { ...req.headers() };
            headers['origin'] = 'http://localhost:3000';
            if (!String(headers['cookie'] || '').includes('access_token')) headers['cookie'] = `access_token=${COOKIE}`;
            const resp = await fetch(`${API}${u.pathname}${u.search}`, {
              method: req.method(), headers,
              body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData(),
            });
            const buf = Buffer.from(await resp.arrayBuffer());
            const h = {};
            resp.headers.forEach((v, k) => { if (!k.startsWith('access-control-')) h[k] = v; });
            h['access-control-allow-origin'] = 'http://localhost:3000';
            h['access-control-allow-credentials'] = 'true';
            route.fulfill({ status: resp.status, headers: h, body: buf });
          } catch { route.continue(); }
        });

        const entry = { locale, viewport: vp.tag, page: pg.id, url: pg.path(locale), findings: {} };
        try {
          const resp = await page.goto(PWA + pg.path(locale), { waitUntil: 'domcontentloaded', timeout: 30_000 });
          if (!resp || resp.status() >= 400) {
            entry.findings.NAV = [`HTTP ${resp ? resp.status() : 'null'}`];
          } else {
            await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
            await page.waitForTimeout(600);
            const bounced = /\/login$/.test(new URL(page.url()).pathname) && pg.id !== 'login';
            if (bounced) {
              entry.findings.NAV = [`auth-bounce: ${pg.path(locale)} -> ${page.url()}`];
            } else {
              const data = await page.evaluate(() => {
                const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
                const out = {
                  hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                  scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
                  oob: [], overlaps: [], tap: [],
                };
                const visible = el => {
                  const r = el.getBoundingClientRect();
                  if (r.width < 2 || r.height < 2) return null;
                  const cs = getComputedStyle(el);
                  if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
                  if (r.bottom <= 0 || r.top >= vh) return null;
                  return r;
                };
                for (const el of document.body.querySelectorAll('*')) {
                  const r = visible(el);
                  if (!r) continue;
                  if (r.right > vw + 1 || r.left < -1) {
                    // skip children of horizontal scrollers (carousels legitimately extend)
                    let n = el.parentElement, inScroller = false;
                    while (n && n !== document.body) {
                      const cs = getComputedStyle(n);
                      if (/(auto|scroll)/.test(cs.overflowX)) { inScroller = true; break; }
                      n = n.parentElement;
                    }
                    if (inScroller) continue;
                    const txt = (el.textContent || '').trim().slice(0, 40);
                    out.oob.push(`${el.tagName.toLowerCase()} [${Math.round(r.left)},${Math.round(r.right)}] ${txt}`);
                    if (out.oob.length >= 5) break;
                  }
                }
                const leaves = [];
                for (const el of document.body.querySelectorAll('h1,h2,h3,h4,p,span,button,a,label')) {
                  const r = visible(el);
                  if (!r) continue;
                  const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ');
                  if (!own) continue;
                  leaves.push({ el, r, txt: own.slice(0, 30) });
                }
                for (let i = 0; i < leaves.length && out.overlaps.length < 5; i++) {
                  for (let j = i + 1; j < leaves.length && out.overlaps.length < 5; j++) {
                    if (leaves[i].el.contains(leaves[j].el) || leaves[j].el.contains(leaves[i].el)) continue;
                    const a = leaves[i].r, b = leaves[j].r;
                    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                    if (ox > 8 && oy > 8) out.overlaps.push(`${leaves[i].txt} ⇄ ${leaves[j].txt}`);
                  }
                }
                for (const el of document.body.querySelectorAll('button, a, input, select, textarea, [role="button"]')) {
                  const r = visible(el);
                  if (!r) continue;
                  if (r.width < 44 || r.height < 44) {
                    const lbl = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 30);
                    out.tap.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} ${lbl}`);
                    if (out.tap.length >= 8) break;
                  }
                }
                return out;
              });
              entry.findings = {
                H_SCROLL: data.hScroll ? [`scrollWidth ${data.scrollW} > clientWidth ${data.clientW}`] : [],
                OOB: data.oob.slice(0, 5),
                OVERLAP: data.overlaps.slice(0, 5),
                TAP: data.tap.slice(0, 8),
                CONSOLE: consoleErrs.filter(t => !/wss:|WebSocket/i.test(t)).slice(0, 5),
              };
            }
          }
        } catch (e) {
          entry.findings.NAV = [String(e).slice(0, 160)];
        }
        report.results.push(entry);
        await ctx.close();
      }
    }
  }

  await browser.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  let total = 0;
  const byKind = {};
  for (const r of report.results) {
    for (const [k, v] of Object.entries(r.findings || {})) {
      if (v && v.length) { total += v.length; byKind[k] = (byKind[k] || 0) + v.length; }
    }
  }
  console.log('== P2-371 audit summary ==');
  console.log('pages scanned:', report.results.length, '| findings total:', total);
  console.log('by kind:', JSON.stringify(byKind));
  const dirty = report.results.filter(r => Object.values(r.findings || {}).some(v => v && v.length));
  for (const r of dirty.slice(0, 30)) {
    for (const [k, v] of Object.entries(r.findings || {})) {
      if (v && v.length) console.log(`${k} ${r.locale}/${r.viewport} ${r.page}: ${v.slice(0, 2).join(' | ').slice(0, 180)}`);
    }
  }
})().catch(e => { console.error('AUDIT FAILED:', e); process.exit(1); });
