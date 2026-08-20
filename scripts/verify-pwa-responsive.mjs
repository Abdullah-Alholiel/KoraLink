// Responsive-width verification: phone / tablet / desktop flex behavior.
import pw from '/home/ubuntu/.hermes/profiles/fullstack-dev/home/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright/index.js';
const { chromium } = pw;

const PWA = 'http://100.93.99.24:3000';
const API = 'http://100.93.99.24:3001/api/v1';
const CHROME = '/home/ubuntu/.hermes/profiles/fullstack-dev/home/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const LD_LIBRARY_PATH = '/snap/gnome-46-2404/154/usr/lib/aarch64-linux-gnu:/snap/mesa-2404/1836/usr/lib/aarch64-linux-gnu';

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH },
});

const VIEWPORTS = [
  { label: 'phone 390×844', width: 390, height: 844 },
  { label: 'tablet 768×1024', width: 768, height: 1024 },
  { label: 'desktop 1280×800', width: 1280, height: 800 },
  { label: 'desktop-xl 1920×1080', width: 1920, height: 1080 },
];

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`  [${vp.label} nav] → ${f.url().replace('http://100.93.99.24:3000', '')}`); });
    await page.goto(`${PWA}/ar/play`, { waitUntil: 'domcontentloaded' });
    const login = await page.request.post(`${API}/auth/dev-login`, { data: { phone: '+966500000001' } });
    const { token } = await login.json();
    await page.evaluate((t) => localStorage.setItem('koralink_token', t), token);
    await page.goto(`${PWA}/ar/play`, { waitUntil: 'domcontentloaded' });
    // Cold-start races: (1) AuthBootstrap may redirect to /login BEFORE the
    // token lands; (2) its async validation can redirect AFTER first render
    // (nav appears briefly, then unmounts). Loop until the authed shell is
    // up AND the URL has stayed on /play past the redirect window.
    for (let i = 0; i < 5; i++) {
      if (page.url().includes('/login')) {
        await page.evaluate((t) => localStorage.setItem('koralink_token', t), token);
        await page.goto(`${PWA}/ar/play`, { waitUntil: 'domcontentloaded' });
      }
      try {
        await page.waitForSelector('nav', { timeout: 6000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(2500); // let a late auth redirect fire
      if (page.url().includes('/play') && (await page.$('nav'))) break;
    }
    await page.waitForTimeout(800);

    const m = await page.evaluate(async () => {
      const measure = () => {
        const shell = document.querySelector('.app-shell > div > div') || document.querySelector('.app-shell > div');
        const nav = document.querySelector('nav');
        const shellRect = shell?.getBoundingClientRect();
        const navRect = nav?.getBoundingClientRect();
        const doc = document.documentElement;
        // A content card inside the feed
        const card = shell?.querySelector('.shadow-card') || shell?.querySelector('main div[class*="rounded-2xl"]');
        const cardRect = card?.getBoundingClientRect();
        return {
          vw: window.innerWidth,
          shellW: shellRect ? Math.round(shellRect.width) : null,
          navW: navRect ? Math.round(navRect.width) : null,
          navLeft: navRect ? Math.round(navRect.left) : null,
          shellLeft: shellRect ? Math.round(shellRect.left) : null,
          cardW: cardRect ? Math.round(cardRect.width) : null,
          overflowX: doc.scrollWidth > doc.clientWidth,
        };
      };
      // The SW's controllerchange reload can race the first measurement —
      // re-query if the nav vanished (page mid-reload).
      let first = measure();
      if (first.navW === null) {
        await new Promise((r) => setTimeout(r, 2500));
        first = measure();
      }
      return first;
    });

    const expands = m.shellW !== null && m.shellW > 500;
    report(
      `${vp.label}: shell fills viewport (w=${m.shellW})`,
      m.shellW !== null && vp.width <= 768 ? m.shellW >= vp.width - 2 : expands,
      `shell=${m.shellW} nav=${m.navW}@${m.navLeft} card=${m.cardW} overflowX=${m.overflowX}`,
    );
    report(`${vp.label}: no horizontal overflow`, !m.overflowX, JSON.stringify(m));
    report(
      `${vp.label}: nav aligned with shell`,
      m.navW !== null && m.shellW !== null && Math.abs((m.navLeft ?? 0) - (m.shellLeft ?? 0)) <= 2,
    );
    await page.close();
  }
} catch (err) {
  report('script crashed', false, String(err).slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
