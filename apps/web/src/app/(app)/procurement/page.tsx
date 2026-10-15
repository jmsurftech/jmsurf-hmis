'use client';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { useAction } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { StatusBadge } from '@/components/ui';
import { date, money } from '@/lib/format';

export default function Procurement() {
  const { hasRole } = useAuth(); const [status, setStatus] = useState('');
  const act = useAction<{ id: string; a: 'approve' | 'reject' }>('post', (b) => `/procurement/purchase-orders/${b.id}/${b.a}`, { invalidate: ['/procurement'], success: 'Updated' });
  const approver = hasRole('MANAGER', 'ACCOUNTANT');
  return <CrudPage title="Procurement" subtitle="Purchase orders with approval workflow" path="/procurement/purchase-orders" createLabel="New purchase order" query={{ status }}
    toolbar={<select className="input sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RECEIVED'].map((s) => <option key={s}>{s}</option>)}</select>}
    transform={(v) => ({ supplierId: v.supplierId, expectedDate: v.expectedDate, notes: v.notes, lines: [{ itemId: v.itemId, quantity: v.quantity, unitCostMinor: v.unitCostMinor }] })}
    columns={[{ key: 'poNumber', header: 'PO' }, { key: 'supplier', header: 'Supplier', render: (p: any) => p.supplier?.name ?? '—' }, { key: 'createdAt', header: 'Date', render: (p: any) => date(p.createdAt) },
      { key: 'totalMinor', header: 'Total', render: (p: any) => money(p.totalMinor), className: 'text-right' }, { key: 'requestedBy', header: 'Requested by', render: (p: any) => p.requestedBy?.firstName ?? '—' },
      { key: 'status', header: 'Status', render: (p: any) => <StatusBadge status={p.status} /> },
      { key: 'a', header: '', render: (p: any) => approver && p.status === 'PENDING' ? <span className="flex gap-1"><button className="btn-primary px-2 py-1 text-xs" onClick={() => act.mutate({ id: p.id, a: 'approve' })}><Check className="h-3 w-3" />Approve</button><button className="btn-secondary px-2 py-1 text-xs" onClick={() => act.mutate({ id: p.id, a: 'reject' })}><X className="h-3 w-3" />Reject</button></span> : null }]}
    fields={[{ name: 'supplierId', label: 'Supplier ID', required: true }, { name: 'expectedDate', label: 'Expected delivery', type: 'date' }, { name: 'itemId', label: 'Item ID', required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'unitCost', label: 'Unit cost (KES)', type: 'money', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />;
}
