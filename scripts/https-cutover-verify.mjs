// End-to-end HTTPS cutover verification (Slice 1).
// Run from repo root: node scripts/https-cutover-verify.mjs
// Proves: PWA serves over TLS, SW importScripts chain intact, served bundle
// carries the new API origin, REST auth works through :8443, and the /lobby
// namespace now connects over wss (the bug this slice fixes).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');

const PWA = 'https://aa.tail2948f9.ts.net:9450';
const API = 'https://aa.tail2948f9.ts.net:8443';
let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

// 1. PWA serves over HTTPS
const home = await fetch(`${PWA}/en`);
const html = await home.text();
ok('PWA /en over HTTPS', home.status === 200, `status ${home.status}`);

// 2. Served bundle carries the NEW API origin (not the old IP:3001)
const chunkUrls = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
let foundOrigin = false, foundOld = false;
for (const u of chunkUrls.slice(0, 20)) {
  const c = await fetch(`${PWA}${u}`).then((r) => r.text()).catch(() => '');
  if (c.includes('aa.tail2948f9.ts.net:8443')) foundOrigin = true;
  if (c.includes('http://100.93.99.24:3001')) foundOld = true;
}
ok('Served bundle inlines https://…:8443 API origin', foundOrigin);
ok('Served bundle has NO stale http://100.93.99.24:3001', !foundOld);

// 3. SW chain (sw.js → worker-*.js + fallback-*.js) survives the origin change.
//    next-pwa wires offline fallback via handlerDidError→self.fallback plugins
//    (not a bare setCatchHandler call) — check for both patterns.
const sw = await fetch(`${PWA}/sw.js`).then((r) => r.text()).catch(() => '');
const hasFallback = sw.includes('self.fallback') || sw.includes('setCatchHandler');
ok('sw.js serves 200 + offline fallback wired', sw.length > 0 && hasFallback);
const workerMatch = sw.match(/importScripts\([^)]*"(\/worker-[^"]+\.js)"/);
ok('sw.js references worker-<hash>.js', !!workerMatch, workerMatch?.[1] ?? 'not found');
if (workerMatch) {
  const w = await fetch(`${PWA}${workerMatch[1]}`).then((r) => r.text()).catch(() => '');
  ok('worker-*.js serves 200 + showNotification', w.includes('showNotification'));
}
const fallbackMatch = sw.match(/importScripts\([^)]*"(\/fallback-[^"]+\.js)"/);
if (fallbackMatch) {
  const f = await fetch(`${PWA}${fallbackMatch[1]}`);
  ok('fallback-*.js serves 200', f.status === 200);
}

// 4. REST auth through :8443 — dev-login → Bearer → /users/me
const login = await fetch(`${API}/api/v1/auth/dev-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: PWA },
  body: JSON.stringify({ phone: '+966500000001' }),
}).catch((e) => ({ status: 0, error: e.message }));
if (login.ok) {
  const { token } = await login.json();
  const me = await fetch(`${API}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meBody = me.ok ? await me.json() : {};
  ok('dev-login over HTTPS :8443', true, `status ${login.status}`);
  ok('/users/me with Bearer over HTTPS', me.status === 200, `user ${meBody.full_name ?? meBody.id ?? '?'}`);
} else {
  ok('dev-login over HTTPS :8443', false, `status ${login.status}`);
}

// 5. THE FIX: /lobby namespace connects over wss through :8443
await new Promise((resolve) => {
  const s = io(`${API}/lobby`, {
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
  });
  const done = (label) => { ok('wss /lobby namespace over :8443', label === 'connected', label); s.disconnect(); resolve(); };
  s.on('connect', () => done('connected'));
  s.on('connect_error', (e) => done(`connect_error: ${e.message}`));
  setTimeout(() => done('timeout'), 5500);
});

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
