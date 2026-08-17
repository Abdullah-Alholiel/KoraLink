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
      secretOrKey: config.get<string>('JWT_SECRET', 'fallback-dev-secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // A JWT can outlive its user: an account may be deleted, or a dev DB may be
    // re-seeded (fresh UUIDs). A stale `sub` would otherwise pass auth and then
    // fail downstream foreign keys (e.g. transactions.user_id in createMatch)
    // as an opaque 500. Reject it here with a clean 401 instead.
    const [user] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Account no longer exists.');
    }

    return payload;
  }
}
