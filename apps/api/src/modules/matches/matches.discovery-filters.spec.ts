import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MatchesService } from './matches.service';
import {
  GetMatchesDto,
  normalizeGenderRule,
} from './dto/get-matches.dto';

/**
 * Discovery filter contract regression specs (run #9).
 *
 * Before the fix, the PWA FilterBar sent `gender=men|women|mixed` (its
 * GENDER_KEYS values) but GetMatchesDto validated `@IsIn(['Men Only',
 * 'Women Only', 'Mixed'])` — so EVERY gender filter tap 400'd the Play feed
 * (forbidNonWhitelisted + IsIn mismatch) instead of filtering.
 *
 * Also pins the new `limit` query param (Sentry KORALINK-API-E: external
 * `?limit=5` calls 400'd because the param was not whitelisted).
 */

/**
 * Recursively collect drizzle SQL bound values. The `sql` template embeds
 * interpolated primitives RAW in queryChunks (they become Params only at
 * build time), so collect both raw primitives and `Param`-shaped objects
 * ({ encoder, value }); skip static StringChunk text (its `.value` is an
 * array of SQL fragments).
 */
function collectParams(chunk: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (typeof chunk === 'string' || typeof chunk === 'number') {
    out.push(chunk);
    return out;
  }
  if (!chunk || typeof chunk !== 'object' || depth > 12) return out;
  const obj = chunk as Record<string, unknown>;
  if ('encoder' in obj && 'value' in obj) out.push(obj.value);
  if (Array.isArray(obj.queryChunks)) {
    for (const child of obj.queryChunks) collectParams(child, out, depth + 1);
  }
  return out;
}

function makeService(capture: (q: unknown) => void): MatchesService {
  const db = {
    execute: async (q: unknown) => {
      capture(q);
      return [];
    },
  };
  const settings = { getNumber: async () => 0 };
  return new MatchesService(
    db as never,
    {} as never, // walletService
    {} as never, // appGateway
    {} as never, // notificationsService
    {} as never, // activitiesService
    settings as never,
    {} as never, // realtime
  );
}

describe('normalizeGenderRule', () => {
  it('maps PWA tokens to DB GenderRule values', () => {
    expect(normalizeGenderRule('women')).toBe('Women Only');
    expect(normalizeGenderRule('men')).toBe('Men Only');
    expect(normalizeGenderRule('mixed')).toBe('Mixed');
  });

  it('passes DB enum values through unchanged', () => {
    expect(normalizeGenderRule('Women Only')).toBe('Women Only');
    expect(normalizeGenderRule('Men Only')).toBe('Men Only');
    expect(normalizeGenderRule('Mixed')).toBe('Mixed');
  });

  it('never maps women onto Men Only (mapGender substring-trap guard)', () => {
    // "women only".includes("men") === true — exact matching must be used.
    expect(normalizeGenderRule('women')).not.toBe('Men Only');
  });
});

describe('GetMatchesDto query contract', () => {
  it('accepts PWA gender tokens and transforms limit from query string', () => {
    const dto = plainToInstance(GetMatchesDto, {
      gender: 'women',
      limit: '5',
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.gender).toBe('women');
    expect(dto.limit).toBe(5); // @Type(() => Number) applied to query string
  });

  it('accepts legacy DB enum strings for backward compatibility', () => {
    const dto = plainToInstance(GetMatchesDto, { gender: 'Women Only' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects unknown gender values (contract stays strict)', () => {
    const dto = plainToInstance(GetMatchesDto, { gender: 'female' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects out-of-range limit', () => {
    expect(
      validateSync(plainToInstance(GetMatchesDto, { limit: '51' })).length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(plainToInstance(GetMatchesDto, { limit: '0' })).length,
    ).toBeGreaterThan(0);
  });
});

describe('MatchesService.findNearby time-of-day window (run #12)', () => {
  it('binds the morning window bounds 4 and 12 (Riyadh local hours)', async () => {
    let params: unknown[] = [];
    const svc = makeService((q) => {
      params = collectParams(q);
    });
    await svc.findNearby({ time: 'morning' } as GetMatchesDto, 'user-1');
    expect(params).toContain(4);
    expect(params).toContain(12);
  });

  it('binds the evening window bounds 17 and 23', async () => {
    let params: unknown[] = [];
    const svc = makeService((q) => {
      params = collectParams(q);
    });
    await svc.findNearby({ time: 'evening' } as GetMatchesDto, 'user-1');
    expect(params).toContain(17);
    expect(params).toContain(23);
  });

  it('night wraps midnight — binds 23 and 4 (OR-form)', async () => {
    let params: unknown[] = [];
    const svc = makeService((q) => {
      params = collectParams(q);
    });
    await svc.findNearby({ time: 'night' } as GetMatchesDto, 'user-1');
    expect(params).toContain(23);
    expect(params).toContain(4);
  });

  it('no time param → no window bounds in the SQL', async () => {
    let params: unknown[] = [];
    const svc = makeService((q) => {
      params = collectParams(q);
    });
    await svc.findNearby({} as GetMatchesDto, 'user-1');
    expect(params).not.toContain(4);
    expect(params).not.toContain(12);
    expect(params).not.toContain(17);
    expect(params).not.toContain(23);
  });
});

describe('MatchesService.findNearby gender + limit', () => {
  it('filters by the NORMALIZED gender value, not the raw token', async () => {
    let params: unknown[] = [];
    const svc = makeService((q) => {
      params = collectParams(q);
    });
    await svc.findNearby({ gender: 'women' } as GetMatchesDto, 'user-1');
    // The DB comparison must see 'Women Only' — before the fix the raw token
    // 'women' was compared against the enum and (after the DTO 400 was passed)
    // matched zero rows.
    expect(params).toContain('Women Only');
    expect(params).not.toContain('women');
  });

  it('applies the limit param to the SQL LIMIT', async () => {
    let params: unknown[] = [];
    const svc = makeService((q) => {
      params = collectParams(q);
    });
    await svc.findNearby({ limit: 5 } as GetMatchesDto, 'user-1');
    expect(params).toContain(5);
  });

  it('defaults to LIMIT 50 when no limit is sent', async () => {
    let params: unknown[] = [];
    const svc = makeService((q) => {
      params = collectParams(q);
    });
    await svc.findNearby({} as GetMatchesDto, 'user-1');
    expect(params).toContain(50);
  });
});
