import * as fs from 'fs';
import * as path from 'path';
import { UUID_SHAPE, UUID_SHAPE_MSG } from './id-shape';
import {
  findIdShapeCopies,
  stripLineComments,
  ID_SHAPE_DECL_PATTERN,
} from './id-shape-scan';


/**
 * Run #95 (PR #65): the KoraLink id shape must have EXACTLY one home —
 * common/validation/id-shape.ts. Run #96 (Reviewer A IMPORTANT follow-up):
 * the scan now catches `let`/`var`/`type` declarations and any non-bare
 * annotation (`: Readonly<RegExp>`, unions), and strips `//` comments before
 * matching so a documented example can no longer fail CI. Negative forms get
 * real fixture tests in id-shape-scan.spec.ts; this spec runs the scan
 * against the LIVE monorepo tree.
 *
 * Scope is MONOREPO-WIDE (run #95 r3): the walk roots at the repo root
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
    if (!fs.existsSync(path.join(repoRoot, 'turbo.json'))) {
      throw new Error(
        'id-shape tripwire: monorepo root (turbo.json) not found within 4 levels of ' +
          apiRoot +
          ' — refusing to scan the wrong tree',
      );
    }
    // Invariant: id-shape.ts is the ONLY allowed home for a UUID_SHAPE
    // declaration. Exemptions are PATH-based and limited to exactly four
    // files: the canonical module, THIS spec (its source text describes the
    // pattern), the scanner module, and the scanner's fixture spec (its
    // fixture strings are declaration-shaped by design). Spec files are
    // scanned too (r2) — a private copy in any OTHER test helper diverges
    // all the same.
    const canonical = path.join(srcRoot, 'common', 'validation', 'id-shape.ts');
    const self = path.resolve(__filename);
    const scanner = path.join(srcRoot, 'common', 'validation', 'id-shape-scan.ts');
    const fixtureSpec = path.join(srcRoot, 'common', 'validation', 'id-shape-scan.spec.ts');
    // Fixture strings in the scanner's own spec are declaration-shaped by
    // design (they ARE the negative/positive fixtures) — same rationale as
    // the tripwire spec's self-exemption.
    const exempt = new Set([canonical, self, scanner, fixtureSpec]);
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
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          if (exempt.has(full)) continue;
          const src = fs.readFileSync(full, 'utf8');
          if (findIdShapeCopies([{ relPath: path.relative(srcRoot, full), text: src }]).length > 0) {
            offenders.push(path.relative(srcRoot, full));
          }
        }
      }
    };
    walk(repoRoot);
    expect(offenders).toEqual([]);
  });
});

// The pattern module itself is exercised directly in id-shape-scan.spec.ts
// (fixture suite). This re-export guard just proves the pattern survived
// refactoring: a doc example is NOT an offender, a real declaration IS.
describe('id-shape scan pattern sanity', () => {
  it('pattern ignores commented examples after stripping', () => {
    const doc = '// const UUID_SHAPE = /^[0-9a-f-]+$/;';
    expect(stripLineComments(doc)).not.toMatch(ID_SHAPE_DECL_PATTERN);
  });
});
