import { describe, expect, it } from 'vitest';
import type { Role } from '@/lib/api';
import { can, sectionForPath, SECTION_BY_ROLE, type ConsoleAction } from '@/lib/rbac';

/**
 * Every ConsoleAction token. Typed as a Record so `tsc --noEmit` fails if a
 * token is added to (or removed from) the ConsoleAction union without this
 * list being updated — the runtime checks below then cover the new token.
 */
const TOKEN_MAP: Record<ConsoleAction, true> = {
  'user.ban': true,
  'user.suspend': true,
  'user.setRole': true,
  'venue.approve': true,
  'venue.transfer': true,
  'dispute.resolve': true,
  'dispute.reopen': true,
  'report.resolve': true,
  'report.reopen': true,
  'transaction.refund': true,
  'settlement.pay': true,
  'settlement.generate': true,
  'settings.edit': true,
  'match.cancel': true,
  'match.edit': true,
  'pitch.create': true,
  'pitch.edit': true,
  'pitch.transfer': true,
  'venue.create': true,
  'verification.submit': true,
};
const ALL_ACTIONS = Object.keys(TOKEN_MAP) as ConsoleAction[];
const ROLES: Role[] = ['Admin', 'VenueOwner', 'Player'];

describe('rbac parity', () => {
  it('every action token is granted to at least one role', () => {
    for (const action of ALL_ACTIONS) {
      const holders = ROLES.filter((r) => can(r, action));
      expect(holders.length, action).toBeGreaterThanOrEqual(1);
    }
  });

  it('a null role can do nothing', () => {
    for (const action of ALL_ACTIONS) expect(can(null, action), action).toBe(false);
  });

  it('VenueOwner lacks HQ money + moderation actions', () => {
    expect(can('VenueOwner', 'settlement.pay')).toBe(false);
    expect(can('VenueOwner', 'settlement.generate')).toBe(false);
    expect(can('VenueOwner', 'transaction.refund')).toBe(false);
    expect(can('VenueOwner', 'user.ban')).toBe(false);
  });

  it('Player has no actions and no sections', () => {
    for (const action of ALL_ACTIONS) expect(can('Player', action), action).toBe(false);
    expect(SECTION_BY_ROLE.Player).toEqual([]);
  });

  it('sectionForPath resolves exactly the 12 HQ sections (derived from SECTION_BY_ROLE)', () => {
    const hq = [
      'dashboard',
      'users',
      'matches',
      'venues',
      'pitches',
      'disputes',
      'reports',
      'reviews',
      'transactions',
      'settlements',
      'settings',
      'audit',
    ] as const;
    for (const s of hq) {
      expect(sectionForPath(`/${s}`), s).toBe(s);
      expect(sectionForPath(`/${s}/abc`), `${s}/abc`).toBe(s);
    }
    const derived = new Set(
      Object.values(SECTION_BY_ROLE)
        .flat()
        .filter((s) => !s.startsWith('partner.')),
    );
    expect([...derived].sort()).toEqual([...hq].sort());
  });

  it('partner and unknown paths keep their mapping', () => {
    expect(sectionForPath('/partner')).toBe('partner.dashboard');
    expect(sectionForPath('/partner/')).toBe('partner.dashboard');
    expect(sectionForPath('/partner/pitches')).toBe('partner.pitches');
    expect(sectionForPath('/partner/matches/123')).toBe('partner.matches');
    expect(sectionForPath('/nonsense')).toBeNull();
    expect(sectionForPath('/')).toBeNull();
    expect(sectionForPath('/login')).toBeNull();
  });
});
