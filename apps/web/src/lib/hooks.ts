'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from './api';
import { useToast } from '@/components/Toast';

type Q = Record<string, string | number | boolean | undefined | null>;
export function useList<T = any>(path: string, query: Q = {}, enabled = true) {
  return useQuery({ queryKey: [path, query], queryFn: () => api.get<Paginated<T>>(path, query), enabled });
}
export function useGet<T = any>(path: string | null, query?: Q) {
  return useQuery({ queryKey: [path, query], queryFn: () => api.get<T>(path as string, query), enabled: !!path });
}
export function useAction<TBody = any, TRes = any>(
  method: 'post' | 'patch' | 'put' | 'del', path: string | ((b: TBody) => string),
  opts: { invalidate?: string[]; success?: string; onSuccess?: (r: TRes) => void } = {},
) {
  const qc = useQueryClient(); const toast = useToast();
  return useMutation({
    mutationFn: (body: TBody) => {
      const p = typeof path === 'function' ? path(body) : path;
      return method === 'del' ? api.del<TRes>(p) : api[method]<TRes>(p, body);
    },
    onSuccess: (r) => {
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(k) }));
      if (opts.success) toast.push(opts.success, 'success');
      opts.onSuccess?.(r);
    },
    onError: (e: Error) => toast.push(e.message, 'error'),
  });
}
