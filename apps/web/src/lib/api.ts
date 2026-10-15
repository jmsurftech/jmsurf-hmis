export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'jmsurf.token';
const FACILITY_KEY = 'jmsurf.facility';

export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number }

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message); }
}

export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};
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

export async function apiFetch<T = unknown>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const { query, ...rest } = init;
  const headers = new Headers(rest.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const fac = facilityStore.get();
  if (fac) headers.set('X-Facility-Id', fac);
  if (rest.body && !(rest.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}${path}${qs(query)}`, { ...rest, headers });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
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
