import { offlineFetch } from './offline';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'jmsurf.token';
const FACILITY_KEY = 'jmsurf.facility';

/** List envelope. `clientSide` is set when the endpoint returned a bare array (no server paging/search). */
export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number; clientSide?: boolean }

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message); }
}

const REFRESH_KEY = 'jmsurf.refresh';
export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  getRefresh: () => (typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY)),
  setRefresh: (t: string | null | undefined) => (t ? localStorage.setItem(REFRESH_KEY, t) : localStorage.removeItem(REFRESH_KEY)),
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); },
};

/** Single-flight refresh: concurrent 401s share one /auth/refresh call. Rotates both tokens. */
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  const rt = tokenStore.getRefresh();
  if (!rt) return Promise.resolve(false);
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) })
    .then(async (r) => {
      if (!r.ok) return false;
      const b = await r.json();
      tokenStore.set(b.accessToken); tokenStore.setRefresh(b.refreshToken);
      return true;
    })
    .catch(() => false)
    .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}
export const facilityStore = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(FACILITY_KEY)),
  set: (id: string) => localStorage.setItem(FACILITY_KEY, id),
};

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Query): string {
  if (!params) return '';
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit & { query?: Query; _retried?: boolean } = {}): Promise<T> {
  const { query, _retried, ...rest } = init;
  const headers = new Headers(rest.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const fac = facilityStore.get();
  if (fac) headers.set('X-Facility-Id', fac);
  if (rest.body && !(rest.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await offlineFetch(`${path}${qs(query)}`, `${API_URL}${path}${qs(query)}`, { ...rest, headers });
  if (res.status === 401 && typeof window !== 'undefined' && !_retried && !path.startsWith('/auth/') && (await refreshSession())) {
    return apiFetch<T>(path, { ...init, _retried: true });
  }
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login') && !path.startsWith('/auth/mfa') && !path.startsWith('/auth/change-password')) {
    tokenStore.clear();
    if (!window.location.pathname.startsWith('/login')) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(401, 'Session expired');
  }
  const text = await res.text();
  let body: unknown = undefined;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (!res.ok) {
    const msg = (body as { message?: string | string[] })?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg || res.statusText, body);
  }
  return body as T;
}

export const api = {
  get: <T = unknown>(p: string, query?: Query) => apiFetch<T>(p, { query }),
  post: <T = unknown>(p: string, body?: unknown) => apiFetch<T>(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T = unknown>(p: string, body?: unknown) => apiFetch<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T = unknown>(p: string, body?: unknown) => apiFetch<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T = unknown>(p: string) => apiFetch<T>(p, { method: 'DELETE' }),
};

export async function downloadCsv(path: string, query: Query, filename: string) {
  const res = await fetch(`${API_URL}${path}${qs({ ...query, format: 'csv' })}`, { headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` } });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
