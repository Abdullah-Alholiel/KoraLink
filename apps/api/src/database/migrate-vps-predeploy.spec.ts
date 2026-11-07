import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-51 repo-side half (run #117): scripts/migrate-vps.mjs must be usable as
 * a Render Pre-Deploy Command. Render services have REAL env vars but NO
 * repo .env file, so the script must accept a plain DATABASE_URL env as the
 * last resolution step (after MIGRATE_DATABASE_URL, before apps/api/.env).
 *
 * The DASHBOARD-side steps (owner-only, per DECISIONS.md credential rule):
 *   1. Render dashboard → API service → Settings → Pre-Deploy Command:
 *      `node scripts/migrate-vps.mjs`   (workdir: repo root)
 *   2. Save (this redeploys with the hook active on the NEXT deploy).
 * Until Abdullah adds the hook, demo deploys keep the manual-runbook path.
 */

const SCRIPT_PATH = join(__dirname, '..', '..', '..', '..', 'scripts', 'migrate-vps.mjs');

describe('migrate-vps.mjs P2-51 pre-deploy contract (run #117)', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');

  it('resolves the DB url: MIGRATE_DATABASE_URL → DATABASE_URL → apps/api/.env', () => {
    const m = src.match(/process\.env\.MIGRATE_DATABASE_URL\s*\|[\s\S]{0,80}?process\.env\.DATABASE_URL\s*\|[\s\S]{0,400}?readFileSync\(ENV_FILE/);
    expect(m).not.toBeNull();
  });

  // Run #118 Reviewer A MINOR: a missing .env file must fail-loud via the
  // exit-5 branch (undefined -> contract message), never an unhandled
  // readFileSync stack trace on a Render cold misconfig.
  it('tolerates a missing .env file (try/catch -> undefined -> exit 5)', () => {
    const chain = src.match(/readFileSync\(ENV_FILE[^)]*\)[\s\S]{0,200}?catch/);
    expect(chain).not.toBeNull();
  });

  it('still exits 5 when no source resolves (fail-loud preserved)', () => {
    expect(src).toMatch(/process\.exit\(5\)/);
    expect(src).toMatch(/no MIGRATE_DATABASE_URL\/DATABASE_URL env/);
  });
});
