import * as fs from 'fs';
import * as path from 'path';
import { UUID_SHAPE, UUID_SHAPE_MSG } from './id-shape';

/**
 * Run #95 (Reviewer A follow-up to P2-136): the KoraLink id shape must have
 * EXACTLY one home — common/validation/id-shape.ts. Run #94 (PRs #63/#64)
 * removed the private `const UUID_SHAPE = ...` copies from the admin DTOs and
 * the realtime gateway imported the shared shape; this tripwire keeps it that
 * way. A private copy silently diverges the moment the house shape changes.
 * Scope is MONOREPO-WIDE (PR-Agent r3): the walk roots at the repo root
 * (located via turbo.json), so copies in apps/admin or apps/player-pwa trip
 * the wire too, not just apps/api.
 */
describe('id-shape single source of truth', () => {
  it('exports a working UUID_SHAPE regex + message', () => {
    expect(UUID_SHAPE).toBeInstanceOf(RegExp);
    expect(UUID_SHAPE.test('0a54f80c-6e79-4123-a2d6-9eeeeb64e63a')).toBe(true);
    expect(UUID_SHAPE.test('0A54F80C-6E79-4123-A2D6-9EEEEB64E63A')).toBe(true);
    expect(UUID_SHAPE.test('not-an-id')).toBe(false);
    expect(UUID_SHAPE.test('0a54f80c-6e79-4123-a2d6-9eeeeb64e6')).toBe(false);
    expect(typeof UUID_SHAPE_MSG).toBe('string');
    expect(UUID_SHAPE_MSG.length).toBeGreaterThan(0);
  });

  it('no private UUID_SHAPE regex copies exist outside id-shape.ts', () => {
    // __dirname = <repo>/apps/api/src/common/validation → three levels up = <repo>/apps/api
    const apiRoot = path.resolve(__dirname, '..', '..', '..');
    const srcRoot = path.join(apiRoot, 'src');
    // Monorepo root (r3): walk up to the dir containing turbo.json so the
    // invariant covers every workspace, not just apps/api.
    let repoRoot = apiRoot;
    for (let i = 0; i < 4 && !fs.existsSync(path.join(repoRoot, 'turbo.json')); i++) {
      repoRoot = path.dirname(repoRoot);
    }
    // Invariant (PR-Agent r1+r2): id-shape.ts is the ONLY allowed home for a
    // UUID_SHAPE declaration. Exemptions are PATH-based and limited to
    // exactly two files: the canonical module itself, and THIS spec (its
    // source text necessarily describes the pattern). Both export-keyword
    // copies and type-annotated declarations are matched. Spec files are
    // scanned too (r2) — a private copy in a test helper diverges all the
    // same.
    const canonical = path.join(srcRoot, 'common', 'validation', 'id-shape.ts');
    const self = path.resolve(__filename);
    const exempt = new Set([canonical, self]);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === '.next' ||
            entry.name === '.turbo' ||
            entry.name === '.git' ||
            entry.name === 'coverage' ||
            entry.name === 'graphify-out'
          ) {
            continue;
          }
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          if (exempt.has(full)) continue;
          const src = fs.readFileSync(full, 'utf8');
          if (/(?:export\s+)?const\s+UUID_SHAPE(?:\s*:\s*RegExp)?\s*=/.test(src)) {
            offenders.push(path.relative(srcRoot, full));
          }
        }
      }
    };
    walk(repoRoot);
    expect(offenders).toEqual([]);
  });
});
