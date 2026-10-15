'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge, Tabs } from '@/components/ui';
export default function Payers() {
  const [tab, setTab] = useState('payers');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'payers', label: 'Payers' }, { id: 'schemes', label: 'Schemes' }]} />;
  if (tab === 'schemes') return <CrudPage title="Payers & schemes" path="/payers/schemes" createLabel="New scheme" columns={[{ key: 'name', header: 'Scheme' }, { key: 'payer', header: 'Payer', render: (s: any) => s.payer?.name ?? '—' }, { key: 'copayPercent', header: 'Co-pay %' }, { key: 'requiresPreauth', header: 'Pre-auth', render: (s: any) => s.requiresPreauth ? 'Required' : '—' }, { key: 'active', header: 'Status', render: (s: any) => <StatusBadge status={s.active === false ? 'INACTIVE' : 'ACTIVE'} /> }]}
    fields={[{ name: 'payerId', label: 'Payer ID', required: true }, { name: 'name', label: 'Scheme name', required: true }, { name: 'code', label: 'Code' }, { name: 'copayPercent', label: 'Co-pay %', type: 'number' }, { name: 'annualLimit', label: 'Annual limit (KES)', type: 'money' }, { name: 'requiresPreauth', label: 'Requires pre-authorisation', type: 'checkbox' }]}>{tabs}</CrudPage>;
  return <CrudPage title="Payers & schemes" path="/payers" createLabel="New payer" columns={[{ key: 'name', header: 'Payer' }, { key: 'type', header: 'Type' }, { key: 'code', header: 'Code' }, { key: 'integration', header: 'Integration', render: (p: any) => p.integration ?? p.adapter ?? '—' }, { key: 'creditDays', header: 'Credit days' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['SHA', 'INSURANCE', 'CORPORATE', 'NGO', 'GOVERNMENT'], required: true }, { name: 'code', label: 'Code' }, { name: 'integration', label: 'Integration', type: 'select', options: ['NONE', 'SHA_HIE', 'SMART', 'SLADE360', 'EMAIL'] }, { name: 'creditDays', label: 'Credit days', type: 'number' }, { name: 'email', label: 'Claims email', type: 'email' }]}>{tabs}</CrudPage>;
}
