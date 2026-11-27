const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const TOKEN_KEY = 'koralink_admin_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/**
 * Non-2xx API response. Still an Error (message unchanged for existing
 * `e.message` callers) but carries the HTTP status so a surface can map
 * failures to localized copy instead of rendering raw backend text.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Stable machine code from the API body (`{ message, code }`), if sent (P2-383). */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    // FormData bodies must NOT get a JSON Content-Type — the browser supplies
    // the multipart boundary header itself (P1-38 venue-photo uploads).
    ...(options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const writes = options.method != null && options.method !== 'GET';
  // P2-412: offline guard for WRITE submits — an offline POST/PATCH/PUT/DELETE
  // can never succeed, so reject it BEFORE fetch with a typed ApiError the
  // surfaces already classify. GET stays unguarded: reads degrade through the
  // normal classifier ('network' copy) and cached-browsing behavior is kept.
  if (
    writes &&
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    throw new ApiError(
      'You are offline. Reconnect to make changes.',
      0,
      'OFFLINE',
    );
  }

  // Abort a hung request after 30s so pages surface an error instead of
  // spinning forever (P2-24). The timeout is cleared once headers arrive;
  // body reads share the same controller via the signal.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  // Link the caller's signal with our timeout controller so passing
  // options.signal no longer disables the 30s guard (run #15 Reviewer A:
  // `signal: options.signal ?? controller.signal` let a caller-supplied
  // signal hang forever). AbortSignal.any is Node 20.3+/evergreen browsers;
  // if unavailable, degrade to the old precedence (caller signal wins).
  const signal =
    options.signal != null && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, controller.signal])
      : (options.signal ?? controller.signal);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      // A caller-initiated abort is a cancellation, not a timeout —
      // rethrow it untouched so the caller's own handling sees it.
      if (options.signal?.aborted) throw err;
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw err;
  }
  clearTimeout(timer);

  // 401 = session invalid/expired → clear token and bounce to /login.
  // 403 = authenticated but not permitted (role downgraded, partner-only
  // action) → surface the error; killing the whole session here logged
  // admins out on any single forbidden response (run #9 reviewer).
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      clearToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new ApiError('Unauthorized', 401);
  }

  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    throw new ApiError(
      body.message ?? 'You do not have permission to perform this action.',
      403,
      // P2-413: carry the machine code here too — 401 and other statuses
      // already do, and classifyApiError's code-first branch needs it.
      typeof body.code === 'string' ? body.code : undefined,
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    throw new ApiError(
      body.message ?? `Request failed (${res.status})`,
      res.status,
      typeof body.code === 'string' ? body.code : undefined,
    );
  }

  // 204 / empty body → resolve undefined instead of throwing SyntaxError
  // on res.json() (P2-24: DELETE flows survive today only because Nest
  // happens to always return bodies — that contract is not guaranteed).
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Non-JSON success body (proxy/banner injection) — don't crash the UI.
    return undefined as T;
  }
}

export const api = {
  get: <T>(path: string, options?: { signal?: AbortSignal }) => apiFetch<T>(path, options),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  /**
   * Multipart upload (P1-38 venue photos). FormData must reach fetch UNSTRINGIFIED —
   * the browser sets the multipart boundary Content-Type itself.
   */
  upload: <T>(path: string, form: FormData) =>
    apiFetch<T>(path, { method: 'POST', body: form }),
};

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export type Role = 'Player' | 'VenueOwner' | 'Admin';

/** Reads the signed `role` claim from the stored JWT (no extra network call). */
export function getRole(): Role | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwt(token);
  const role = payload?.role;
  return role === 'VenueOwner' || role === 'Admin' || role === 'Player' ? role : null;
}

/** Where to send a freshly-authenticated user based on their role. */
export function defaultRoute(): string {
  return getRole() === 'VenueOwner' ? '/partner' : '/dashboard';
}

export type ApiErrorBucket =
  | 'conflict'
  | 'validation'
  | 'auth'
  | 'notFound'
  | 'rate'
  | 'server'
  | 'network'
  | 'offline'
  | 'generic';

/**
 * Stable backend codes that mean "this change conflicts with current state"
 * (optimistic-locking / already-done class): the remedy is a REFRESH, so they
 * route to the state-race copy. Code-first so a known conflict can never be
 * misfiled as payload validation (P2-413).
 */
