'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, ApiError, qs } from './api';

/** Patient-portal session: kept separate from the staff token. */
const TOKEN = 'jmsurf.portal.token';
const TENANT = 'jmsurf.portal.tenant';
const SUBJECT = 'jmsurf.portal.subject';
const get = (k: string) => (typeof window === 'undefined' ? null : localStorage.getItem(k));
export const portalStore = {
  token: () => get(TOKEN), tenant: () => get(TENANT), subject: () => get(SUBJECT),
  set: (token: string, tenant: string) => { localStorage.setItem(TOKEN, token); localStorage.setItem(TENANT, tenant); },
  setSubject: (id: string | null) => (id ? localStorage.setItem(SUBJECT, id) : localStorage.removeItem(SUBJECT)),
  clear: () => { localStorage.removeItem(TOKEN); localStorage.removeItem(SUBJECT); },
};

type Q = Record<string, string | number | boolean | undefined | null>;
export async function portalFetch<T = any>(path: string, init: RequestInit & { query?: Q } = {}): Promise<T> {
  const { query, ...rest } = init;
  const headers = new Headers(rest.headers);
  const t = portalStore.token(); if (t) headers.set('Authorization', `Bearer ${t}`);
  if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}${path}${qs(query)}`, { ...rest, headers });
  const text = await res.text();
  let body: any; try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (res.status === 401 && !path.startsWith('/portal/auth')) {
    portalStore.clear();
    if (typeof window !== 'undefined' && window.location.pathname !== '/portal') window.location.href = '/portal';
  }
  if (!res.ok) { const m = body?.message; throw new ApiError(res.status, Array.isArray(m) ? m.join(', ') : m || res.statusText, body); }
  return body as T;
}
export const portal = {
  get: <T = any>(p: string, query?: Q) => portalFetch<T>(p, { query }),
  post: <T = any>(p: string, body?: unknown) => portalFetch<T>(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T = any>(p: string, body?: unknown) => portalFetch<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
};

/** GET scoped to the selected family member (dependant) when one is chosen. */
export function usePortal<T = any>(path: string | null, query: Q = {}, scoped = true) {
  const subject = typeof window === 'undefined' ? null : portalStore.subject();
  const q = scoped && subject ? { ...query, patientId: subject } : query;
  return useQuery({ queryKey: ['portal', path, q], queryFn: () => portal.get<T>(path as string, q), enabled: !!path, retry: false });
}
export function usePortalAction<B = any, R = any>(fn: (b: B) => Promise<R>, invalidate = true) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { if (invalidate) qc.invalidateQueries({ queryKey: ['portal'] }); } });
}
export const kes = (minor?: number | null) => `KES ${((minor ?? 0) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (v?: string | null) => (v ? new Date(v).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
