import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: string;
  iat?: number;
  exp?: number;
  /**
   * P0-6 (run #29): if `'restore'`, the JWT was issued for the PDPL restore
   * flow and the strategy lets it through even when the user is soft-deleted
   * (otherwise the deleted user could never call /users/me/restore).
   * All other tokens (regular session, dev-login) leave this unset / `undefined`.
   */
  purpose?: 'restore' | undefined;
}

/** The request-side user shape guards consume (`req.user`). */
export interface AuthenticatedUser extends JwtPayload {
  /** Role as it is RIGHT NOW in the DB — overrides the stale token claim. */
  role: string;
}

/**
 * Passport strategy that extracts the JWT from either:
 * 1. The `access_token` HttpOnly cookie (same-origin production), OR
 * 2. The `Authorization: Bearer *** header (cross-origin dev via
 *    Tailscale, where SameSite=Lax cookies are not forwarded).
 */
@Injectable()
export class JwtCookieStrategy extends PassportStrategy(Strategy, 'jwt-cookie') {
  constructor(
    config: ConfigService,
    @Inject('DB_CONNECTION') private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Authorization: Bearer *** (cross-origin / dev)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // 2. access_token cookie (same-origin)
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // A JWT can outlive its user: an account may be deleted, or a dev DB may be
    // re-seeded (fresh UUIDs). A stale `sub` would otherwise pass auth and then
    // fail downstream foreign keys (e.g. transactions.user_id in createMatch)
    // as an opaque 500. Reject it here with a clean 401 instead.
    const [user] = await this.db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        banned_at: schema.users.banned_at,
        suspended_until: schema.users.suspended_until,
        // P0-6 (run #29): PDPL soft-delete. A deleted user must NOT be
        // able to use a still-valid JWT — EXCEPT for a one-time restore
        // token (purpose === 'restore') issued at delete time, which the
        // PWA uses to call POST /users/me/restore. After restore,
        // deleted_at is NULL and normal flow resumes.
        deleted_at: schema.users.deleted_at,
      })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Account no longer exists.');
    }

    // A JWT can outlive an admin moderation action. Ban/suspend must take
    // effect immediately (not at token expiry) — reject the session here so
    // every guarded endpoint 401s and the client logs the user out.
    if (user.banned_at) {
      throw new UnauthorizedException('Account banned.');
    }
    if (user.suspended_until && user.suspended_until.getTime() > Date.now()) {
      throw new UnauthorizedException('Account suspended.');
    }
    // P0-6 (run #29): deleted users cannot use a still-valid JWT — UNLESS
    // the JWT's `purpose` claim is `restore` (set by UsersService.softDelete
    // when it issues the restore token). The restore flow is the ONLY
    // path that bypasses this gate; the moment the user calls
    // /users/me/restore and we null deleted_at, the next regular call
    // passes normally.
    if (user.deleted_at && payload.purpose !== 'restore') {
      throw new UnauthorizedException('Account scheduled for deletion.');
    }

    // Role changes (promotion/demotion) must also apply immediately — the
    // token's role claim can be up to 7 days stale. Guards read req.user.role,
    // so returning the DB role makes an admin demotion revoke /admin access
    // on the very next request without waiting for re-login.
    return { ...payload, role: user.role };
  }
}
