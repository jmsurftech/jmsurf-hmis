'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { PageHeader, StatusBadge } from '@/components/ui';
import { date, fullName, money } from '@/lib/format';

export default function Billing() {
  const router = useRouter(); const [status, setStatus] = useState(''); const [payer, setPayer] = useState('');
  return (
    <div>
      <PageHeader title="Billing" subtitle="Patient bills and invoices" />
      <DataTable path="/billing/bills" query={{ status, payerType: payer }} onRowClick={(b: any) => router.push(`/billing/${b.id}`)}
        toolbar={<><select className="input sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['OPEN', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
          <select className="input sm:w-36" value={payer} onChange={(e) => setPayer(e.target.value)}><option value="">All payers</option>{['CASH', 'SHA', 'INSURANCE', 'CORPORATE'].map((s) => <option key={s}>{s}</option>)}</select></>}
        columns={[
          { key: 'billNumber', header: 'Bill no.' }, { key: 'patient', header: 'Patient', render: (b: any) => fullName(b.patient) }, { key: 'payerType', header: 'Payer' },
          { key: 'createdAt', header: 'Date', render: (b: any) => date(b.createdAt) }, { key: 'totalMinor', header: 'Total', render: (b: any) => money(b.totalMinor), className: 'text-right' },
          { key: 'paidMinor', header: 'Paid', render: (b: any) => money(b.paidMinor), className: 'text-right' }, { key: 'balanceMinor', header: 'Balance', render: (b: any) => <b>{money(b.balanceMinor)}</b>, className: 'text-right' },
          { key: 'status', header: 'Status', render: (b: any) => <StatusBadge status={b.status} /> },
        ]} />
    </div>
  );
}
