/**
 * Sync static assets into the Next.js standalone build.
 *
 * With `output: 'standalone'`, Next.js emits a minimal server bundle but does
 * NOT include `public/` or `.next/static/`. The systemd service serves the
 * standalone directory directly, so these must be copied in after every build —
 * otherwise the PWA serves 400/HTML for every image, font and client JS chunk
 * (breaking hydration, the feed, and the nav icons).
 *
 * Usage (from apps/player-pwa):  node scripts/sync-standalone.mjs
 * Or via:                        npm run build-deploy
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pwaDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneDir = join(pwaDir, '.next', 'standalone', 'apps', 'player-pwa');

if (!existsSync(join(pwaDir, '.next', 'standalone'))) {
    console.error('❌ No .next/standalone output found. Run `next build` first.');
    process.exit(1);
}

// ── public/ (images, icons, manifest, sw.js) ──────────────────────────────
const publicSrc = join(pwaDir, 'public');
const publicDest = join(standaloneDir, 'public');
if (existsSync(publicSrc)) {
    rmSync(publicDest, { recursive: true, force: true });
    cpSync(publicSrc, publicDest, { recursive: true });
    console.log('✔ Synced public/ → standalone/public');
} else {
    console.warn('⚠ No public/ directory — skipping.');
}

// ── .next/static/ (client JS/CSS chunks — required for hydration) ────────
const staticSrc = join(pwaDir, '.next', 'static');
const staticDest = join(standaloneDir, '.next', 'static');
if (existsSync(staticSrc)) {
    rmSync(staticDest, { recursive: true, force: true });
    cpSync(staticSrc, staticDest, { recursive: true });
    console.log('✔ Synced .next/static → standalone/.next/static');
} else {
    console.warn('⚠ No .next/static directory — skipping.');
}

console.log('✅ Standalone build assets synced.');
