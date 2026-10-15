'use client';
import { AlertCircle, AlertTriangle, Info, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { use } from 'react';
import { Table } from '@/components/DataTable';
import { Card, ErrorNote, KV, Loading, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime, fullName, money } from '@/lib/format';

const SEV = { ERROR: { icon: AlertCircle, cls: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300' }, WARNING: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300' }, INFO: { icon: Info, cls: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300' } } as const;

export default function ClaimDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, isLoading, error } = useGet<any>(`/claims/${id}`);
  const inv = { invalidate: ['/claims'] };
  const scrub = useAction('post', `/claims/${id}/scrub`, { ...inv, success: 'Scrub complete' });
  const submit = useAction('post', `/claims/${id}/submit`, { ...inv, success: 'Claim submitted' });
  const resubmit = useAction('post', `/claims/${id}/resubmit`, { ...inv, success: 'Claim resubmitted' });
  if (isLoading) return <Loading />;
  if (error || !c) return <ErrorNote error={error ?? new Error('Claim not found')} />;
  const issues: any[] = c.scrubIssues ?? c.issues ?? [];
  const blocking = issues.some((i) => i.severity === 'ERROR');
  const canSubmit = ['DRAFT', 'READY'].includes(c.status); const canResubmit = ['REJECTED', 'QUERIED'].includes(c.status);
  return (
    <div>
      <PageHeader title={`Claim ${c.claimNumber ?? ''}`} subtitle={`${fullName(c.patient)} · ${c.payer?.name ?? c.payerType ?? ''}`} actions={<>
        <button className="btn-secondary" onClick={() => scrub.mutate({})} disabled={scrub.isPending}>{scrub.isPending ? <Spinner /> : <ShieldCheck className="h-4 w-4" />}Re-scrub</button>
        {canSubmit && <button className="btn-primary" disabled={blocking || submit.isPending} title={blocking ? 'Fix errors first' : ''} onClick={() => submit.mutate({})}><Send className="h-4 w-4" />Submit</button>}
        {canResubmit && <button className="btn-primary" disabled={blocking || resubmit.isPending} onClick={() => resubmit.mutate({})}><RefreshCw className="h-4 w-4" />Resubmit</button>}</>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><KV items={[['Status', <StatusBadge key="s" status={c.status} />], ['Claimed', money(c.amountMinor ?? c.claimedMinor)], ['Approved', money(c.approvedMinor)], ['Paid', money(c.paidMinor)], ['Member no.', c.memberNumber ?? c.cover?.memberNumber], ['Pre-auth', c.preauthNumber], ['Visit', c.visit?.visitNumber], ['Payer ref', c.externalRef ?? c.payerReference], ['Diagnoses', (c.diagnoses ?? []).map((d: any) => d.code).join(', ')]]} /></Card>
          <Card title={`Scrub issues (${issues.length})`}>
            {issues.length ? <ul className="space-y-2">{issues.map((i, k) => { const s = SEV[(i.severity as keyof typeof SEV)] ?? SEV.INFO; return <li key={k} className={`flex gap-2 rounded-lg border p-2 text-sm ${s.cls}`}><s.icon className="mt-0.5 h-4 w-4 shrink-0" /><span><b>{i.code ?? i.rule}</b> {i.message}{i.field && <span className="block text-xs opacity-80">Field: {i.field}</span>}</span></li>; })}</ul>
              : <p className="flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" />No issues. Claim is clean.</p>}
          </Card>
          <Card title="Claim lines"><Table rows={c.lines ?? c.items ?? []} columns={[{ key: 'code', header: 'Code', render: (l: any) => l.code ?? l.serviceCode }, { key: 'description', header: 'Description' }, { key: 'quantity', header: 'Qty' }, { key: 'amountMinor', header: 'Amount', render: (l: any) => money(l.amountMinor ?? l.totalMinor) }, { key: 'status', header: 'Status', render: (l: any) => <StatusBadge status={l.status} /> }]} /></Card>
        </div>
        <Card title="Timeline">
          <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-700">
            {(c.events ?? []).map((e: any) => <li key={e.id} className="mb-4 ml-4"><span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary-500 dark:border-slate-900" /><p className="text-xs text-slate-500">{dateTime(e.createdAt ?? e.at)}</p><p className="text-sm font-medium">{(e.type ?? e.status ?? '').replace(/_/g, ' ')}</p>{e.message && <p className="text-xs text-slate-600 dark:text-slate-400">{e.message}</p>}</li>)}
            {!c.events?.length && <li className="ml-4 text-sm text-slate-500">No events yet</li>}
          </ol>
        </Card>
      </div>
    </div>
  );
}
