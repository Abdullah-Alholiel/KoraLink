/**
 * P0-3 — Bootstrap secret validation.
 *
 * The API signs every access token (HS256) with `JWT_SECRET` and every session
 * cookie with `COOKIE_SECRET`. If those are placeholders (the `.env.example`
 * defaults, or a literal `change-me`), anyone who can reach the API can forge an
 * `{ sub, phone, role: 'Admin' }` JWT and take over the admin console. This guard
 * makes that state impossible to reach silently: `bootstrap()` calls
 * `assertBootstrapSecrets()` before `app.listen`, so a misconfigured `.env`
 * fails fast with a clear message instead of serving traffic.
 *
 * Rules:
 *  - missing/empty/placeholder secret  → always throw (any environment).
 *  - present but < 32 chars            → throw in production; tolerated in dev.
 */

export const PLACEHOLDER_MARKERS = [
  'change-me',
  'change_me',
  'changeme',
  'fallback-dev-secret',
  'your-secret',
  'replace-me',
  'placeholder',
] as const;

/** A secret is a placeholder when it is absent or matches a known placeholder marker. */
export function isPlaceholderSecret(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const v = value.trim().toLowerCase();
  if (v.length === 0) return true;
  if (v === 'secret') return true;
  return PLACEHOLDER_MARKERS.some((marker) => v.includes(marker));
}

export interface BootstrapSecretCheck {
  jwtSecret?: string;
  cookieSecret?: string;
  nodeEnv?: string;
}

/**
 * Throws if auth secrets are insecure. Called at the top of `bootstrap()`.
 */
export function assertBootstrapSecrets(check: BootstrapSecretCheck): void {
  const nodeEnv = (check.nodeEnv ?? 'development').trim();
  const isProd = nodeEnv === 'production';

  const problems: string[] = [];

  const validate = (name: string, value: string | undefined): void => {
    if (isPlaceholderSecret(value)) {
      problems.push(`${name} is missing or a placeholder`);
      return;
    }
    if (isProd && (value as string).trim().length < 32) {
      problems.push(`${name} is ${(value as string).trim().length} chars (need >= 32 in production)`);
    }
  };

  validate('JWT_SECRET', check.jwtSecret);
  validate('COOKIE_SECRET', check.cookieSecret);

  if (problems.length > 0) {
    throw new Error(
      `[security] Refusing to boot with insecure auth secrets: ${problems.join('; ')}. ` +
        `Generate real values with \`openssl rand -hex 32\` and set them in apps/api/.env.`,
    );
  }
}
