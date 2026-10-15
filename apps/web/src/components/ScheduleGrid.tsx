'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useList } from '@/lib/hooks';
import { StatusBadge } from './ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Week view: rows = resources (theatres, chairs…), columns = days. */
export function ScheduleGrid({ resourcesPath, bookingsPath, resourceKey, renderBooking, onCellClick }: {
  resourcesPath: string; bookingsPath: string; resourceKey: string; renderBooking: (b: any) => React.ReactNode; onCellClick?: (resourceId: string, day: string) => void;
}) {
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d; });
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const res = useList<any>(resourcesPath, { pageSize: 100 });
  const book = useList<any>(bookingsPath, { from: iso(days[0]), to: iso(days[6]), pageSize: 500 });
  const list = book.data?.data ?? [];
  const shift = (n: number) => setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + n));
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-800">
        <span className="text-sm font-medium">Week of {days[0].toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <div className="flex gap-1"><button className="btn-secondary px-2 py-1" onClick={() => shift(-7)}><ChevronLeft className="h-4 w-4" /></button><button className="btn-secondary px-2 py-1 text-xs" onClick={() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setStart(d); }}>Today</button><button className="btn-secondary px-2 py-1" onClick={() => shift(7)}><ChevronRight className="h-4 w-4" /></button></div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[800px] w-full table-fixed text-xs">
          <thead><tr><th className="th w-32">Resource</th>{days.map((d) => <th key={iso(d)} className="th">{d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric' })}</th>)}</tr></thead>
          <tbody>
            {(res.data?.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="td font-medium">{r.name ?? r.label}<div className="mt-0.5"><StatusBadge status={r.status} /></div></td>
                {days.map((d) => {
                  const items = list.filter((b) => b[resourceKey] === r.id && String(b.scheduledAt ?? b.startAt ?? b.date).slice(0, 10) === iso(d));
                  return <td key={iso(d)} className="cursor-pointer p-1 align-top hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => onCellClick?.(r.id, iso(d))}>
                    <div className="min-h-[56px] space-y-1">{items.map((b) => <div key={b.id} className="rounded bg-primary-100 p-1 text-primary-900 dark:bg-primary-900/50 dark:text-primary-100" onClick={(e) => e.stopPropagation()}>{renderBooking(b)}</div>)}</div>
                  </td>;
                })}
              </tr>
            ))}
            {!res.isLoading && !res.data?.data?.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No resources configured</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
