'use client';
import { useState } from 'react';
import { Card, EmptyState, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { TelemedicineJoin } from '@/components/TelemedicineJoin';
import { useGet } from '@/lib/hooks';
import { dateTime, fullName, money } from '@/lib/format';

export default function TelemedicinePage() {
  const [days, setDays] = useState(7);
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const { data, isLoading } = useGet<{ data: any[] }>('/telemedicine/sessions', { from: from.toISOString(), to: new Date(from.getTime() + days * 86400000).toISOString() });
  return (
    <div>
      <PageHeader title="Telemedicine" subtitle="Video consultations (Jitsi Meet). Patients join from the portal after paying the consultation fee."
        actions={<select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>Today</option><option value={7}>Next 7 days</option><option value={30}>Next 30 days</option></select>} />
      <Card>
        {isLoading ? <Loading /> : !data?.data?.length ? <EmptyState title="No video consultations" message="Book an appointment with mode TELEMEDICINE, or patients can book from the portal." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="p-2">When</th><th className="p-2">Patient</th><th className="p-2">Reason</th><th className="p-2">Fee</th><th className="p-2">Status</th><th className="p-2" /></tr></thead>
            <tbody>{data.data.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 whitespace-nowrap">{dateTime(a.startAt)}</td>
                <td className="p-2">{fullName(a.patient)}<div className="text-xs text-slate-500">{a.patient?.mrn}</div></td>
                <td className="p-2">{a.reason ?? '—'}</td>
                <td className="p-2">{a.session ? money(a.session.feeMinor) : '—'}</td>
                <td className="p-2"><StatusBadge status={a.status} />{a.session?.patientJoinedAt && <div className="text-xs text-emerald-600">Patient joined</div>}</td>
                <td className="p-2"><div className="flex gap-1">{!['CANCELLED', 'DONE', 'NO_SHOW'].includes(a.status) && <TelemedicineJoin appointmentId={a.id} compact />}</div></td>
              </tr>))}</tbody>
          </table></div>)}
      </Card>
    </div>
  );
}
