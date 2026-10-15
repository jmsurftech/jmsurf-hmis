'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from './api';
import { useToast } from '@/components/Toast';

/** Normalise list responses: some endpoints return a bare array, others `{ data, total, page, pageSize }`. */
export function toPage<T>(r: unknown): Paginated<T> {
  if (Array.isArray(r)) return { data: r as T[], total: r.length, page: 1, pageSize: r.length, clientSide: true };
  const o = (r ?? {}) as Partial<Paginated<T>> & { items?: T[] };
  const data = (o.data ?? o.items ?? []) as T[];
  return { data, total: o.total ?? data.length, page: o.page ?? 1, pageSize: o.pageSize ?? data.length };
}
type Q = Record<string, string | number | boolean | undefined | null>;
export function useList<T = any>(path: string, query: Q = {}, enabled = true) {
  return useQuery({ queryKey: [path, query], queryFn: async () => toPage<T>(await api.get<unknown>(path, query)), enabled: enabled && !!path });
}
export function useGet<T = any>(path: string | null, query?: Q) {
  return useQuery({ queryKey: [path, query], queryFn: async () => ((await api.get<T>(path as string, query)) ?? null) as T, enabled: !!path });
}
export function useAction<TBody = any, TRes = any>(
  method: 'post' | 'patch' | 'put' | 'del', path: string | ((b: TBody) => string),
  opts: { invalidate?: string[]; success?: string; onSuccess?: (r: TRes) => void } = {},
) {
  const qc = useQueryClient(); const toast = useToast();
  return useMutation({
    mutationFn: (body: TBody) => {
      const p = typeof path === 'function' ? path(body) : path;
      // A primitive (e.g. an id used only to build the path) is not a request body.
      const payload = body !== null && typeof body === 'object' ? body : method === 'post' ? undefined : {};
      return method === 'del' ? api.del<TRes>(p) : api[method]<TRes>(p, payload);
    },
    onSuccess: (r) => {
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(k) }));
      if (opts.success) toast.push(opts.success, 'success');
      opts.onSuccess?.(r);
    },
    onError: (e: Error) => toast.push(e.message, 'error'),
  });
}
