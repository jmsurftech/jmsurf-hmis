'use client';
import { Barcode, Minus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { MpesaStk } from '@/components/MpesaStk';
import { Card, Modal, PageHeader, Spinner, StatusBadge, Tabs } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime, fullName, money } from '@/lib/format';

export default function Pharmacy() {
  const [tab, setTab] = useState('queue'); const [sel, setSel] = useState<any>(null);
  return (
    <div>
      <PageHeader title="Pharmacy" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Prescription queue' }, { id: 'dispensed', label: 'Dispensed' }, { id: 'pos', label: 'OTC point of sale' }]} />
      {tab !== 'pos' && <DataTable path="/pharmacy/prescriptions" query={{ status: tab === 'queue' ? 'PENDING' : 'DISPENSED' }} onRowClick={setSel} columns={[
        { key: 'rx', header: 'Rx', render: (r: any) => r.rxNumber ?? r.id.slice(0, 8) }, { key: 'patient', header: 'Patient', render: (r: any) => fullName(r.patient) },
        { key: 'prescriber', header: 'Prescriber', render: (r: any) => r.prescriber?.name ?? '—' }, { key: 'items', header: 'Items', render: (r: any) => r.items?.length ?? 0 },
        { key: 'payer', header: 'Payer', render: (r: any) => r.visit?.payerType ?? r.payerType }, { key: 'paid', header: 'Billing', render: (r: any) => <StatusBadge status={r.billingStatus ?? (r.paid ? 'PAID' : 'PENDING')} /> },
        { key: 'createdAt', header: 'Time', render: (r: any) => dateTime(r.createdAt) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
      ]} />}
      {tab === 'pos' && <Pos />}
      {sel && <DispenseDialog rx={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function DispenseDialog({ rx, onClose }: { rx: any; onClose: () => void }) {
  const { data } = useGet<any>(`/pharmacy/prescriptions/${rx.id}`);
  const items: any[] = data?.items ?? rx.items ?? [];
  const [qty, setQty] = useState<Record<string, number>>({});
  const m = useAction('post', `/pharmacy/prescriptions/${rx.id}/dispense`, { invalidate: ['/pharmacy'], success: 'Dispensed', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Dispense ${rx.rxNumber ?? ''}`} wide footer={rx.status !== 'DISPENSED' && <><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={m.isPending} onClick={() => m.mutate({ items: items.map((i) => ({ prescriptionItemId: i.id, quantity: qty[i.id] ?? i.quantity ?? 0 })) })}>{m.isPending && <Spinner />}Dispense & label</button></>}>
      <p className="mb-3 text-sm">{fullName(rx.patient)}</p>
      <table className="w-full text-sm"><thead><tr><th className="th">Drug</th><th className="th">Sig</th><th className="th">Stock</th><th className="th">Qty</th></tr></thead><tbody>
        {items.map((i) => <tr key={i.id}><td className="td font-medium">{i.drug?.name ?? i.name} {i.drug?.strength}</td><td className="td text-xs">{i.dose} {i.frequency} {i.route} × {i.durationDays}d</td><td className="td">{i.drug?.stockOnHand ?? '—'}</td>
          <td className="td"><input type="number" className="input w-20" disabled={rx.status === 'DISPENSED'} value={qty[i.id] ?? i.quantity ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} /></td></tr>)}
      </tbody></table>
    </Modal>
  );
}

interface CartLine { itemId: string; name: string; unitPriceMinor: number; quantity: number }
function Pos() {
  const toast = useToast(); const ref = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(''); const [cart, setCart] = useState<CartLine[]>([]); const [pay, setPay] = useState<'' | 'CASH' | 'MPESA'>(''); const [tendered, setTendered] = useState('');
  const [saleId, setSaleId] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const total = cart.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!code.trim()) return;
    try {
      const r = await api.get<any>('/pharmacy/drugs/lookup', { barcode: code.trim(), q: code.trim() });
      const d = Array.isArray(r?.data) ? r.data[0] : r;
      if (!d) throw new Error('Item not found');
      setCart((c) => { const ex = c.find((l) => l.itemId === d.id); return ex ? c.map((l) => l.itemId === d.id ? { ...l, quantity: l.quantity + 1 } : l) : [...c, { itemId: d.id, name: `${d.name ?? d.genericName} ${d.strength ?? ''}`, unitPriceMinor: d.sellingPriceMinor ?? d.priceMinor ?? 0, quantity: 1 }]; });
    } catch (err) { toast.push((err as Error).message, 'error'); }
    setCode(''); ref.current?.focus();
  };
  const createSale = async (method: 'CASH' | 'MPESA') => {
    setBusy(true);
    try { const s = await api.post<{ id: string }>('/pharmacy/otc-sales', { items: cart.map(({ itemId, quantity, unitPriceMinor }) => ({ itemId, quantity, unitPriceMinor })), paymentMethod: method, tenderedMinor: method === 'CASH' ? Math.round(Number(tendered) * 100) : undefined }); setSaleId(s.id); return s.id; }
    catch (e) { toast.push((e as Error).message, 'error'); return null; } finally { setBusy(false); }
  };
  const reset = () => { setCart([]); setPay(''); setTendered(''); setSaleId(null); ref.current?.focus(); };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Cart" className="lg:col-span-2">
        <form onSubmit={add} className="relative mb-3"><Barcode className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input ref={ref} autoFocus className="input pl-9" placeholder="Scan barcode or type item name, then Enter" value={code} onChange={(e) => setCode(e.target.value)} /></form>
        {cart.length ? <table className="w-full text-sm"><tbody>{cart.map((l, i) => <tr key={l.itemId} className="border-t border-slate-100 dark:border-slate-800">
          <td className="td">{l.name}</td><td className="td">{money(l.unitPriceMinor)}</td>
          <td className="td"><span className="flex items-center gap-1"><button className="btn-secondary px-1.5 py-0.5" onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}><Minus className="h-3 w-3" /></button><span className="w-6 text-center">{l.quantity}</span><button className="btn-secondary px-1.5 py-0.5" onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, quantity: x.quantity + 1 } : x))}><Plus className="h-3 w-3" /></button></span></td>
          <td className="td text-right font-medium">{money(l.unitPriceMinor * l.quantity)}</td><td className="td"><button onClick={() => setCart(cart.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-red-500" /></button></td></tr>)}</tbody></table>
          : <p className="py-10 text-center text-sm text-slate-500">Scan an item to start a sale</p>}
      </Card>
      <Card title="Payment">
        <p className="text-sm text-slate-500">Total</p><p className="mb-4 text-3xl font-bold">{money(total)}</p>
        <div className="mb-4 grid grid-cols-2 gap-2"><button className={pay === 'CASH' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPay('CASH')} disabled={!cart.length}>Cash</button><button className={pay === 'MPESA' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPay('MPESA')} disabled={!cart.length}>M-Pesa</button></div>
        {pay === 'CASH' && <div className="space-y-3"><input className="input" type="number" placeholder="Amount tendered" value={tendered} onChange={(e) => setTendered(e.target.value)} />
          {Number(tendered) * 100 >= total && <p className="text-sm">Change: <b>{money(Number(tendered) * 100 - total)}</b></p>}
          <button className="btn-primary w-full" disabled={busy || Number(tendered) * 100 < total} onClick={async () => { if (await createSale('CASH')) { toast.push('Sale completed', 'success'); reset(); } }}>{busy && <Spinner />}Complete sale</button></div>}
        {pay === 'MPESA' && (saleId ? <MpesaStk amountMinor={total} body={{ otcSaleId: saleId }} onSuccess={() => { toast.push('Sale completed', 'success'); setTimeout(reset, 1500); }} />
          : <button className="btn-primary w-full" disabled={busy} onClick={() => createSale('MPESA')}>{busy && <Spinner />}Create sale & request M-Pesa</button>)}
        {cart.length > 0 && <button className="btn-secondary mt-3 w-full" onClick={reset}>Clear</button>}
      </Card>
    </div>
  );
}
