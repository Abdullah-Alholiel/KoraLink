import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtCookieAuthGuard } from './jwt-cookie-auth.guard';

/**
 * Convenience guard for admin-only routes. Extends the cookie/bearer JWT guard
 * (so `req.user` is populated) then rejects any caller whose JWT `role` claim
 * is not `Admin`.
 *
 * The `role` claim is already signed into the token by `AuthService.verifyOtp`
 * (`{ sub, phone, role }`), so no DB lookup is required here.
 */
@Injectable()
export class AdminAuthGuard extends JwtCookieAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;

    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role !== 'Admin') {
      throw new ForbiddenException('Admin access required.');
    }
    return true;
  }
}
