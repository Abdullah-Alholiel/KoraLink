/**
 * Resolves the TRUST_PROXY env var into the Express `app.set('trust proxy', …)` value.
 *
 * Audit run-1 fix (api-auth:per-ip-cap-proxy-trust, factory run #105): without trust
 * proxy, Express reports the INGRESS proxy's address as req.ip, so the per-IP OTP caps
 * (50/day per-IP daily cap + the 3/min send-otp route throttle) collapse into ONE
 * shared bucket behind the proxy, and every admin audit log records the proxy IP
 * instead of the actor's address. Setting TRUST_PROXY makes req.ip the real client
 * address as reported by the trusted proxy chain.
 *
 * Supported values (boot-fails on anything else — P0-3 refuse-to-boot doctrine):
 *   unset / ''    → false               (trust no proxy; req.ip = socket address —
 *                                        byte-compatible with all prior deploys)
 *   positive int  → trust N proxy hops  (1 = single ingress: Render edge, Traefik)
 *   'true'        → trust the whole X-Forwarded-For chain (safe when the ingress
 *                    OVERWRITES XFF — both our ingress points do; direct-to-port
 *                    spoofing is out of threat model: the API binds localhost behind
 *                    the proxy on the VPS and Render's edge owns the port in prod)
 *
 * Express keyword forms ('loopback' / 'unip' / 'bin' / 'linklocal') and IP/CIDR
 * comma lists are deliberately NOT accepted: their semantics silently vary per
 * deployment and are easy to get wrong; a hop count states the same intent
 * unambiguously.
 */
export function resolveTrustProxyConfig(raw: string | undefined): false | number | 'true' {
  if (raw === undefined) return false;
  const value = raw.trim();
  if (value === '') return false;

  // Positive integers only: no sign, no leading zeros, no decimals. '0' is
  // rejected (it means trust-none but reads like a misconfigured hop count —
  // unset the var instead so the intent is explicit).
  if (/^[1-9]\d*$/.test(value)) return parseInt(value, 10);

  if (value.toLowerCase() === 'true') return 'true';

  throw new Error(
    `Invalid TRUST_PROXY=${raw} — supported values: unset/empty (trust no proxy), ` +
      "a positive hop count (e.g. 1), or 'true' (trust the full X-Forwarded-For chain).",
  );
}
