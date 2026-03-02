import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const intlMiddleware = createMiddleware({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});

/** Role values embedded in the JWT issued by the NestJS backend. */
type UserRole = 'ADMIN' | 'VENUE_OWNER';

/**
 * Verified JWT payload shape — must match the NestJS AuthModule JWT payload.
 * We only require `role`; other claims (sub, iat, exp) are validated by jose.
 */
interface JwtPayload {
  role?: UserRole;
  sub?: string;
}

/**
 * Verify the HttpOnly `access_token` JWT issued by the NestJS backend and
 * return the user's role from the payload.
 *
 * Returns null when:
 *   - The cookie is absent (unauthenticated)
 *   - The signature is invalid (tampered token)
 *   - The token is expired
 */
async function verifyRoleFromJwt(
  request: NextRequest
): Promise<UserRole | null> {
  const token = request.cookies.get('access_token')?.value;
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify<JwtPayload>(
      token,
      new TextEncoder().encode(secret)
    );
    const role = payload.role;
    if (role === 'ADMIN' || role === 'VENUE_OWNER') return role;
    return null;
  } catch {
    // Token is invalid, expired, or tampered — treat as unauthenticated.
    return null;
  }
}

/**
 * Build the per-request Content-Security-Policy header.
 *
 * Uses `'nonce-{nonce}'` + `'strict-dynamic'` for script-src so that only
 * scripts tagged with the matching nonce are executed — eliminating the
 * XSS risk of `'unsafe-inline'`.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' allows nonce-whitelisted scripts to load further scripts
    // dynamically (required for Next.js's runtime chunk loading).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Style-src keeps 'unsafe-inline' because Tailwind CSS and CSS-in-JS
    // libraries emit inline <style> blocks that cannot easily use nonces.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://storage.koralink.sa",
    `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? 'https://api.koralink.sa'}`,
    "font-src 'self' data:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Nonce generation ─────────────────────────────────────────────────────
  // Use getRandomValues for a cryptographically secure 16-byte nonce.
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Buffer.from(nonceBytes).toString('base64');

  // Forward the nonce to Server Components via the `x-nonce` request header.
  // The root layout reads this via `next/headers` to inject it into <Script>.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // ── Role-Based Access Control ─────────────────────────────────────────────
  // Strip the locale prefix to get the bare path, e.g. /ar/admin -> /admin
  const pathnameWithoutLocale = pathname.replace(/^\/(ar|en)/, '');
  const isAdminRoute = pathnameWithoutLocale.startsWith('/admin');
  const isPartnerRoute = pathnameWithoutLocale.startsWith('/partner');

  const locale = request.nextUrl.pathname.split('/')[1] ?? 'ar';

  if (isAdminRoute || isPartnerRoute) {
    const role = await verifyRoleFromJwt(request);

    // Redirect unauthenticated users to the login page.
    if (!role) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }

    // Block VENUE_OWNER from /admin/* routes.
    if (isAdminRoute && role === 'VENUE_OWNER') {
      return NextResponse.redirect(new URL(`/${locale}/partner`, request.url));
    }

    // Block ADMIN from /partner/* routes.
    if (isPartnerRoute && role === 'ADMIN') {
      return NextResponse.redirect(new URL(`/${locale}/admin`, request.url));
    }
  }

  // ── Compose response with nonce CSP ──────────────────────────────────────
  // Pass the updated request headers (containing x-nonce) to intlMiddleware
  // so next-intl receives the same enriched request that Server Components see.
  const enrichedRequest = new NextRequest(request.url, {
    headers: requestHeaders,
    method: request.method,
  });
  const intlResponse = intlMiddleware(enrichedRequest);

  // intlMiddleware always returns a Response (redirect, rewrite, or next).
  // We attach the CSP to whatever it returns — preserving its routing logic.
  const response = intlResponse instanceof Response
    ? intlResponse
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
};
