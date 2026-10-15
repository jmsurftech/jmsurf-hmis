'use client';
import { Barcode, CheckCircle2, ClipboardList, Minus, Pill, Plus, ShoppingCart, Smartphone, Banknote, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { MpesaStk } from '@/components/MpesaStk';
import { Card, EmptyState, Field, Modal, PageHeader, Spinner, StatCard, StatusBadge, Tabs } from '@/components/ui';
import { EntityPicker } from '@/components/EntityPicker';
import { PICK } from '@/lib/pickers';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { dateTime, fullName, money } from '@/lib/format';

export default function Pharmacy() {
  const [tab, setTab] = useState('queue'); const [sel, setSel] = useState<any>(null);
  const queue = useList('/pharmacy/prescriptions', { status: 'PENDING,PARTIAL', pageSize: 1 });
  const dispensed = useList('/pharmacy/prescriptions', { status: 'DISPENSED', pageSize: 1 });
  return (
    <div>
      <PageHeader title="Pharmacy" subtitle="Dispense prescriptions from the clinics and sell over the counter. Stock is deducted by batch, first to expire first."
        actions={<button className="btn primary" onClick={() => setTab('pos')}><ShoppingCart />Over-the-counter sale</button>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Waiting to dispense" value={queue.data?.total} icon={ClipboardList} tone="amber" loading={queue.isLoading} />
        <StatCard label="Dispensed (all time)" value={dispensed.data?.total} icon={CheckCircle2} tone="green" loading={dispensed.isLoading} />
        <div className="col-span-2 lg:col-span-1"><StatCard label="Counter" value={tab === 'pos' ? 'Selling' : 'Ready'} hint="Scan a barcode to start a sale" icon={Pill} tone="teal" /></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Prescription queue', icon: ClipboardList, count: queue.data?.total }, { id: 'dispensed', label: 'Dispensed', icon: CheckCircle2 }, { id: 'pos', label: 'Over the counter', icon: ShoppingCart }]} />
      {tab !== 'pos' && <DataTable path="/pharmacy/prescriptions" query={{ status: tab === 'queue' ? 'PENDING,PARTIAL' : 'DISPENSED' }} onRowClick={setSel} searchPlaceholder="Search patient or drug" emptyTitle={tab === 'queue' ? 'No prescriptions waiting' : 'Nothing dispensed yet'} columns={[
        { key: 'visit', header: 'Visit', render: (r: any) => r.visit?.visitNumber }, { key: 'patient', header: 'Patient', render: (r: any) => <span>{fullName(r.visit?.patient)}<span className="block text-xs text-slate-500">{r.visit?.patient?.mrn}</span></span> },
        { key: 'drugName', header: 'Drug', render: (r: any) => <span className="flex items-center gap-2"><Pill className="h-4 w-4 shrink-0 text-brand" /><b>{r.drugName}</b></span> }, { key: 'sig', header: 'Sig', render: (r: any) => `${r.dose} ${r.route ?? ''} ${r.frequency}${r.durationDays ? ` × ${r.durationDays}d` : ''}` },
        { key: 'quantity', header: 'Qty', render: (r: any) => `${(r.dispenses ?? []).reduce((a: number, d: any) => a + d.quantity, 0)} / ${r.quantity}` },
        { key: 'createdAt', header: 'Time', render: (r: any) => dateTime(r.createdAt) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
      ]} />}
      {tab === 'pos' && <Pos />}
      {sel && <DispenseDialog rx={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function DispenseDialog({ rx, onClose }: { rx: any; onClose: () => void }) {
  const done = (rx.dispenses ?? []).reduce((a: number, d: any) => a + d.quantity, 0); const remaining = rx.quantity - done;
  const [qty, setQty] = useState<number>(remaining); const [storeId, setStoreId] = useState('');
  const [label, setLabel] = useState<any>(null);
  const m = useAction('post', `/pharmacy/prescriptions/${rx.id}/dispense`, { invalidate: ['/pharmacy'], success: 'Dispensed', onSuccess: (r: any) => setLabel(r?.label) });
  const open = ['PENDING', 'PARTIAL'].includes(rx.status) && !label;
  return (
    <Modal open onClose={onClose} title={`Dispense: ${rx.drugName}`} footer={open ? <><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={m.isPending || qty < 1 || qty > remaining} onClick={() => m.mutate({ quantity: qty, storeId: storeId || undefined })}>{m.isPending && <Spinner />}Dispense & label</button></> : <button className="btn" onClick={onClose}>Close</button>}>
      <p className="m-0 mb-3 text-sm text-slate-500">{fullName(rx.visit?.patient)} · {rx.visit?.patient?.mrn} · {rx.visit?.visitNumber}</p>
      {label ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 font-mono text-xs dark:border-white/15"><div className="alert ok mb-3 font-sans"><CheckCircle2 />Dispensed. Print or copy the label below.</div><p className="font-bold">{label.drug}</p><p>{label.dose} {label.frequency}{label.durationDays ? ` for ${label.durationDays} days` : ''}</p><p>Qty {label.quantity}</p>{label.instructions && <p>{label.instructions}</p>}</div>
        : <div className="grid gap-3 sm:grid-cols-2">
          <p className="text-sm sm:col-span-2">{rx.dose} {rx.route} {rx.frequency}{rx.durationDays ? ` × ${rx.durationDays}d` : ''} · prescribed {rx.quantity}, remaining {remaining}</p>
          <Field label="Quantity"><input type="number" className="input" disabled={!open} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
          <Field label="Store (default: pharmacy)"><EntityPicker source={PICK.store} value={storeId} onChange={setStoreId} placeholder="Pharmacy store" /></Field>
        </div>}
    </Modal>
  );
}

interface CartLine { itemId: string; name: string; unitPriceMinor: number; quantity: number }
function Pos() {
  const toast = useToast(); const ref = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(''); const [cart, setCart] = useState<CartLine[]>([]); const [pay, setPay] = useState<'' | 'CASH' | 'MPESA'>(''); const [tendered, setTendered] = useState('');
  const [bill, setBill] = useState<any>(null); const [busy, setBusy] = useState(false);
  const total = cart.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!code.trim()) return;
    try {
      const byBarcode = await api.get<any>('/inventory/items', { barcode: code.trim(), pageSize: 1 });
      const r = byBarcode?.data?.length ? byBarcode : await api.get<any>('/inventory/items', { q: code.trim(), pageSize: 1 });
      const d = r?.data?.[0];
      if (!d) throw new Error('Item not found');
      setCart((c) => { const ex = c.find((l) => l.itemId === d.id); return ex ? c.map((l) => l.itemId === d.id ? { ...l, quantity: l.quantity + 1 } : l) : [...c, { itemId: d.id, name: `${d.name ?? d.genericName} ${d.strength ?? ''}`, unitPriceMinor: d.sellPriceMinor ?? 0, quantity: 1 }]; });
    } catch (err) { toast.push((err as Error).message, 'error'); }
    setCode(''); ref.current?.focus();
  };
  /** OTC sale dispenses stock and bills a walk-in visit; payment is then receipted against that bill. */
  const createSale = async () => {
    if (bill) return bill;
    const s = await api.post<{ bill: any }>('/pharmacy/otc', { items: cart.map(({ itemId, quantity }) => ({ itemId, quantity })), payerType: 'CASH' });
    setBill(s.bill); return s.bill;
  };
  const due = bill ? Math.max((bill.patientAmountMinor ?? bill.totalMinor) - (bill.paidMinor ?? 0), 0) : total;
  const payCash = async () => {
    setBusy(true);
    try { const b = await createSale(); await api.post('/payments/receipts', { billId: b.id, method: 'CASH', amountMinor: Math.max((b.patientAmountMinor ?? b.totalMinor) - (b.paidMinor ?? 0), 1) }); toast.push('Sale completed', 'success'); reset(); }
    catch (e) { toast.push((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const startMpesa = async () => { setBusy(true); try { await createSale(); } catch (e) { toast.push((e as Error).message, 'error'); } finally { setBusy(false); } };
  const reset = () => { setCart([]); setPay(''); setTendered(''); setBill(null); ref.current?.focus(); };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Cart" subtitle="Scan or type, then press Enter" className="lg:col-span-2" actions={cart.length > 0 && <span className="badge">{cart.reduce((a, l) => a + l.quantity, 0)} items</span>}>
        <form onSubmit={add} className="mb-3"><span className="input-icon"><Barcode /><input ref={ref} autoFocus className="input" placeholder="Scan a barcode or type an item name" value={code} onChange={(e) => setCode(e.target.value)} /></span></form>
        {cart.length ? <div className="tablewrap"><table className="t"><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th className="text-right">Total</th><th /></tr></thead><tbody>{cart.map((l, i) => <tr key={l.itemId}>
          <td><b>{l.name}</b></td><td>{money(l.unitPriceMinor)}</td>
          <td><span className="flex items-center gap-1"><button className="btn xs icon" aria-label="Less" onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}><Minus className="h-3 w-3" /></button><span className="w-7 text-center font-bold">{l.quantity}</span><button className="btn xs icon" aria-label="More" onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, quantity: x.quantity + 1 } : x))}><Plus className="h-3 w-3" /></button></span></td>
          <td className="text-right font-bold">{money(l.unitPriceMinor * l.quantity)}</td><td className="w-px"><button className="btn ghost xs icon" aria-label="Remove" onClick={() => setCart(cart.filter((_, j) => j !== i))}><Trash2 className="text-red-500" /></button></td></tr>)}</tbody></table></div>
          : <EmptyState icon={ShoppingCart} title="The cart is empty" message="Scan an item to start a sale." />}
      </Card>
      <Card title="Payment">
        <div className="hero-card mb-4 !p-5"><small className="muted block">Total to pay</small><b className="text-3xl font-extrabold">{money(total)}</b></div>
        <div className="mb-4 grid grid-cols-2 gap-2"><button className={pay === 'CASH' ? 'btn primary' : 'btn'} onClick={() => setPay('CASH')} disabled={!cart.length}><Banknote />Cash</button><button className={pay === 'MPESA' ? 'btn mpesa' : 'btn'} onClick={() => setPay('MPESA')} disabled={!cart.length}><Smartphone />M-Pesa</button></div>
        {pay === 'CASH' && <div className="space-y-3"><input className="input" type="number" placeholder="Enter amount tendered (KES)" value={tendered} onChange={(e) => setTendered(e.target.value)} />
          {Number(tendered) * 100 >= due && <p className="text-sm">Change: <b>{money(Number(tendered) * 100 - due)}</b></p>}
          <button className="btn primary w-full" disabled={busy || Number(tendered) * 100 < due} onClick={payCash}>{busy && <Spinner />}Complete sale</button></div>}
        {pay === 'MPESA' && (bill ? <MpesaStk amountMinor={due} body={{ billId: bill.id }} onSuccess={() => { toast.push('Sale completed', 'success'); setTimeout(reset, 1500); }} />
          : <button className="btn primary w-full" disabled={busy} onClick={startMpesa}>{busy && <Spinner />}Create sale & request M-Pesa</button>)}
        {cart.length > 0 && <button className="btn mt-3 w-full" onClick={reset}>Clear</button>}
      </Card>
    </div>
  );
}
