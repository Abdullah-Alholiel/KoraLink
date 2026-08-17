/**
 * Sync static assets into the Next.js standalone build AND restart the admin
 * service so the running Node process reloads the new build manifests.
 *
 * Mirrors the player-pwa sync script. With `output: 'standalone'`, Next emits a
 * minimal server bundle but does NOT include `public/` or `.next/static/` — the
 * systemd service serves the standalone directory directly, so these must be
 * copied in after every build or the console serves HTML for every JS chunk.
 *
 * Wired into npm's `postbuild` hook so EVERY build (including `turbo run build`
 * from the repo root) syncs assets AND restarts the service.
 *
 * Usage (from apps/admin):
 *   node scripts/sync-standalone.mjs                            # sync + restart
 *   KORALINK_NO_RESTART=1 node scripts/sync-standalone.mjs      # sync only (CI)
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const adminDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneDir = join(adminDir, '.next', 'standalone', 'apps', 'admin');

if (!existsSync(join(adminDir, '.next', 'standalone'))) {
  console.error('❌ No .next/standalone output found. Run `next build` first.');
  process.exit(1);
}

// ── public/ ─────────────────────────────────────────────────────────────────
const publicSrc = join(adminDir, 'public');
const publicDest = join(standaloneDir, 'public');
if (existsSync(publicSrc)) {
  rmSync(publicDest, { recursive: true, force: true });
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✔ Synced public/ → standalone/public');
} else {
  console.warn('⚠ No public/ directory — skipping.');
}

// ── .next/static/ (client JS/CSS chunks — required for hydration) ──────────
const staticSrc = join(adminDir, '.next', 'static');
const staticDest = join(standaloneDir, '.next', 'static');
if (existsSync(staticSrc)) {
  rmSync(staticDest, { recursive: true, force: true });
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✔ Synced .next/static → standalone/.next/static');
} else {
  console.warn('⚠ No .next/static directory — skipping.');
}

// ── Restart the admin service so the running process picks up the new build ─
if (process.env.KORALINK_NO_RESTART === '1') {
  console.log('⏭  KORALINK_NO_RESTART=1 set — skipping service restart.');
} else {
  try {
    execSync('systemctl --user restart koralink-admin.service', { stdio: 'pipe' });
    console.log('✔ Restarted koralink-admin.service');
  } catch {
    console.log('ℹ  koralink-admin.service not available here — skipping restart (CI/local).');
  }
}

console.log('✅ Standalone build assets synced.');
