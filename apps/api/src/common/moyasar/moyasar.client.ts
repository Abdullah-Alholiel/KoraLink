/**
 * Minimal Moyasar REST client (P0-2 sandbox slice, run #169).
 *
 * Scope: ONLY the server legs of the hosted-form flow — fetch a payment for
 * verification. Card data NEVER flows through this server (the browser-hosted
 * form tokenizes directly against api.moyasar.com); a server-side card-field
 * create is deliberately NOT implemented (the Moyasar API rejects card-less
 * server creates anyway — probed live 2026-10-27, 400 source.* missing).
 *
 * Secret key handling: never logged, never returned; rides only in the Basic
 * auth header. Keys resolve with a canonical-name-first fallback so go-live is
 * an env flip (set MOYASAR_SECRET_KEY on Render), not a code change:
 *   MOYASAR_SECRET_KEY ?? MOYASAR_SECRET_KEY_TEST
 *   MOYASAR_PUBLISHABLE_KEY ?? MOYASAR_PUBLISHABLE_KEY_TEST
 */

export const MOYASAR_API_BASE = 'https://api.moyasar.com/v1';

export interface MoyasarPayment {
  id: string;
  status: string;
  /** Smallest currency unit (halalas for SAR). */
  amount: number;
  currency: string;
  /** Echoed create-time description — the app binds payments to intents via `wallet-topup:<intentId>`. */
  description?: string | null;
  source?: {
    type?: string;
    company?: string;
    message?: string | null;
  } | null;
  source_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Non-2xx from the Moyasar API — carries the HTTP status for mapping. */
export class MoyasarHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MoyasarHttpError';
  }
}

/**
 * Fetches a payment record from Moyasar with the secret key (Basic auth).
 * This is the verify step's ONLY source of truth — client redirects and
 * on_completed callbacks are hints, never authority.
 *
 * A browser-shaped User-Agent is sent on every call: Cloudflare fronts
 * api.moyasar.com and 403s (error 1010) default client UAs on some legs
 * (verified on the sandbox — see koralink-factory-loop references/psp-moyasar.md).
 */
export async function fetchMoyasarPayment(
  secretKey: string,
  paymentId: string,
): Promise<MoyasarPayment> {
  const res = await fetch(
    `${MOYASAR_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    },
  );
  if (!res.ok) {
    throw new MoyasarHttpError(
      res.status,
      `Moyasar payment fetch failed (HTTP ${res.status})`,
    );
  }
  return (await res.json()) as MoyasarPayment;
}

/** Resolves the verification secret key (canonical env name first). */
export function resolveMoyasarSecretKey(get: (key: string) => string | undefined): string | null {
  return get('MOYASAR_SECRET_KEY') ?? get('MOYASAR_SECRET_KEY_TEST') ?? null;
}

/** Resolves the publishable (client-form) key (canonical env name first). */
export function resolveMoyasarPublishableKey(get: (key: string) => string | undefined): string | null {
  return (
    get('MOYASAR_PUBLISHABLE_KEY') ??
    get('MOYASAR_PUBLISHABLE_KEY_TEST') ??
    null
  );
}
