'use client';
import { AlertTriangle, ArrowLeftRight, CalendarX, PackagePlus, Plus, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { date, dateTime, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';
import { StockForecast } from '@/components/StockForecast';

export default function Inventory() {
  const [tab, setTab] = useState('stock'); const [dlg, setDlg] = useState<'' | 'item' | 'grn' | 'transfer' | 'store'>('');
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Items, stock levels, receipts and transfers" actions={<>
        <button className="btn-secondary" onClick={() => setDlg('store')}><Warehouse className="h-4 w-4" />Store</button>
        <button className="btn-secondary" onClick={() => setDlg('item')}><Plus className="h-4 w-4" />Item</button>
        <button className="btn-secondary" onClick={() => setDlg('transfer')}><ArrowLeftRight className="h-4 w-4" />Transfer</button>
        <button className="btn-primary" onClick={() => setDlg('grn')}><PackagePlus className="h-4 w-4" />Receive (GRN)</button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'stock', label: 'Stock levels' }, { id: 'items', label: 'Item master' }, { id: 'reorder', label: 'Reorder alerts' }, { id: 'forecast', label: 'Demand forecast' }, { id: 'expiry', label: 'Expiry alerts' }, { id: 'movements', label: 'Movements' }, { id: 'stores', label: 'Stores' }]} />
      {tab === 'stock' && <DataTable path="/inventory/levels" columns={[
        { key: 'code', header: 'Code' }, { key: 'name', header: 'Item' }, { key: 'store', header: 'Store' }, { key: 'unit', header: 'Unit' },
        { key: 'quantity', header: 'On hand', className: 'text-right' }, { key: 'reorderLevel', header: 'Reorder lvl', className: 'text-right' },
        { key: 'nearestExpiry', header: 'Nearest expiry', render: (i: any) => date(i.nearestExpiry) },
        { key: 'st', header: 'Status', render: (i: any) => <StatusBadge status={i.quantity <= 0 ? 'OUT_OF_STOCK' : i.belowReorder ? 'LOW' : 'NORMAL'} tone={i.quantity <= 0 ? 'red' : undefined} /> },
      ]} />}
      {tab === 'items' && <DataTable path="/inventory/items" columns={[
        { key: 'code', header: 'Code' }, { key: 'name', header: 'Item', render: (i: any) => `${i.name} ${i.strength ?? ''}` }, { key: 'category', header: 'Category' }, { key: 'unit', header: 'Unit' },
        { key: 'sellPriceMinor', header: 'Sell price', render: (i: any) => money(i.sellPriceMinor), className: 'text-right' }, { key: 'reorderLevel', header: 'Reorder lvl', className: 'text-right' },
        { key: 'active', header: 'Status', render: (i: any) => <StatusBadge status={i.active ? 'ACTIVE' : 'INACTIVE'} /> }]} />}
      {tab === 'reorder' && <DataTable path="/inventory/reorder-alerts" searchable={false} emptyMessage="All items are above reorder level" columns={[
        { key: 'name', header: 'Item', render: (i: any) => <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{i.name}</span> }, { key: 'code', header: 'Code' },
        { key: 'onHand', header: 'On hand' }, { key: 'reorderLevel', header: 'Reorder level' }, { key: 'suggestedOrder', header: 'Suggested order' }]} />}
      {tab === 'forecast' && <StockForecast />}
      {tab === 'expiry' && <DataTable path="/inventory/expiry-report" searchable={false} query={{ days: 90 }} emptyMessage="No batches expiring in the next 90 days" columns={[
        { key: 'name', header: 'Item', render: (b: any) => <span className="flex items-center gap-2"><CalendarX className="h-4 w-4 text-red-500" />{b.item?.name}</span> }, { key: 'batchNo', header: 'Batch' },
        { key: 'expiryDate', header: 'Expiry', render: (b: any) => date(b.expiryDate) }, { key: 'quantity', header: 'Qty' }, { key: 'valueMinor', header: 'Value', render: (b: any) => money(b.valueMinor) },
        { key: 'st', header: '', render: (b: any) => <StatusBadge status={b.expired ? 'EXPIRED' : 'WARNING'} /> }]} />}
      {tab === 'movements' && <DataTable path="/inventory/movements" searchable={false} columns={[{ key: 'createdAt', header: 'Time', render: (m: any) => dateTime(m.createdAt) }, { key: 'type', header: 'Type' }, { key: 'quantity', header: 'Qty' }, { key: 'reference', header: 'Reference' }]} />}
      {tab === 'stores' && <DataTable path="/inventory/stores" searchable={false} columns={[{ key: 'name', header: 'Store' }, { key: 'type', header: 'Type' }]} />}
      <FormDialog open={dlg === 'store'} onClose={() => setDlg('')} title="New store" path="/inventory/stores" invalidate={['/inventory']} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['MAIN', 'PHARMACY', 'WARD', 'LAB', 'THEATRE'] }]} />
      <FormDialog open={dlg === 'item'} onClose={() => setDlg('')} title="New item" path="/inventory/items" invalidate={['/inventory']} fields={[{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true }, { name: 'genericName', label: 'Generic name' }, { name: 'strength', label: 'Strength' }, { name: 'form', label: 'Form' }, { name: 'category', label: 'Category', type: 'select', options: ['DRUG', 'CONSUMABLE', 'REAGENT', 'NON_MEDICAL', 'IMPLANT'] }, { name: 'unit', label: 'Unit of issue' }, { name: 'barcode', label: 'Barcode' }, { name: 'reorderLevel', label: 'Reorder level', type: 'number' }, { name: 'sellPrice', label: 'Selling price (KES)', type: 'money' }, { name: 'isControlled', label: 'Controlled drug', type: 'checkbox' }]}
        transform={(v) => ({ ...v, reorderLevel: v.reorderLevel !== undefined ? Number(v.reorderLevel) : undefined })} />
      <FormDialog open={dlg === 'grn'} onClose={() => setDlg('')} title="Goods received note" path="/inventory/receive" invalidate={['/inventory']} success="Stock received"
        transform={(v) => ({ storeId: v.storeId, reference: v.reference, lines: [{ itemId: v.itemId, quantity: Number(v.quantity), batchNo: v.batchNo, expiryDate: v.expiryDate || undefined, unitCostMinor: v.unitCostMinor }] })}
        fields={[{ name: 'storeId', label: 'Receiving store', type: 'picker', source: PICK.store, required: true }, { name: 'reference', label: 'Delivery note / invoice no.' }, { name: 'itemId', label: 'Item', type: 'picker', source: PICK.stockItem, required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'batchNo', label: 'Batch no.', required: true }, { name: 'expiryDate', label: 'Expiry', type: 'date' }, { name: 'unitCost', label: 'Unit cost (KES)', type: 'money' }]} />
      <FormDialog open={dlg === 'transfer'} onClose={() => setDlg('')} title="Stock transfer" path="/inventory/transfers" invalidate={['/inventory']} success="Stock transferred"
        transform={(v) => ({ fromStoreId: v.fromStoreId, toStoreId: v.toStoreId, reference: v.reference, lines: [{ itemId: v.itemId, quantity: Number(v.quantity) }] })}
        fields={[{ name: 'fromStoreId', label: 'From store', type: 'picker', source: PICK.store, required: true }, { name: 'toStoreId', label: 'To store', type: 'picker', source: PICK.store, required: true }, { name: 'itemId', label: 'Item', type: 'picker', source: PICK.stockItem, required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'reference', label: 'Reference' }]} />
    </div>
  );
}
