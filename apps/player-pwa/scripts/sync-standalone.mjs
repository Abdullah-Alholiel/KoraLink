/**
 * Sync static assets into the Next.js standalone build AND restart the PWA
 * service so the running Node process reloads the new build manifests.
 *
 * With `output: 'standalone'`, Next.js emits a minimal server bundle but does
 * NOT include `public/` or `.next/static/`. The systemd service serves the
 * standalone directory directly, so these must be copied in after every build —
 * otherwise the PWA serves 400/HTML for every image, font and client JS chunk
 * (breaking hydration, the feed, the nav icons, and throwing
 * `ChunkLoadError: Loading chunk N failed` on lazy routes like profile/sign-out).
 *
 * A bare `next build` regenerates `.next/standalone/` (wiping any previously
 * synced assets) without re-syncing. This script is wired into npm's `postbuild`
 * hook so EVERY build — including `turbo run build` from the repo root — syncs
 * the assets AND restarts the service, making the deploy idempotent and immune
 * to the "forgot to run build-deploy" failure mode.
 *
 * Usage (from apps/player-pwa):
 *   node scripts/sync-standalone.mjs                              # sync + restart
 *   KORALINK_NO_RESTART=1 node scripts/sync-standalone.mjs        # sync only (CI)
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
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

// ── Restart the PWA service so the running process picks up the new build ─
// ── manifests. Skipping this leaves the server serving stale chunk URLs,  ─
// ── which surfaces as `ChunkLoadError` on the client.                     ─
if (process.env.KORALINK_NO_RESTART === '1') {
    console.log('⏭  KORALINK_NO_RESTART=1 set — skipping service restart.');
} else {
    try {
        execSync('systemctl --user restart koralink-pwa.service', { stdio: 'pipe' });
        console.log('✔ Restarted koralink-pwa.service');
    } catch {
        // Not running under systemd user services (CI / Docker / local dev) — no-op.
        console.log('ℹ  koralink-pwa.service not available here — skipping restart (CI/local).');
    }
}

console.log('✅ Standalone build assets synced.');
