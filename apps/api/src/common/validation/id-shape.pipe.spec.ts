import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ParseUuidShapePipe, UUID_SHAPE } from './id-shape';

/**
 * P2-241 (Reviewer A run #153, item 7): the route-param sibling of the
 * UUID_SHAPE DTO convention. Raw `:id` params on the matches/conversations
 * controllers are shape-checked at the pipe — a garbage id is a clean 400
 * instead of a doomed query that 500s (or 404s from a shape the client
 * should never have sent).
 */

const CONTROLLERS: Array<{ file: string; pinnedPipeCount: number }> = [
  { file: join(__dirname, '../../modules/matches/matches.controller.ts'), pinnedPipeCount: 18 },
  { file: join(__dirname, '../../modules/conversations/conversations.controller.ts'), pinnedPipeCount: 2 },
  { file: join(__dirname, '../../modules/matches/waitlist.controller.ts'), pinnedPipeCount: 3 },
];

const BARE_PARAM = /@Param\('([a-zA-Z]+)'\)\s+[a-zA-Z]+\s*:\s*string/g;
const PIPED_PARAM = /@Param\('[a-zA-Z]+',\s*ParseUuidShapePipe\)/g;

describe('ParseUuidShapePipe (P2-241)', () => {
  const pipe = new ParseUuidShapePipe();

  const VALID = [
    '0b8b6f2e-1c4d-4a5b-9c2f-3d4e5f6a7b8c', // v4-shaped
    '00000000-0000-0000-0000-000000000000', // all zeros
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', // uppercase accepted (regex is /i)
  ];

  const INVALID = [
    '',
    'not-a-uuid',
    '0b8b6f2e1c4d4a5b9c2f3d4e5f6a7b8c', // 32 hex, no dashes
    '0b8b6f2e-1c4d-4a5b-9c2f-3d4e5f6a7b8', // 35 chars
    '0b8b6f2e-1c4d-4a5b-9c2f-3d4e5f6a7b8cc', // 37 chars
    "0b8b6f2e-1c4d-4a5b-9c2f-3d4e5f6a7b8c'", // SQL-quote payload
    '0b8b6f2e-1c4d-4a5b-9c2f-3d4e5f6a7b8c; DROP TABLE users', // injection-shaped junk
    "1' OR '1'='1",
    '../etc/passwd',
  ];

  it.each(VALID)('passes a well-formed id through unchanged: %s', (id) => {
    expect(pipe.transform(id)).toBe(id);
  });

  it.each(INVALID)('rejects a malformed id with BadRequestException: %s', (id) => {
    expect(() => pipe.transform(id)).toThrow(BadRequestException);
  });

  it('rejection message names the field and the house shape', () => {
    expect(() => pipe.transform('nope')).toThrow(/id must be a 36-char UUID-shaped id/);
  });

  it('the pipe regex IS the shared UUID_SHAPE (single source of truth)', () => {
    expect(UUID_SHAPE.source).toBe(
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    );
    expect(UUID_SHAPE.flags).toBe('i');
  });

  // Source-coverage tripwire (same pattern as ws-gate-coverage.spec.ts):
  // every string-typed route param in the pinned controllers must carry the
  // pipe. A new handler with a bare @Param('id') fails this — that failure is
  // the tripwire firing.
  describe('every id route param in matches/conversations/waitlist is pipe-wrapped', () => {
    for (const { file, pinnedPipeCount } of CONTROLLERS) {
      const name = file.split('/').slice(-2).join('/');
      it(`${name}: no bare string route params remain`, () => {
        const src = readFileSync(file, 'utf8');
        const bare = [...src.matchAll(BARE_PARAM)].map((m) => m[1]);
        expect(bare).toEqual([]);
      });

      it(`${name}: pipe count stays pinned at ${pinnedPipeCount}`, () => {
        const src = readFileSync(file, 'utf8');
        expect((src.match(PIPED_PARAM) ?? []).length).toBe(pinnedPipeCount);
      });
    }
  });
});
