import { MatchesService } from './matches.service';

/**
 * Underfill minimum rule (2026-08-29): the minimum total players (host
 * included) is always EVEN and two below the format capacity —
 * 5v5 (10) → 8, 7v7 (14) → 12, 11v11 (22) → 20. Floored at 2.
 */
describe('MatchesService.minPlayersFor', () => {
  it('maps the standard formats to the product-confirmed minimums', () => {
    expect(MatchesService.minPlayersFor(10)).toBe(8); // 5v5
    expect(MatchesService.minPlayersFor(14)).toBe(12); // 7v7
    expect(MatchesService.minPlayersFor(22)).toBe(20); // 11v11
  });

  it('is always even, even for odd capacities', () => {
    expect(MatchesService.minPlayersFor(11) % 2).toBe(0);
    expect(MatchesService.minPlayersFor(9) % 2).toBe(0);
  });

  it('floors at 2 so tiny formats still have a minimum', () => {
    expect(MatchesService.minPlayersFor(4)).toBe(2); // 2v2
    expect(MatchesService.minPlayersFor(2)).toBe(2);
  });
});
