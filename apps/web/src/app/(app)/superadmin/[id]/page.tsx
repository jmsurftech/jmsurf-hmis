'use client';
import { LogIn } from 'lucide-react';
import { use, useEffect, useState } from 'react';
import { Table } from '@/components/DataTable';
import { Card, ErrorNote, Field, KV, Loading, Modal, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/ui';
import { api, tokenStore } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date, dateTime, money, toMinor } from '@/lib/format';
import { STATUS_TONE } from '@/components/Security';

export default function TenantDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: t, isLoading, error } = useGet<any>(`/superadmin/tenants/${id}`);
  const [form, setForm] = useState<any>(null); const [imp, setImp] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (t) setForm({ plan: t.plan, subscriptionStatus: t.subscriptionStatus, enabledModules: t.enabledModules, trialEndsAt: t.trialEndsAt?.slice(0, 10) ?? '', custom: ((t.settings?.customMonthlyMinor ?? 0) / 100).toString() }); }, [t]);
  const save = useAction('patch', `/superadmin/tenants/${id}`, { success: 'Tenant updated', invalidate: ['/superadmin'] });
  const markPaid = useAction<string>('post', (iid) => `/superadmin/invoices/${iid}/mark-paid`, { success: 'Marked paid', invalidate: ['/superadmin'] });
  if (isLoading || !form) return error ? <ErrorNote error={error} /> : <Loading />;
  const impersonate = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ accessToken: string }>(`/superadmin/tenants/${id}/impersonate`, { reason });
      localStorage.setItem('jmsurf.superadmin.token', tokenStore.get() ?? '');
      const rt = tokenStore.getRefresh(); if (rt) localStorage.setItem('jmsurf.superadmin.refresh', rt);
      tokenStore.set(r.accessToken); tokenStore.setRefresh(null); localStorage.removeItem('jmsurf.facility');
      window.location.href = '/dashboard';
    } catch (e) { alert((e as Error).message); setBusy(false); }
  };
  const toggle = (m: string) => setForm({ ...form, enabledModules: form.enabledModules.includes(m) ? form.enabledModules.filter((x: string) => x !== m) : [...form.enabledModules, m] });
  return (
    <div>
      <PageHeader title={t.name} subtitle={`${t.slug} · ${t.countryCode} · created ${date(t.createdAt)}`} actions={<button className="btn-primary bg-purple-700 hover:bg-purple-800" onClick={() => setImp(true)}><LogIn className="h-4 w-4" />Impersonate</button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Patients" value={t.usage.patients} /><StatCard label="Visits this month" value={t.usage.visitsThisMonth} tone="blue" />
        <StatCard label="Users" value={t.usage.users} /><StatCard label="Storage rows" value={t.usage.storageRows.toLocaleString()} />
        <StatCard label="Est. this month" value={money(t.estimate.amountMinor)} tone="green" hint={`${money(t.estimate.baseMinor)} + ${t.estimate.visits} × ${money(t.estimate.perVisitMinor)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Plan & status">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan"><select className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{['CLINIC', 'HOSPITAL', 'ENTERPRISE'].map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Status"><select className="input" value={form.subscriptionStatus} onChange={(e) => setForm({ ...form, subscriptionStatus: e.target.value })}>{Object.keys(STATUS_TONE).map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Trial ends"><input className="input" type="date" value={form.trialEndsAt} onChange={(e) => setForm({ ...form, trialEndsAt: e.target.value })} /></Field>
            {form.plan === 'ENTERPRISE' && <Field label="Custom monthly fee (KES)"><input className="input" type="number" value={form.custom} onChange={(e) => setForm({ ...form, custom: e.target.value })} /></Field>}
          </div>
          <p className="label mt-4">Enabled modules</p>
          <div className="mb-4 flex flex-wrap gap-2">{t.allModules.map((m: string) => <label key={m} className="flex items-center gap-1 rounded border px-2 py-1 text-xs dark:border-slate-700"><input type="checkbox" checked={form.enabledModules.includes(m)} onChange={() => toggle(m)} />{m}</label>)}</div>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ plan: form.plan, subscriptionStatus: form.subscriptionStatus, enabledModules: form.enabledModules, trialEndsAt: form.trialEndsAt ? new Date(form.trialEndsAt).toISOString() : undefined, customMonthlyMinor: form.plan === 'ENTERPRISE' ? toMinor(form.custom || 0) : undefined })}>{save.isPending && <Spinner />}Save</button>
        </Card>
        <Card title="Administrators">
          <Table rows={t.admins} columns={[{ key: 'email', header: 'Email' }, { key: 'mfa', header: 'MFA', render: (a: any) => <StatusBadge status={a.mfaEnabled ? 'ON' : 'OFF'} tone={a.mfaEnabled ? 'green' : 'amber'} /> }, { key: 'last', header: 'Last login', render: (a: any) => dateTime(a.lastLoginAt) }]} />
          <div className="mt-4"><KV items={[['Facilities', t.facilities.map((f: any) => f.name).join(', ')], ['Currency', t.currency], ['MFA required', t.settings?.mfaRequired ? 'Yes' : 'No']]} /></div>
        </Card>
        <Card title="Subscription invoices" className="lg:col-span-2">
          <Table rows={t.invoices} empty="No invoices yet" columns={[
            { key: 'number', header: 'Invoice' }, { key: 'period', header: 'Period' }, { key: 'visits', header: 'Visits' },
            { key: 'amountMinor', header: 'Amount', render: (i: any) => money(i.amountMinor) }, { key: 'dueDate', header: 'Due', render: (i: any) => date(i.dueDate) },
            { key: 'status', header: 'Status', render: (i: any) => <StatusBadge status={i.status} tone={i.status === 'PAID' ? 'green' : 'amber'} /> },
            { key: 'a', header: '', render: (i: any) => i.status !== 'PAID' && <button className="btn-secondary py-1 text-xs" onClick={() => markPaid.mutate(i.id)}>Mark paid</button> },
          ]} />
        </Card>
      </div>
      <Modal open={imp} onClose={() => setImp(false)} title={`Impersonate ${t.name}`} footer={<><button className="btn-secondary" onClick={() => setImp(false)}>Cancel</button><button className="btn-primary" disabled={reason.length < 10 || busy} onClick={impersonate}>{busy && <Spinner />}Start 30-minute session</button></>}>
        <p className="mb-3 text-sm text-slate-500">You will sign in as this tenant's first administrator for 30 minutes. The tenant's audit log records the session and your reason.</p>
        <Field label="Reason / support ticket"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
