import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});

/** Role values stored in the HttpOnly `role` cookie set by the NestJS backend. */
type UserRole = 'ADMIN' | 'VENUE_OWNER';

/**
 * Read the user role from the HttpOnly cookie issued by the NestJS backend.
 * Returns null when the cookie is absent (unauthenticated).
 */
function getRoleFromCookie(request: NextRequest): UserRole | null {
  const role = request.cookies.get('role')?.value;
  if (role === 'ADMIN' || role === 'VENUE_OWNER') {
    return role;
  }
  return null;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip the locale prefix to get the bare path for role checks.
  // e.g. /ar/admin/dashboard -> /admin/dashboard
  const pathnameWithoutLocale = pathname.replace(/^\/(ar|en)/, '');

  const isAdminRoute = pathnameWithoutLocale.startsWith('/admin');
  const isPartnerRoute = pathnameWithoutLocale.startsWith('/partner');

  if (isAdminRoute || isPartnerRoute) {
    const role = getRoleFromCookie(request);

    // Redirect unauthenticated users to the login page.
    if (!role) {
      const loginUrl = new URL(
        `/${request.nextUrl.pathname.split('/')[1]}/login`,
        request.url
      );
      return NextResponse.redirect(loginUrl);
    }

    // Block VENUE_OWNER from /admin/* routes.
    if (isAdminRoute && role === 'VENUE_OWNER') {
      const partnerUrl = new URL(
        `/${request.nextUrl.pathname.split('/')[1]}/partner`,
        request.url
      );
      return NextResponse.redirect(partnerUrl);
    }

    // Block ADMIN from /partner/* routes.
    if (isPartnerRoute && role === 'ADMIN') {
      const adminUrl = new URL(
        `/${request.nextUrl.pathname.split('/')[1]}/admin`,
        request.url
      );
      return NextResponse.redirect(adminUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
};
