'use client';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Card, EmptyState, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime } from '@/lib/format';

const KINDS = ['', 'APPT_24H', 'APPT_2H', 'IMMUNIZATION_DUE', 'RESULTS_READY', 'BILL_BALANCE'];

export default function RemindersPage() {
  const [kind, setKind] = useState(''); const [page, setPage] = useState(1);
  const { data, isLoading } = useGet<any>('/messaging/reminders', { kind, page, pageSize: 50 });
  const fb = useGet<any>('/messaging/feedback');
  const run = useAction<null, Record<string, number>>('post', '/messaging/reminders/run', { invalidate: ['/messaging/reminders'], success: 'Reminder sweep complete' });
  return (
    <div>
      <PageHeader title="Reminders log" subtitle="Automatic SMS reminders run every 10 minutes: appointments (24 h & 2 h), immunizations due, results ready, bill balances."
        actions={<><select className="input w-auto" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>{KINDS.map((k) => <option key={k} value={k}>{k || 'All kinds'}</option>)}</select>
          <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate(null)}><Play className="h-4 w-4" />Run now</button></>} />
      {fb.data && <p className="mb-3 text-sm text-slate-500">Patient feedback: {fb.data.total} responses{fb.data.nps !== null ? ` · NPS ${fb.data.nps}` : ''}</p>}
      <Card>
        {isLoading ? <Loading /> : !data?.data?.length ? <EmptyState title="No reminders sent yet" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="p-2">Sent</th><th className="p-2">Kind</th><th className="p-2">To</th><th className="p-2">Message</th><th className="p-2">Status</th></tr></thead>
            <tbody>{data.data.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="whitespace-nowrap p-2">{dateTime(r.createdAt)}</td><td className="p-2 text-xs">{r.kind}<div className="text-slate-400">{r.channel} · {r.lang}</div></td>
                <td className="p-2">{r.to}</td><td className="p-2 text-xs">{r.body}</td><td className="p-2"><StatusBadge status={r.status} /></td>
              </tr>))}</tbody>
          </table>
          <div className="mt-2 flex justify-end gap-2 text-sm"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><button className="btn-secondary" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></div>)}
      </Card>
    </div>
  );
}
