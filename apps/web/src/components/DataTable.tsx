'use client';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useList } from '@/lib/hooks';
import { EmptyState, ErrorNote, Spinner } from './ui';
import { cn } from '@/lib/cn';

export interface Column<T> { key: string; header: string; render?: (row: T) => React.ReactNode; className?: string; csv?: (row: T) => string | number | null | undefined }

export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function get(row: any, key: string) { return key.split('.').reduce((o, k) => (o == null ? o : o[k]), row); }
function cellText(v: unknown) { return v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); }

/** Plain table: header row, hover rows, phone card layout (each cell labelled). */
export function Table<T>({ columns, rows, onRowClick, empty, dense }: { columns: Column<T>[]; rows: T[]; onRowClick?: (r: T) => void; empty?: React.ReactNode; dense?: boolean }) {
  if (!rows.length) return <>{empty ?? <EmptyState />}</>;
  return (
    <div className="tablewrap">
      <table className={cn('t mcards', dense && 'text-[13px]')}>
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r: any, i) => (
            <tr key={r.id ?? i} onClick={() => onRowClick?.(r)} className={cn(onRowClick && 'click')}>
              {columns.map((c) => <td key={c.key} data-l={c.header} className={c.className}>{c.render ? c.render(r) : cellText(get(r, c.key))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toCsv<T>(columns: Column<T>[], rows: T[]) {
  const cols = columns.filter((c) => c.header);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => esc(c.header)).join(','), ...rows.map((r) => cols.map((c) => esc(c.csv ? c.csv(r) : (() => { const v = get(r, c.key); return typeof v === 'object' ? '' : v; })())).join(','))].join('\n');
}

/** Searchable, paged list over an API list endpoint, inside a glass card. */
export function DataTable<T = any>({ path, columns, query = {}, onRowClick, searchPlaceholder = 'Search…', toolbar, pageSize: initialSize = 20, emptyMessage, emptyTitle, searchable = true, exportName, title }: {
  path: string; columns: Column<T>[]; query?: Record<string, any>; onRowClick?: (r: T) => void; searchPlaceholder?: string; toolbar?: React.ReactNode; pageSize?: number;
  emptyMessage?: React.ReactNode; emptyTitle?: string; searchable?: boolean; exportName?: string; title?: React.ReactNode;
}) {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(initialSize);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, JSON.stringify(query), pageSize]);
  const { data, isLoading, error, isFetching, refetch } = useList<T>(path, { ...query, q: dq || undefined, page, pageSize });
  // Endpoints returning bare arrays are searched and paged in the browser.
  const all = data?.clientSide && dq ? (data.data ?? []).filter((r) => JSON.stringify(r).toLowerCase().includes(dq.toLowerCase())) : data?.data ?? [];
  const rows = data?.clientSide ? all.slice((page - 1) * pageSize, page * pageSize) : all;
  const total = data?.clientSide ? all.length : data?.total ?? 0; const pages = Math.max(1, Math.ceil(total / pageSize));
  const exportCsv = () => {
    const blob = new Blob([toCsv(columns, rows)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${exportName ?? 'export'}.csv`; a.click();
  };
  return (
    <div className="card overflow-hidden">
      {(searchable || toolbar || title) && (
        <div className="toolbar">
          {title && <h3 className="m-0 mr-2 text-[15px] font-extrabold">{title}</h3>}
          {searchable && (
            <div className="input-icon min-w-[200px] flex-1">
              <Search />
              <input className="input sm" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </div>
          )}
          {toolbar}
          <div className="ml-auto flex items-center gap-1.5">
            {isFetching && !isLoading && <Spinner className="text-slate-400" />}
            <button className="btn ghost sm icon" title="Refresh" aria-label="Refresh" onClick={() => refetch()}><RefreshCw /></button>
            {rows.length > 0 && <button className="btn ghost sm icon hide-sm" title="Export CSV" aria-label="Export CSV" onClick={exportCsv}><Download /></button>}
          </div>
        </div>
      )}
      {error ? <div className="px-4 pt-4"><ErrorNote error={error} /></div> : null}
      {isLoading ? <div className="p-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton mb-2 h-11" style={{ opacity: 1 - i * 0.15 }} />)}</div> : (
        <Table columns={columns} rows={rows} onRowClick={onRowClick} empty={<EmptyState title={dq ? 'No matches' : emptyTitle ?? 'Nothing here yet'} message={dq ? `Nothing matches "${dq}".` : emptyMessage} />} />
      )}
      {total > 0 && (
        <div className="pager">
          <span>{total.toLocaleString()} record{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <select className="input sm w-auto" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">{[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
            <button className="btn sm icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft /></button>
            <span className="whitespace-nowrap">Page {page} of {pages}</span>
            <button className="btn sm icon" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight /></button>
          </div>
        </div>
      )}
    </div>
  );
}
