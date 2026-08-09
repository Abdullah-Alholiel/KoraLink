import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

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
 * 2. The `Authorization: Bearer <token>` header (cross-origin dev via
 *    Tailscale, where SameSite=Lax cookies are not forwarded).
 */
@Injectable()
export class JwtCookieStrategy extends PassportStrategy(Strategy, 'jwt-cookie') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Authorization: Bearer header (cross-origin / dev)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // 2. access_token cookie (same-origin)
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'fallback-dev-secret'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
