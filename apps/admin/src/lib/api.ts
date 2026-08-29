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

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

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
    throw new Error('Unauthorized');
  }

  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      body.message ?? 'You do not have permission to perform this action.',
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
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
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
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
