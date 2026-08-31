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

    // Role changes (promotion/demotion) must also apply immediately — the
    // token's role claim can be up to 7 days stale. Guards read req.user.role,
    // so returning the DB role makes an admin demotion revoke /admin access
    // on the very next request without waiting for re-login.
    return { ...payload, role: user.role };
  }
}
