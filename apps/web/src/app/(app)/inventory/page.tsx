'use client';
import { AlertTriangle, CalendarX, PackagePlus, ArrowLeftRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { date, money } from '@/lib/format';

export default function Inventory() {
  const [tab, setTab] = useState('stock'); const [dlg, setDlg] = useState<'' | 'item' | 'grn' | 'transfer'>('');
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Items, stock levels, receipts and transfers" actions={<>
        <button className="btn-secondary" onClick={() => setDlg('item')}><Plus className="h-4 w-4" />Item</button>
        <button className="btn-secondary" onClick={() => setDlg('transfer')}><ArrowLeftRight className="h-4 w-4" />Transfer</button>
        <button className="btn-primary" onClick={() => setDlg('grn')}><PackagePlus className="h-4 w-4" />Receive (GRN)</button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'stock', label: 'Stock levels' }, { id: 'reorder', label: 'Reorder alerts' }, { id: 'expiry', label: 'Expiry alerts' }, { id: 'grn', label: 'Goods received' }, { id: 'transfers', label: 'Transfers' }]} />
      {tab === 'stock' && <DataTable path="/inventory/items" columns={[
        { key: 'code', header: 'Code' }, { key: 'name', header: 'Item' }, { key: 'category', header: 'Category' }, { key: 'unit', header: 'Unit' },
        { key: 'stockOnHand', header: 'On hand', className: 'text-right' }, { key: 'reorderLevel', header: 'Reorder lvl', className: 'text-right' },
        { key: 'costMinor', header: 'Unit cost', render: (i: any) => money(i.unitCostMinor ?? i.costMinor), className: 'text-right' },
        { key: 'st', header: 'Status', render: (i: any) => <StatusBadge status={(i.stockOnHand ?? 0) <= 0 ? 'OUT_OF_STOCK' : (i.stockOnHand ?? 0) <= (i.reorderLevel ?? 0) ? 'LOW' : 'NORMAL'} tone={(i.stockOnHand ?? 0) <= 0 ? 'red' : undefined} /> },
      ]} />}
      {tab === 'reorder' && <DataTable path="/inventory/alerts/reorder" emptyMessage="All items are above reorder level" columns={[
        { key: 'name', header: 'Item', render: (i: any) => <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{i.name ?? i.item?.name}</span> }, { key: 'store', header: 'Store', render: (i: any) => i.store?.name ?? '—' },
        { key: 'stockOnHand', header: 'On hand' }, { key: 'reorderLevel', header: 'Reorder level' }, { key: 'suggestedQty', header: 'Suggested order' }]} />}
      {tab === 'expiry' && <DataTable path="/inventory/alerts/expiry" query={{ days: 90 }} emptyMessage="No batches expiring in the next 90 days" columns={[
        { key: 'name', header: 'Item', render: (b: any) => <span className="flex items-center gap-2"><CalendarX className="h-4 w-4 text-red-500" />{b.item?.name ?? b.name}</span> }, { key: 'batchNumber', header: 'Batch' },
        { key: 'expiryDate', header: 'Expiry', render: (b: any) => date(b.expiryDate) }, { key: 'quantity', header: 'Qty' }, { key: 'store', header: 'Store', render: (b: any) => b.store?.name ?? '—' },
        { key: 'st', header: '', render: (b: any) => <StatusBadge status={new Date(b.expiryDate) < new Date() ? 'EXPIRED' : 'WARNING'} /> }]} />}
      {tab === 'grn' && <DataTable path="/inventory/grns" columns={[{ key: 'grnNumber', header: 'GRN' }, { key: 'supplier', header: 'Supplier', render: (g: any) => g.supplier?.name ?? '—' }, { key: 'poNumber', header: 'PO', render: (g: any) => g.purchaseOrder?.poNumber ?? '—' }, { key: 'receivedAt', header: 'Received', render: (g: any) => date(g.receivedAt ?? g.createdAt) }, { key: 'totalMinor', header: 'Value', render: (g: any) => money(g.totalMinor) }, { key: 'status', header: 'Status', render: (g: any) => <StatusBadge status={g.status} /> }]} />}
      {tab === 'transfers' && <DataTable path="/inventory/transfers" columns={[{ key: 'transferNumber', header: 'No.' }, { key: 'from', header: 'From', render: (t: any) => t.fromStore?.name ?? '—' }, { key: 'to', header: 'To', render: (t: any) => t.toStore?.name ?? '—' }, { key: 'createdAt', header: 'Date', render: (t: any) => date(t.createdAt) }, { key: 'status', header: 'Status', render: (t: any) => <StatusBadge status={t.status} /> }]} />}
      <FormDialog open={dlg === 'item'} onClose={() => setDlg('')} title="New item" path="/inventory/items" fields={[{ name: 'code', label: 'Code' }, { name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', type: 'select', options: ['DRUG', 'CONSUMABLE', 'REAGENT', 'NON_MEDICAL'] }, { name: 'unit', label: 'Unit of issue' }, { name: 'barcode', label: 'Barcode' }, { name: 'reorderLevel', label: 'Reorder level', type: 'number' }, { name: 'unitCost', label: 'Unit cost (KES)', type: 'money' }, { name: 'sellingPrice', label: 'Selling price (KES)', type: 'money' }]} />
      <FormDialog open={dlg === 'grn'} onClose={() => setDlg('')} title="Goods received note" path="/inventory/grns" invalidate={['/inventory']} transform={(v) => ({ supplierId: v.supplierId, purchaseOrderId: v.purchaseOrderId, storeId: v.storeId, deliveryNote: v.deliveryNote, lines: [{ itemId: v.itemId, quantity: v.quantity, batchNumber: v.batchNumber, expiryDate: v.expiryDate, unitCostMinor: v.unitCostMinor }] })}
        fields={[{ name: 'supplierId', label: 'Supplier ID', required: true }, { name: 'purchaseOrderId', label: 'PO ID' }, { name: 'storeId', label: 'Receiving store ID', required: true }, { name: 'deliveryNote', label: 'Delivery note no.' }, { name: 'itemId', label: 'Item ID', required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'batchNumber', label: 'Batch no.' }, { name: 'expiryDate', label: 'Expiry', type: 'date' }, { name: 'unitCost', label: 'Unit cost (KES)', type: 'money' }]} />
      <FormDialog open={dlg === 'transfer'} onClose={() => setDlg('')} title="Stock transfer" path="/inventory/transfers" invalidate={['/inventory']} transform={(v) => ({ fromStoreId: v.fromStoreId, toStoreId: v.toStoreId, notes: v.notes, lines: [{ itemId: v.itemId, quantity: v.quantity }] })}
        fields={[{ name: 'fromStoreId', label: 'From store ID', required: true }, { name: 'toStoreId', label: 'To store / facility ID', required: true }, { name: 'itemId', label: 'Item ID', required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />
    </div>
  );
}
