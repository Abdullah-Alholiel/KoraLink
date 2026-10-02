import * as fs from 'fs';
import * as path from 'path';
import { UUID_SHAPE, UUID_SHAPE_MSG } from './id-shape';

/**
 * Run #95 (Reviewer A follow-up to P2-136): the KoraLink id shape must have
 * EXACTLY one home — common/validation/id-shape.ts. Run #94 (PRs #63/#64)
 * removed the private `const UUID_SHAPE = ...` copies from the admin DTOs and
 * the realtime gateway imported the shared shape; this tripwire keeps it that
 * way. A private copy silently diverges the moment the house shape changes.
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
    const srcRoot = path.resolve(__dirname, '..', '..');
    // Path-based exemption (PR-Agent round-1 note): id-shape.ts itself is the
    // ONLY allowed home — never exempt by 'export' keyword (any file could
    // carry an exported copy) and the regex also matches type-annotated
    // declarations (const UUID_SHAPE: RegExp = ...).
    const canonical = path.join(srcRoot, 'common', 'validation', 'id-shape.ts');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'dist') continue;
          walk(full);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          if (full === canonical) continue;
          const src = fs.readFileSync(full, 'utf8');
          if (/(?:export\s+)?const\s+UUID_SHAPE(?:\s*:\s*RegExp)?\s*=/.test(src)) {
            offenders.push(path.relative(srcRoot, full));
          }
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
