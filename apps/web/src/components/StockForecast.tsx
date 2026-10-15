'use client';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Table } from '@/components/DataTable';
import { ErrorNote, Loading, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';

/** Statistical demand forecast (moving average × seasonality from stock movements) with reorder suggestions. */
export function StockForecast() {
  const [onlyReorder, setOnlyReorder] = useState(true);
  const [lead, setLead] = useState(2);
  const q = useGet<any>('/ai/inventory/forecast', { onlyReorder, leadTimeWeeks: lead, horizonWeeks: 4 });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlyReorder} onChange={(e) => setOnlyReorder(e.target.checked)} />Only items to reorder</label>
        <label className="flex items-center gap-2">Lead time (weeks)<input type="number" min={1} max={26} className="input w-20" value={lead} onChange={(e) => setLead(Math.max(1, Number(e.target.value) || 1))} /></label>
        <span className="text-xs text-slate-500"><TrendingUp className="mr-1 inline h-3 w-3" />{q.data?.method}; {q.data?.weeks} weeks of history</span>
      </div>
      <Table rows={q.data?.data ?? []} columns={[
        { key: 'name', header: 'Item', render: (r: any) => <span>{r.name} <span className="text-xs text-slate-500">{r.code}</span></span> },
        { key: 'onHand', header: 'On hand', className: 'text-right' },
        { key: 'avgWeekly', header: 'Avg / week', className: 'text-right' },
        { key: 'forecastTotal', header: 'Next 4 wks', className: 'text-right', render: (r: any) => `${r.forecastTotal}${r.seasonal ? ' (seasonal)' : ''}` },
        { key: 'weeksOfCover', header: 'Weeks of cover', className: 'text-right', render: (r: any) => r.weeksOfCover ?? '—' },
        { key: 'reorderPoint', header: 'Reorder point', className: 'text-right' },
        { key: 'suggestedOrderQty', header: 'Suggested order', className: 'text-right', render: (r: any) => r.suggestedOrderQty ? <b>{r.suggestedOrderQty} {r.unit}</b> : '—' },
        { key: 's', header: '', render: (r: any) => <StatusBadge status={r.shouldReorder ? 'REORDER' : 'OK'} tone={r.shouldReorder ? 'amber' : 'green'} /> },
      ]} />
    </div>
  );
}
