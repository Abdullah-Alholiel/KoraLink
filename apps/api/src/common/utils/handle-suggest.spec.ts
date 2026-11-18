/**
 * Cutover Card 2 (2026-11-16, P1) — handle derivation + auto-pick primitives.
 * Pure functions: no DB, fully deterministic via the injected RNG.
 */
import {
  slugifyHandle,
  pickFreeHandle,
  pgUniqueViolationCode,
} from './handle-suggest';

describe('slugifyHandle', () => {
  it('lowercases and underscores a Latin name (the old client rule, kept wire-compatible)', () => {
    expect(slugifyHandle('Ahmed Al Rashid')).toBe('ahmed_al_rashid');
    expect(slugifyHandle('Abdullah')).toBe('abdullah');
  });

  it('already-conforming handles round-trip unchanged', () => {
    expect(slugifyHandle('ahmed_al-rashid')).toBe('ahmed_al-rashid');
  });

  it('an Arabic-only name produces NO usable slug → null (server falls back to "player_<n>")', () => {
    expect(slugifyHandle('محمد')).toBeNull();
    expect(slugifyHandle('عبدالله الأحمد')).toBeNull();
  });

  it('mixed Arabic/Latin keeps the Latin part', () => {
    expect(slugifyHandle('محمد Mike')).toBe('mike');
  });

  it('diacritics are stripped (é → e)', () => {
    expect(slugifyHandle('José García')).toBe('jose_garcia');
  });

  it('all-punctuation names → null', () => {
    expect(slugifyHandle('***')).toBeNull();
    expect(slugifyHandle('   ')).toBeNull();
  });

  it('long slugs are truncated to leave suffix room (≤ 46 chars)', () => {
    const slug = slugifyHandle('a'.repeat(80));
    expect(slug).not.toBeNull();
    expect(slug!.length).toBeLessThanOrEqual(46);
  });
});

describe('pickFreeHandle', () => {
  // RNG stub: always returns the same suffix so expectations are exact.
  const fixedRand = () => 42;

  it('returns the requested handle when free (first candidate wins)', async () => {
    const picked = await pickFreeHandle('abdullah', false, async () => [], fixedRand);
    expect(picked).toBe('abdullah');
  });

  it('auto-suffixes a taken handle: abdullah → abdullah_42', async () => {
    const lookup = async (handles: string[]) =>
      handles.includes('abdullah') ? [{ id: 'u-b', handle: 'abdullah' }] : [];
    const picked = await pickFreeHandle('abdullah', false, lookup, fixedRand);
    expect(picked).toBe('abdullah_42');
  });

  it('probes exactly ONE lookup round for the whole candidate batch', async () => {
    const lookup = jest.fn(async (_handles: string[]) => [] as Array<{ id: string; handle: string | null }>);
    await pickFreeHandle('abdullah', false, lookup, fixedRand);
    expect(lookup).toHaveBeenCalledTimes(1);
    const probed: string[] = lookup.mock.calls[0]?.[0] ?? [];
    expect(probed[0]).toBe('abdullah');
    expect(probed.length).toBeGreaterThan(20); // requested + ~60 suffixed candidates
    expect(probed).toContain('abdullah_42');
  });

  it('handles the user-sent legacy shape with punctuation (slug used as suffix base)', async () => {
    const lookup = async (handles: string[]) =>
      handles.filter((h) => h === 'ahmed_al-rashid').length > 0
        ? [{ id: 'u-b', handle: 'ahmed_al-rashid' }]
        : [];
    const picked = await pickFreeHandle('ahmed_al-rashid', false, lookup, fixedRand);
    expect(picked).toMatch(/^ahmed_al-rashid_\d{2}$/);
  });

  it('a null requested (Arabic-only name) generates "player_<n>" candidates', async () => {
    const lookup = jest.fn(async (_handles: string[]) => [] as Array<{ id: string; handle: string | null }>);
    const picked = await pickFreeHandle(null, false, lookup, fixedRand);
    expect(picked).toBe('player_42');
    expect(lookup.mock.calls[0]?.[0]?.[0]).toBe('player_42');
  });

  it('returns null when EVERY candidate is taken (caller decides — 409 path)', async () => {
    const lookup = async (handles: string[]) => handles.map((h) => ({ id: 'x', handle: h }));
    const picked = await pickFreeHandle('abdullah', false, lookup, fixedRand);
    expect(picked).toBeNull();
  });

  it('self-owned handle short-circuits without any lookup', async () => {
    const lookup = jest.fn(async (_handles: string[]) => {
      throw new Error('must not be called');
    });
    const picked = await pickFreeHandle('my_handle', true, lookup, fixedRand);
    expect(picked).toBe('my_handle');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('uses crypto randomInt by default (bounds respected)', async () => {
    const lookup = async (handles: string[]) =>
      handles.includes('abdullah') ? [{ id: 'u-b', handle: 'abdullah' }] : [];
    const picked = await pickFreeHandle('abdullah', false, lookup);
    expect(picked).toMatch(/^abdullah_\d{2,3}$/);
  });
});

describe('pgUniqueViolationCode', () => {
  it('reads the code from a flat driver error', () => {
    const err = Object.assign(new Error('x'), { code: '23505' });
    expect(pgUniqueViolationCode(err)).toBe('23505');
  });

  it('reads the code through err.cause (postgres-js wrapping)', () => {
    const err = Object.assign(new Error('wrapped'), { cause: { code: '23505' } });
    expect(pgUniqueViolationCode(err)).toBe('23505');
  });

  it('returns undefined for non-PG errors', () => {
    expect(pgUniqueViolationCode(new Error('boom'))).toBeUndefined();
    expect(pgUniqueViolationCode(undefined)).toBeUndefined();
  });
});
