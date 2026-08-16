import { SetMetadata } from '@nestjs/common';

/** Role union — mirrors the `UserRole` Postgres enum in `database/schema.ts`. */
export type Role = 'Player' | 'VenueOwner' | 'Admin';

export const ROLES_KEY = 'roles';

/**
 * Attaches a list of allowed roles to a route/controller. Consumed by
 * `RolesGuard` (which must run AFTER `JwtCookieAuthGuard` so `req.user`
 * is populated by Passport).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
