'use client';
import { CalendarPlus, PauseCircle, PlayCircle, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Card, Drawer, Field, KV, Loading, Modal, PageHeader, Seg, StatusBadge, humanize } from '@/components/ui';
import { useConfirm } from '@/components/Toast';
import { date, dateTime, money } from '@/lib/format';
import { useAction, useGet } from '@/lib/hooks';
import { PLANS, SUB_STATUSES, daysLeft } from '@/lib/platform';

const FILTERS = [{ id: '', label: 'All' }, { id: 'TRIAL', label: 'Trial' }, { id: 'TRIAL_ENDING', label: 'Ending soon' }, { id: 'ACTIVE', label: 'Active' }, { id: 'READ_ONLY', label: 'Read-only' }, { id: 'SUSPENDED', label: 'Suspended' }];

function Status({ t }: { t: any }) {
  if (t.suspendedAt) return <StatusBadge status="SUSPENDED" tone="red" />;
  const n = t.subscriptionStatus === 'TRIAL' ? daysLeft(t.trialEndsAt) : null;
  return <span className="flex flex-wrap items-center gap-1.5"><StatusBadge status={t.subscriptionStatus} />{n != null && <small className={n <= 3 ? 'font-semibold text-red-600' : 'text-slate-500'}>{n <= 0 ? 'ended' : `${n}d left`}</small>}</span>;
}

function TenantDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: t, isLoading } = useGet<any>(`/platform/tenants/${id}`); const confirm = useConfirm();
  const [plan, setPlan] = useState(''); const [status, setStatus] = useState(''); const [days, setDays] = useState('14');
  const [suspending, setSuspending] = useState(false); const [reason, setReason] = useState('');
  useEffect(() => { if (t) { setPlan(t.plan); setStatus(t.subscriptionStatus); } }, [t]);
  const save = useAction('patch', `/platform/tenants/${id}`, { invalidate: ['/platform'], success: 'Tenant updated', onSuccess: () => { setSuspending(false); setReason(''); } });
  const u = t?.usage ?? {};
  return (
    <Drawer open onClose={onClose} title={t?.name ?? 'Tenant'} subtitle={t ? `${t.slug} · joined ${date(t.createdAt)}` : undefined} actions={t && <Status t={t} />}>
      {isLoading || !t ? <Loading /> : <div className="space-y-4">
        {t.suspendedAt && <div className="alert bad"><PauseCircle />Suspended {dateTime(t.suspendedAt)}: {t.suspendReason}</div>}
        <div className="grid grid-cols-3 gap-2 text-center">{([['Visits (30d)', u.visits30d], ['Users', u.users], ['Beds', u.beds], ['Patients', u.patients], ['Facilities', u.facilities], ['Paid in (30d)', money(t.payments30d.amountMinor, t.currency)]] as [string, React.ReactNode][]).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-slate-200/70 p-3 dark:border-white/10"><b className="block text-lg">{v ?? 0}</b><small className="text-slate-500">{k}</small></div>))}</div>
        <Card title="Subscription">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan"><select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>{PLANS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</select></Field>
            <Field label="Status"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{SUB_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></Field>
          </div>
          <button className="btn primary mt-3" disabled={save.isPending || (plan === t.plan && status === t.subscriptionStatus)} onClick={() => save.mutate({ plan: plan !== t.plan ? plan : undefined, subscriptionStatus: status !== t.subscriptionStatus ? status : undefined })}><Save />Save plan and status</button>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200/70 pt-4 dark:border-white/10">
            <Field label={`Extend trial (ends ${date(t.trialEndsAt)})`}><select className="input" value={days} onChange={(e) => setDays(e.target.value)}>{[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select></Field>
            <button className="btn" disabled={save.isPending} onClick={() => save.mutate({ extendTrialDays: Number(days) })}><CalendarPlus />Extend trial</button>
          </div>
        </Card>
        <Card title="Details"><KV items={[['Billing model', humanize(t.billingModel)], ['Country', t.countryCode], ['Currency', t.currency], ['KRA PIN', t.kraPin], ['Facilities', t.facilities.map((f: any) => `${f.name}${f.kmhflCode ? ` (${f.kmhflCode})` : ''}`).join(', ')], ['Last staff sign-in', dateTime(u.lastLoginAt)]]} /></Card>
        <Card title={`Users (${t.users.length})`} flush><ul className="divide-y divide-slate-200/70 dark:divide-white/10">{t.users.map((x: any) => (
          <li key={x.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm"><span className="min-w-0"><b className="block truncate">{x.firstName} {x.lastName}</b><small className="text-slate-500">{x.email} · {x.roles.map(humanize).join(', ')}</small></span><small className="shrink-0 text-slate-500">{x.lastLoginAt ? dateTime(x.lastLoginAt) : 'Never signed in'}</small></li>))}</ul></Card>
        <Card title="Recent activity" flush>{t.audit.length ? <ul className="divide-y divide-slate-200/70 text-sm dark:divide-white/10">{t.audit.map((a: any) => <li key={a.id} className="flex justify-between gap-2 px-5 py-2"><span>{humanize(a.action)} <span className="text-slate-500">{a.entity}</span></span><small className="text-slate-500">{dateTime(a.createdAt)}</small></li>)}</ul> : <p className="p-5 text-sm text-slate-500">No activity yet.</p>}</Card>
        <div className="flex justify-end">{t.suspendedAt
          ? <button className="btn ok" disabled={save.isPending} onClick={async () => { if (await confirm({ title: 'Resume this tenant?', message: 'Staff and patients can sign in again.', confirm: 'Resume' })) save.mutate({ suspended: false }); }}><PlayCircle />Resume tenant</button>
          : <button className="btn danger" disabled={save.isPending} onClick={() => setSuspending(true)}><PauseCircle />Suspend tenant</button>}</div>
        <Modal open={suspending} onClose={() => setSuspending(false)} title={`Suspend ${t.name}?`} subtitle="Staff and patients are locked out until you resume it."
          footer={<><button className="btn" onClick={() => setSuspending(false)}>Cancel</button><button className="btn danger" disabled={!reason.trim() || save.isPending} onClick={() => save.mutate({ suspended: true, reason })}><PauseCircle />Suspend</button></>}>
          <Field label="Reason" hint="Shown in the platform audit log."><textarea className="input" rows={3} placeholder="Enter the reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      </div>}
    </Drawer>
  );
}

export default function TenantsPage() {
  const [status, setStatus] = useState(''); const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const s = new URLSearchParams(window.location.search); if (s.get('status')) setStatus(s.get('status')!); if (s.get('open')) setOpen(s.get('open')); }, []);
  return (
    <div>
      <PageHeader title="Tenants" subtitle="Hospitals and clinics on the platform. Open one to change its plan, extend a trial or suspend it." />
      <div className="mb-4 overflow-x-auto"><Seg options={FILTERS} value={status} onChange={setStatus} /></div>
      <DataTable path="/platform/tenants" query={{ status }} searchPlaceholder="Search by name or admin email" exportName="tenants" onRowClick={(r: any) => setOpen(r.id)}
        emptyTitle="No tenants match" emptyMessage="Hospitals appear here when they sign up."
        columns={[
          { key: 'name', header: 'Tenant', render: (r: any) => <span className="min-w-0"><b className="block">{r.name}</b><small className="text-slate-500">{r.owner?.email ?? r.slug}</small></span>, csv: (r: any) => r.name },
          { key: 'plan', header: 'Plan', render: (r: any) => <span className="badge">{humanize(r.plan)}{r.billingModel === 'PER_VISIT' ? ' · per visit' : ''}</span>, csv: (r: any) => r.plan },
          { key: 'subscriptionStatus', header: 'Subscription', render: (r: any) => <Status t={r} />, csv: (r: any) => (r.suspendedAt ? 'SUSPENDED' : r.subscriptionStatus) },
          { key: 'trialEndsAt', header: 'Trial ends', render: (r: any) => date(r.trialEndsAt), csv: (r: any) => r.trialEndsAt },
          { key: 'usage.visits30d', header: 'Visits (30d)', className: 'text-right', csv: (r: any) => r.usage?.visits30d },
          { key: 'usage.users', header: 'Users', className: 'text-right', csv: (r: any) => r.usage?.users },
          { key: 'usage.beds', header: 'Beds', className: 'text-right', csv: (r: any) => r.usage?.beds },
          { key: 'createdAt', header: 'Joined', render: (r: any) => date(r.createdAt), csv: (r: any) => r.createdAt },
        ]} />
      {open && <TenantDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
