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
  | 'disputes'
  | 'reports'
  | 'transactions'
  | 'settlements'
  | 'settings'
  | 'audit'
  | 'partner.dashboard'
  | 'partner.venues'
  | 'partner.pitches'
  | 'partner.earnings'
  | 'partner.settings';

/** Sections each role can reach at all (sidebar + routing). */
export const SECTION_BY_ROLE: Record<Role, ConsoleSection[]> = {
  Admin: [
    'dashboard',
    'users',
    'matches',
    'venues',
    'disputes',
    'reports',
    'transactions',
    'settlements',
    'settings',
    'audit',
    // Admins may also inspect the partner portal (read + manage) — useful
    // for supporting venue owners without a screen-share.
    'partner.dashboard',
    'partner.venues',
    'partner.pitches',
    'partner.earnings',
    'partner.settings',
  ],
  VenueOwner: [
    'partner.dashboard',
    'partner.venues',
    'partner.pitches',
    'partner.earnings',
    'partner.settings',
  ],
  Player: [],
};

/** Map a pathname to its console section (null = outside the console). */
export function sectionForPath(pathname: string): ConsoleSection | null {
  if (pathname.startsWith('/partner')) {
    const sub = pathname.replace(/^\/partner\/?/, '').split('/')[0];
    if (!sub) return 'partner.dashboard';
    const key = `partner.${sub}` as ConsoleSection;
    return key;
  }
  const seg = pathname.replace(/^\//, '').split('/')[0];
  if (!seg) return null;
  const known: ConsoleSection[] = [
    'dashboard',
    'users',
    'matches',
    'venues',
    'disputes',
    'reports',
    'transactions',
    'settlements',
    'settings',
    'audit',
  ];
  return known.includes(seg as ConsoleSection) ? (seg as ConsoleSection) : null;
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
  | 'dispute.resolve'
  | 'report.resolve'
  | 'transaction.refund'
  | 'settlement.pay'
  | 'settlement.generate'
  | 'settings.edit'
  | 'match.cancel'
  | 'pitch.create'
  | 'pitch.edit'
  | 'venue.create'
  | 'verification.submit';

const ACTIONS_BY_ROLE: Record<Role, ConsoleAction[]> = {
  Admin: [
    'user.ban',
    'user.suspend',
    'user.setRole',
    'venue.approve',
    'dispute.resolve',
    'report.resolve',
    'transaction.refund',
    'settlement.pay',
    'settlement.generate',
    'settings.edit',
    'match.cancel',
    'pitch.create',
    'pitch.edit',
    'venue.create',
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
