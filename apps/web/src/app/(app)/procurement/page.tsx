'use client';
import { Check, PackageCheck, Send, X } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { FormDialog } from '@/components/FormDialog';
import { useAction, useList } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { StatusBadge, Tabs } from '@/components/ui';
import { date, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';

export default function Procurement() {
  const { hasRole } = useAuth(); const [status, setStatus] = useState(''); const [tab, setTab] = useState('po'); const [receive, setReceive] = useState<any>(null);
  const suppliers = useList<any>('/procurement/suppliers', { pageSize: 500 });
  const supplierName = (id: string) => suppliers.data?.data.find((s: any) => s.id === id)?.name ?? '—';
  const act = useAction<{ id: string; a: 'approve' | 'reject' | 'submit' }>('post', (b) => `/procurement/purchase-orders/${b.id}/${b.a}`, { invalidate: ['/procurement'], success: 'Updated' });
  const approver = hasRole('MANAGER', 'ACCOUNTANT');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'po', label: 'Purchase orders' }, { id: 'suppliers', label: 'Suppliers' }]} />;
  if (tab === 'suppliers') return <CrudPage title="Procurement" path="/procurement/suppliers" createLabel="New supplier" columns={[{ key: 'name', header: 'Supplier' }, { key: 'kraPin', header: 'KRA PIN' }, { key: 'phone', header: 'Phone' }, { key: 'email', header: 'Email' }, { key: 'terms', header: 'Terms' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'kraPin', label: 'KRA PIN' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'terms', label: 'Payment terms' }]}>{tabs}</CrudPage>;
  return <CrudPage title="Procurement" subtitle="Purchase orders with approval workflow" path="/procurement/purchase-orders" createLabel="New purchase order" query={{ status }}
    toolbar={<select className="input sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIAL', 'RECEIVED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>}
    transform={(v) => ({ supplierId: v.supplierId, lines: [{ itemId: v.itemId, quantity: Number(v.quantity), unitCostMinor: v.unitCostMinor }] })}
    columns={[{ key: 'number', header: 'PO' }, { key: 'supplier', header: 'Supplier', render: (p: any) => supplierName(p.supplierId) }, { key: 'createdAt', header: 'Date', render: (p: any) => date(p.createdAt) },
      { key: 'totalMinor', header: 'Total', render: (p: any) => money(p.totalMinor), className: 'text-right' }, { key: 'lines', header: 'Lines', render: (p: any) => (p.lines ?? []).length },
      { key: 'status', header: 'Status', render: (p: any) => <StatusBadge status={p.status} /> },
      { key: 'a', header: '', render: (p: any) => <span className="flex gap-1">
        {p.status === 'DRAFT' && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => act.mutate({ id: p.id, a: 'submit' })}><Send className="h-3 w-3" />Submit</button>}
        {approver && p.status === 'PENDING_APPROVAL' && <><button className="btn-primary px-2 py-1 text-xs" onClick={() => act.mutate({ id: p.id, a: 'approve' })}><Check className="h-3 w-3" />Approve</button><button className="btn-secondary px-2 py-1 text-xs" onClick={() => act.mutate({ id: p.id, a: 'reject' })}><X className="h-3 w-3" />Reject</button></>}
        {['APPROVED', 'PARTIAL'].includes(p.status) && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setReceive(p)}><PackageCheck className="h-3 w-3" />Receive</button>}</span> }]}
    fields={[{ name: 'supplierId', label: 'Supplier', type: 'picker', source: PICK.supplier, required: true }, { name: 'itemId', label: 'Item', type: 'picker', source: PICK.stockItem, required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'unitCost', label: 'Unit cost (KES)', type: 'money', required: true }]}>
    {tabs}
    <FormDialog open={!!receive} onClose={() => setReceive(null)} title={`Receive ${receive?.number ?? ''}`} path={`/procurement/purchase-orders/${receive?.id}/receive`} invalidate={['/procurement', '/inventory']} success="Goods received"
      transform={(v) => ({ storeId: v.storeId, reference: v.reference, lines: (receive?.lines ?? []).map((l: any) => ({ itemId: l.itemId, quantity: Math.max(l.quantity - (l.received ?? 0), 0), unitCostMinor: l.unitCostMinor, batchNo: v.batchNo, expiryDate: v.expiryDate || undefined })).filter((l: any) => l.quantity > 0) })}
      fields={[{ name: 'storeId', label: 'Receiving store', type: 'picker', source: PICK.store, required: true }, { name: 'reference', label: 'Delivery note no.' }, { name: 'batchNo', label: 'Batch no.', required: true }, { name: 'expiryDate', label: 'Expiry', type: 'date' }]} />
  </CrudPage>;
}