const CONFLICT_CODES = new Set([
  'DISPUTE_ALREADY_DECIDED',
  'DISPUTE_NOT_DECIDED',
]);

/**
 * Stable backend codes that mean "a value you submitted collides with an
 * existing one" (PR-Agent r1 on PR #306: EMAIL_TAKEN under the state-race
 * copy told admins to refresh — refreshing cannot free a taken email; the
 * remedy is CHANGE THE INPUT, so these route to the validation copy).
 * Unknown codes stay with their status bucket (fail-safe for future codes).
 */
const DUPLICATE_VALUE_CODES = new Set([
  'EMAIL_TAKEN',
]);

function statusOf(e: unknown): number | null {
  if (e instanceof ApiError) return e.status;
  if (typeof e === 'object' && e !== null && 'status' in e) {
    const s = (e as { status: unknown }).status;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  return null;
}

/** Classify a thrown value into a localized-copy bucket (never inspects message text for output). */
export function classifyApiError(e: unknown): ApiErrorBucket {
  // Code-first: a stable backend code beats any status heuristic (P2-283
  // plumbing; the dispute fork proved the need, run #234 MINOR-2).
  const code = e instanceof ApiError ? e.code : undefined;
  if (code) {
    // P2-412: the client-side offline guard stamps code 'OFFLINE' + status 0 —
    // proactive rejection BEFORE fetch, distinct remedy copy ("reconnect").
    if (code === 'OFFLINE') return 'offline';
    if (CONFLICT_CODES.has(code)) return 'conflict';
    if (DUPLICATE_VALUE_CODES.has(code)) return 'validation';
  }

  const status = statusOf(e);
  if (status !== null) {
    // Status 0 without the OFFLINE code = a no-response failure of unknown
    // origin — 'network' is the fail-safe bucket (run #236 decision 3).
    if (status === 0) return 'network';
    if (status === 409) return 'conflict';
    // 400/422 = the PAYLOAD is the problem ("check your entries"), distinct
    // from 409 = state raced underneath you ("refresh the page") — a bare
    // 400 no longer lands in the refresh-loop copy (run #234 MINOR-2).
    if (status === 400 || status === 422) return 'validation';
    if (status === 401 || status === 403) return 'auth';
    if (status === 404) return 'notFound';
    if (status === 429) return 'rate';
    if (status >= 500 && status <= 599) return 'server';
    return 'generic';
  }
  // fetch() rejects with a TypeError when the network is unreachable / CORS
  // fails — those rejections carry stable BROWSER-ENGINE messages ("Failed to
  // fetch" Chromium, "Load failed" Safari, "NetworkError when attempting to
  // fetch resource" Firefox), so matching them is not the brittle backend-copy
  // class. A TypeError thrown by a CLIENT bug (property of undefined, etc.)
  // falls through to 'generic', which gets the dev-only diagnostics warn.
  if (
    e instanceof TypeError &&
    /failed to fetch|load failed|networkerror/i.test(e.message ?? '')
  ) {
    return 'network';
  }
  return 'generic';
}

/**
 * Map any thrown value to localized, user-facing copy (error-message standard:
 * what happened + why + what to do next, EN+AR). NEVER returns raw backend
 * text. `t` must be the ROOT translator (`useTranslations()`), since keys are
 * resolved as `errors.<bucket>`. `fallbackKey` (a full root-relative key, e.g.
 * 'slotManager.generationFailed') replaces `errors.generic` so a surface keeps
 * its more specific copy when the failure can't be classified.
 */
export function apiErrorToMessage(
  e: unknown,
  t: (key: string) => string,
  fallbackKey?: string,
): string {
  const bucket = classifyApiError(e);
  // Diagnostics aid (PR-Agent r1 MINOR, PR #299): an unclassified error kept its
  // message only in memory before; log it once so client bugs inside migrated
  // try blocks stay diagnosable without ever surfacing raw text to the user.
  if (bucket === 'generic' && process.env.NODE_ENV !== 'production') {
    console.warn('[admin] unclassified error (shown as generic copy):', e);
  }
  if (bucket === 'generic' && fallbackKey) return t(fallbackKey);
  return t(`errors.${bucket}`);
}
