'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, ApiError } from './api';
import { useToast } from '@/components/Toast';

/** Patient portal session. Kept apart from the staff token so a shared device never mixes the two. */
const KEY = 'jmsurf.portal';
export interface PortalAccount { token: string; patient: { id: string; mrn: string; firstName: string; lastName: string }; hospital: { id: string; name: string; logoUrl?: string | null } }
export const portalStore = {
  get: (): PortalAccount | null => { try { return typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set: (a: PortalAccount) => localStorage.setItem(KEY, JSON.stringify(a)),
  clear: () => localStorage.removeItem(KEY),
};

export async function portalFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const a = portalStore.get();
  if (a?.token) headers.set('Authorization', `Bearer ${a.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}/portal${path}`, { ...init, headers });
  const text = await res.text();
  let body: any; try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (res.status === 401 && !path.startsWith('/otp') && !path.startsWith('/login') && typeof window !== 'undefined') {
    portalStore.clear(); window.location.href = '/portal/login';
  }
  if (!res.ok) { const m = body?.message; throw new ApiError(res.status, Array.isArray(m) ? m.join(', ') : m || res.statusText, body); }
  return body as T;
}
export const portal = {
  get: <T = any>(p: string) => portalFetch<T>(p),
  post: <T = any>(p: string, b?: unknown) => portalFetch<T>(p, { method: 'POST', body: b === undefined ? undefined : JSON.stringify(b) }),
};
export function usePortal<T = any>(path: string) {
  return useQuery({ queryKey: ['portal', path], queryFn: () => portal.get<T>(path) });
}
export function usePortalAction<B = any>(path: string | ((b: B) => string), opts: { success?: string; invalidate?: boolean; onSuccess?: (r: any) => void } = {}) {
  const qc = useQueryClient(); const toast = useToast();
  return useMutation({
    mutationFn: (b: B) => portal.post(typeof path === 'function' ? path(b) : path, b),
    onSuccess: (r) => { if (opts.invalidate !== false) qc.invalidateQueries({ queryKey: ['portal'] }); if (opts.success) toast.push(opts.success, 'success'); opts.onSuccess?.(r); },
    onError: (e: Error) => toast.push(e.message, 'error'),
  });
}
