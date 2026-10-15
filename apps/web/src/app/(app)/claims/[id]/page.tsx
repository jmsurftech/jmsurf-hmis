'use client';
import { AlertCircle, AlertTriangle, Banknote, CheckCircle2, FileText, Gauge, Info, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { use } from 'react';
import { Table } from '@/components/DataTable';
import { Card, ErrorNote, KV, Loading, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime, fullName, money } from '@/lib/format';

const SEV = { ERROR: { icon: AlertCircle, cls: 'bad' }, WARNING: { icon: AlertTriangle, cls: 'warn' }, INFO: { icon: Info, cls: 'info' } } as const;

export default function ClaimDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, isLoading, error } = useGet<any>(`/claims/${id}`);
  const inv = { invalidate: ['/claims'] };
  const scrub = useAction('post', `/claims/${id}/scrub`, { ...inv, success: 'Scrub complete' });
  const submit = useAction('post', `/claims/${id}/submit`, { ...inv, success: 'Claim submitted' });
  const resubmit = useAction('post', `/claims/${id}/resubmit`, { ...inv, success: 'Claim resubmitted' });
  const refresh = useAction('post', `/claims/${id}/refresh-status`, { ...inv, success: 'Status refreshed' });
  if (isLoading) return <Loading />;
  if (error || !c) return <ErrorNote error={error ?? new Error('Claim not found')} />;
  const issues: any[] = c.scrubIssues ?? [];
  const blocking = issues.some((i) => i.severity === 'ERROR');
  const canSubmit = ['DRAFT', 'VALIDATED'].includes(c.status); const canResubmit = ['REJECTED', 'QUERIED'].includes(c.status);
  return (
    <div>
      <PageHeader eyebrow={<StatusBadge status={c.status} />} title={`Claim ${c.claimNumber ?? ''}`} subtitle={`${fullName(c.patient)} · ${c.payer?.name ?? ''}`} actions={<>
        <button className="btn" onClick={() => scrub.mutate({})} disabled={scrub.isPending}>{scrub.isPending ? <Spinner /> : <ShieldCheck className="h-4 w-4" />}Re-scrub</button>
        {canSubmit && <button className="btn primary" disabled={blocking || submit.isPending} title={blocking ? 'Fix errors first' : ''} onClick={() => submit.mutate({})}><Send className="h-4 w-4" />Submit</button>}
        {['SUBMITTED', 'IN_REVIEW'].includes(c.status) && <button className="btn" disabled={refresh.isPending} onClick={() => refresh.mutate({})}><RefreshCw className="h-4 w-4" />Refresh status</button>}
        {canResubmit && <button className="btn primary" disabled={blocking || resubmit.isPending} onClick={() => resubmit.mutate({})}><RefreshCw className="h-4 w-4" />Resubmit</button>}</>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Claimed" value={money(c.totalMinor)} icon={FileText} />
        <StatCard label="Approved" value={money(c.approvedMinor)} icon={CheckCircle2} tone="blue" />
        <StatCard label="Paid" value={money(c.paidMinor)} icon={Banknote} tone="green" />
        <StatCard label="Rejection risk" value={c.rejectionRisk != null ? `${Math.round(c.rejectionRisk * 100)}%` : '—'} icon={Gauge} tone={c.rejectionRisk > 0.4 ? 'red' : c.rejectionRisk > 0.15 ? 'amber' : 'green'} hint={blocking ? 'Fix the errors before submitting' : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Details"><KV items={[['SHA no.', c.patient?.shaNumber], ['Visit', c.visit?.visitNumber], ['Payer ref', c.externalRef], ['Rejection reason', c.rejectionReason]]} /></Card>
          <Card title={`Scrub issues (${issues.length})`}>
            {issues.length ? <ul className="m-0 list-none space-y-2 p-0">{issues.map((i, k) => { const s = SEV[(i.severity as keyof typeof SEV)] ?? SEV.INFO; return <li key={k} className={`alert ${s.cls} m-0`}><s.icon /><span><b>{i.code}</b> {i.message}{i.lineRef && <span className="block text-xs opacity-80">Line: {i.lineRef}</span>}</span></li>; })}</ul>
              : <div className="alert ok m-0"><ShieldCheck />No issues. This claim is clean and ready to submit.</div>}
          </Card>
          <Card title="Claim lines" flush><Table rows={c.lines ?? []} columns={[{ key: 'code', header: 'Code' }, { key: 'description', header: 'Description' }, { key: 'quantity', header: 'Qty' }, { key: 'amountMinor', header: 'Amount', render: (l: any) => money(l.amountMinor) }, { key: 'approvedMinor', header: 'Approved', render: (l: any) => money(l.approvedMinor) }]} /></Card>
        </div>
        <Card title="Timeline">
          <ol className="relative m-0 ml-2 list-none border-l-2 border-slate-200/70 p-0 dark:border-white/10">
            {(c.events ?? []).map((e: any) => <li key={e.id} className="mb-4 ml-4"><span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand shadow dark:border-[#1c1a1d]" /><p className="text-xs text-slate-500">{dateTime(e.createdAt)}</p><p className="text-sm font-medium">{e.fromStatus ? `${e.fromStatus.replace(/_/g, ' ')} → ` : ''}{e.toStatus.replace(/_/g, ' ')}</p>{e.note && <p className="text-xs text-slate-600 dark:text-slate-400">{e.note}</p>}</li>)}
            {!c.events?.length && <li className="ml-4 text-sm text-slate-500">No events yet</li>}
          </ol>
        </Card>
      </div>
    </div>
  );
}
