'use client';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useList } from '@/lib/hooks';
import { useDebounced } from './DataTable';
import { Spinner } from './ui';
import { cn } from '@/lib/cn';

export interface PickerSource {
  /** List endpoint, called with `?q=&pageSize=`. */
  path: string;
  query?: Record<string, any>;
  label?: (row: any) => string;
  sub?: (row: any) => string | undefined;
  /** Post-process rows (e.g. flatten wards → beds). */
  map?: (rows: any[]) => any[];
  /** Value to submit (default row.id). */
  idOf?: (row: any) => string;
}

const defaultLabel = (r: any) => r?.name ?? r?.label ?? r?.title ?? r?.code ?? r?.id ?? '';

/** Searchable async select over a list endpoint. Controlled by an id value. */
export function EntityPicker({ source, value, onChange, placeholder = 'Search…', disabled, className, id }: {
  source: PickerSource; value?: string | null; onChange: (id: string, row?: any) => void; placeholder?: string; disabled?: boolean; className?: string; id?: string;
}) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const dq = useDebounced(q, 250);
  const [selected, setSelected] = useState<any>(null);
  const ref = useRef<HTMLDivElement>(null);
  const label = source.label ?? defaultLabel; const idOf = source.idOf ?? ((r: any) => r.id);
  const { data, isFetching } = useList<any>(source.path, { pageSize: 50, ...source.query, q: dq || undefined }, open || (!!value && !selected));
  let rows = data?.data ?? [];
  if (source.map) rows = source.map(rows);
  // Endpoints that ignore `q` (bare arrays) are filtered client-side as well.
  const filtered = dq ? rows.filter((r) => `${label(r)} ${source.sub?.(r) ?? ''}`.toLowerCase().includes(dq.toLowerCase()) || idOf(r) === dq) : rows;
  useEffect(() => { if (value && !selected) { const r = rows.find((x) => idOf(x) === value); if (r) setSelected(r); } if (!value) setSelected(null); }, [value, rows.length]); // eslint-disable-line
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = (r: any) => { setSelected(r); onChange(idOf(r), r); setOpen(false); setQ(''); };
  return (
    // preventDefault stops an enclosing <label> (Field) from re-dispatching clicks to the toggle button.
    <div ref={ref} className={cn('relative', className)} onClick={(e) => e.preventDefault()}>
      <button type="button" id={id} disabled={disabled} className="input flex items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)} aria-haspopup="listbox">
        <span className={cn('truncate', !value && 'text-slate-400')}>{value ? (selected ? label(selected) : 'Loading…') : placeholder}</span>
        <span className="flex items-center gap-1">
          {value && !disabled && <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); setSelected(null); onChange(''); }} />}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[16rem] rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 px-2 dark:border-slate-700">
            <Search className="h-4 w-4 text-slate-400" />
            <input autoFocus className="w-full bg-transparent py-2 text-sm outline-none" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (filtered[0]) pick(filtered[0]); } if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); } }} />
            {isFetching && <Spinner className="text-slate-400" />}
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1 text-sm">
            {filtered.map((r) => (
              <li key={idOf(r)}>
                <button type="button" className={cn('block w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800', idOf(r) === value && 'bg-primary-50 dark:bg-primary-900/40')} onClick={() => pick(r)}>
                  <span className="font-medium">{label(r)}</span>{source.sub?.(r) && <span className="ml-2 text-xs text-slate-500">{source.sub(r)}</span>}
                </button>
              </li>
            ))}
            {!isFetching && !filtered.length && <li className="px-3 py-3 text-center text-xs text-slate-500">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
