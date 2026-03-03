import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Reads the `access_token` HttpOnly cookie and validates it via the
 * `jwt-cookie` Passport strategy.
 *
 * Usage: `@UseGuards(JwtCookieAuthGuard)` on controllers / routes.
 */
@Injectable()
export class JwtCookieAuthGuard extends AuthGuard('jwt-cookie') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Invalid or missing session cookie.');
    }
    return user;
  }
}
