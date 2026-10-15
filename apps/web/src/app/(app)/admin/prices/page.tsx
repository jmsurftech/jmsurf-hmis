'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge, Tabs } from '@/components/ui';
import { date, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';
export default function Prices() {
  const [tab, setTab] = useState('items');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: 'Service items' }, { id: 'lists', label: 'Price lists' }]} />;
  if (tab === 'lists') return <CrudPage title="Price lists & service items" path="/pricing/price-lists" createLabel="New price list" searchable={false} columns={[{ key: 'name', header: 'Name' }, { key: 'payerType', header: 'Applies to' }, { key: 'validFrom', header: 'Valid from', render: (p: any) => date(p.validFrom) }, { key: 'items', header: 'Items', render: (p: any) => p._count?.items ?? p.items?.length ?? '—' }, { key: 'isDefault', header: 'Default', render: (p: any) => p.isDefault ? <StatusBadge status="DEFAULT" tone="green" /> : '' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'payerType', label: 'Payer type', type: 'select', options: ['CASH', 'SHA', 'INSURANCE', 'CORPORATE'], required: true }, { name: 'schemeId', label: 'Scheme', type: 'picker', source: PICK.scheme }, { name: 'isDefault', label: 'Default list', type: 'checkbox' }]}>{tabs}</CrudPage>;
  return <CrudPage title="Price lists & service items" path="/pricing/service-items" createLabel="New service item" columns={[
    { key: 'code', header: 'Code' }, { key: 'name', header: 'Name' }, { key: 'category', header: 'Category' }, { key: 'shaInterventionCode', header: 'SHA code' }, { key: 'basePriceMinor', header: 'Cash price', render: (s: any) => money(s.basePriceMinor), className: 'text-right' }, { key: 'active', header: 'Status', render: (s: any) => <StatusBadge status={s.active === false ? 'INACTIVE' : 'ACTIVE'} /> }]}
    transform={(v) => ({ ...v, vatRate: v.vatable ? 0.16 : 0, vatable: undefined })}
    fields={[{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', type: 'select', options: ['CONSULTATION', 'LAB', 'IMAGING', 'PROCEDURE', 'BED', 'NURSING', 'THEATRE', 'OTHER'], required: true }, { name: 'shaInterventionCode', label: 'SHA intervention code' }, { name: 'basePrice', label: 'Cash price (KES)', type: 'money', required: true }, { name: 'vatable', label: 'VAT applicable (16%)', type: 'checkbox' }]}>{tabs}</CrudPage>;
}
