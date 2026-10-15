'use client';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useList } from '@/lib/hooks';
import { EmptyState, ErrorNote, Spinner } from './ui';
import { cn } from '@/lib/cn';

export interface Column<T> { key: string; header: string; render?: (row: T) => React.ReactNode; className?: string }

export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function get(row: any, key: string) { return key.split('.').reduce((o, k) => (o == null ? o : o[k]), row); }

export function Table<T>({ columns, rows, onRowClick, empty }: { columns: Column<T>[]; rows: T[]; onRowClick?: (r: T) => void; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty ?? <EmptyState />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-900/60"><tr>{columns.map((c) => <th key={c.key} className={cn('th', c.className)}>{c.header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r: any, i) => (
            <tr key={r.id ?? i} onClick={() => onRowClick?.(r)} className={cn(onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50')}>
              {columns.map((c) => <td key={c.key} className={cn('td', c.className)}>{c.render ? c.render(r) : String(get(r, c.key) ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataTable<T = any>({ path, columns, query = {}, onRowClick, searchPlaceholder = 'Search…', toolbar, pageSize = 20, emptyMessage, searchable = true }: {
  path: string; columns: Column<T>[]; query?: Record<string, any>; onRowClick?: (r: T) => void; searchPlaceholder?: string; toolbar?: React.ReactNode; pageSize?: number; emptyMessage?: string; searchable?: boolean;
}) {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, JSON.stringify(query)]);
  const { data, isLoading, error, isFetching } = useList<T>(path, { ...query, q: dq, page, pageSize });
  // Endpoints returning bare arrays are searched and paged in the browser.
  const all = data?.clientSide && dq ? (data.data ?? []).filter((r) => JSON.stringify(r).toLowerCase().includes(dq.toLowerCase())) : data?.data ?? [];
  const rows = data?.clientSide ? all.slice((page - 1) * pageSize, page * pageSize) : all;
  const total = data?.clientSide ? all.length : data?.total ?? 0; const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="card overflow-hidden">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center dark:border-slate-800">
          {searchable && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-9" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {toolbar}
          {isFetching && <Spinner className="text-slate-400" />}
        </div>
      )}
      {error ? <div className="p-3"><ErrorNote error={error} /></div> : null}
      {isLoading ? <div className="flex justify-center p-10"><Spinner className="h-6 w-6 text-slate-400" /></div> : (
        <Table columns={columns} rows={rows} onRowClick={onRowClick} empty={<EmptyState message={emptyMessage} />} />
      )}
      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
        <span>{total} record{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <span>Page {page} / {pages}</span>
          <button className="btn-secondary px-2 py-1" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
