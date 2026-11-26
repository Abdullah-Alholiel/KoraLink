import { getRole, type Role } from '@/lib/api';

/**
 * Central RBAC for the ops console.
 *
 * One source of truth for what each role may see and do. The sidebar, the
 * route guard, and per-page capability checks all read from here so a
 * permission change is a one-file edit.
 */

export type ConsoleSection =
  | 'dashboard'
  | 'users'
  | 'matches'
  | 'venues'
  | 'pitches'
  | 'disputes'
  | 'reports'
  | 'reviews'
  | 'transactions'
  | 'settlements'
  | 'settings'
  | 'audit'
  | 'partner.dashboard'
  | 'partner.venues'
  | 'partner.pitches'
  | 'partner.matches'
  | 'partner.earnings'
  | 'partner.settings';

/** Sections each role can reach at all (sidebar + routing). */
export const SECTION_BY_ROLE: Record<Role, ConsoleSection[]> = {
  Admin: [
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
    // HQ only — admins manage pitches/venues through the HQ tabs (pitches,
    // venues) and the /admin/* API. The partner portal is the VenueOwner's
    // surface; showing its tabs to admins was removed (Abdullah, 2026-08-31).
  ],
  VenueOwner: [
    'partner.dashboard',
    'partner.venues',
    'partner.pitches',
    'partner.matches',
    'partner.earnings',
    'partner.settings',
  ],
  Player: [],
};

/**
 * HQ (non-partner) sections, derived from SECTION_BY_ROLE so the section list
 * has a single source (P2-400e). Partner paths are mapped separately below.
 */
const KNOWN_SECTIONS: ConsoleSection[] = [
  ...new Set(Object.values(SECTION_BY_ROLE).flat().filter((s) => !s.startsWith('partner.'))),
];

/** Partner sections, derived from SECTION_BY_ROLE (P2-414: single source). */
const KNOWN_PARTNER_SECTIONS: ConsoleSection[] = [
  ...new Set(Object.values(SECTION_BY_ROLE).flat().filter((s) => s.startsWith('partner.'))),
];

/**
 * Sentinel returned for paths that map to NO known console section (e.g.
 * /partner/bogus). Deliberately NEVER listed in SECTION_BY_ROLE, so
 * canAccessPath denies it for every role — a bogus partner path must NOT
 * fall into the `null = outside console (login etc.)` ALLOW lane.
 * (P2-414: the partner branch used to return the raw `partner.${sub}` cast
 * for arbitrary input; the type lied and denial was only an accident of the
 * invalid key missing every role list.)
 */
export const UNKNOWN_SECTION = '__unknown__' as ConsoleSection;

/** Map a pathname to its console section (null = outside the console). */
export function sectionForPath(pathname: string): ConsoleSection | null {
  if (pathname.startsWith('/partner')) {
    const sub = pathname.replace(/^\/partner\/?/, '').split('/')[0];
    if (!sub) return 'partner.dashboard';
    const key = `partner.${sub}` as ConsoleSection;
    return KNOWN_PARTNER_SECTIONS.includes(key) ? key : UNKNOWN_SECTION;
  }
  const seg = pathname.replace(/^\//, '').split('/')[0];
  if (!seg) return null;
  return KNOWN_SECTIONS.includes(seg as ConsoleSection) ? (seg as ConsoleSection) : null;
}

/** Where a role lands after login. */
export function homeForRole(role: Role): string {
  return role === 'Admin' ? '/dashboard' : '/partner';
}

/**
 * Fine-grained actions. Coarser than per-endpoint ACLs on purpose: the API
 * remains the security boundary (guards reject cross-role calls); these flags
 * drive UI affordances so users never see a button that will 403.
 */
export type ConsoleAction =
  | 'user.ban'
  | 'user.suspend'
  | 'user.setRole'
  | 'venue.approve'
  | 'venue.transfer'
  | 'dispute.resolve'
  | 'dispute.reopen'
  | 'report.resolve'
  | 'report.reopen'
  | 'transaction.refund'
  | 'settlement.pay'
  | 'settlement.generate'
  | 'settings.edit'
  | 'match.cancel'
  | 'match.edit'
  | 'pitch.create'
  | 'pitch.edit'
  | 'pitch.transfer'
  | 'venue.create'
  | 'verification.submit'
  | 'review.moderate';

const ACTIONS_BY_ROLE: Record<Role, ConsoleAction[]> = {
  Admin: [
    'user.ban',
    'user.suspend',
    'user.setRole',
    'venue.approve',
    'venue.transfer',
    'dispute.resolve',
    'dispute.reopen',
    'report.resolve',
    'report.reopen',
    'transaction.refund',
    'settlement.pay',
    'settlement.generate',
    'settings.edit',
    'match.cancel',
    'match.edit',
    'pitch.create',
    'pitch.edit',
    'pitch.transfer',
    'venue.create',
    'review.moderate',
  ],
  VenueOwner: [
    'pitch.create',
    'pitch.edit',
    'venue.create',
    'verification.submit',
  ],
  Player: [],
};

export function can(role: Role | null, action: ConsoleAction): boolean {
  if (!role) return false;
  return ACTIONS_BY_ROLE[role].includes(action);
}

/** Can the current role open this path at all? */
export function canAccessPath(role: Role | null, pathname: string): boolean {
  if (!role) return false;
  const section = sectionForPath(pathname);
  if (!section) return true; // login etc.
  return SECTION_BY_ROLE[role].includes(section);
}

export { getRole };
