'use client';
import { Download, History, Pencil, Plus, Printer, Receipt, Save } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { EntityPicker } from '@/components/EntityPicker';
import { useToast } from '@/components/Toast';
import { Card, Drawer, EmptyState, Field, humanize, KV, Modal, PageHeader, Spinner, StatCard, StatusBadge, statusTone } from '@/components/ui';
import { api, downloadCsv } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { date, dateTime, fullName } from '@/lib/format';
import { useGet } from '@/lib/hooks';
import { PICK } from '@/lib/pickers';
import { REGISTER_BY_KEY, type RegField, type RegisterConfig } from '@/lib/registers';
import { useQueryClient } from '@tanstack/react-query';

const fmt = (f: RegField, v: unknown) => {
  if (v === undefined || v === null || v === '') return null;
  if (f.type === 'date') return date(String(v));
  if (f.type === 'datetime-local') return dateTime(String(v));
  if (f.type === 'checkbox') return v ? 'Yes' : 'No';
  return `${v}${f.unit ? ` ${f.unit}` : ''}`;
};

export default function RegisterPage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = use(params);
  const cfg = REGISTER_BY_KEY[module];
  if (!cfg) notFound();
  return <Register cfg={cfg} />;
}

function Register({ cfg }: { cfg: RegisterConfig }) {
  const { hasRole } = useAuth();
  const [status, setStatus] = useState(''); const [creating, setCreating] = useState(false); const [openId, setOpenId] = useState<string | null>(null);
  const summary = useGet<{ byStatus: Record<string, number>; total: number; thisMonth: number }>(`/records/${cfg.key}/summary`);
  const s = summary.data;
  const active = cfg.active.reduce((n, st) => n + (s?.byStatus?.[st] ?? 0), 0);
  const last = cfg.statuses.find((x) => !cfg.active.includes(x)) ?? cfg.statuses[cfg.statuses.length - 1];
  const fieldBy = Object.fromEntries(cfg.fields.map((f) => [f.name, f]));
  if (!hasRole(...cfg.roles)) return <EmptyState title="You do not have access to this register" message="Ask an administrator to add the right role to your account." />;
  const columns = [
    { key: 'number', header: 'Number', render: (r: any) => <b>{r.number}</b> },
    ...(cfg.patient ? [{ key: 'patient', header: 'Patient', render: (r: any) => r.patient ? <span><b className="block">{fullName(r.patient)}</b><small className="text-slate-500">{r.patient.mrn}</small></span> : '—', csv: (r: any) => fullName(r.patient) }] : []),
    { key: 'title', header: cfg.titleLabel ?? 'Title', render: (r: any) => <span className="wrap block max-w-[260px] truncate">{r.title ?? '—'}</span> },
    ...cfg.columns.map((c) => ({ key: `data.${c}`, header: fieldBy[c]?.label ?? humanize(c), render: (r: any) => fmt(fieldBy[c] ?? { name: c, label: c }, r.data?.[c]) ?? <span className="muted">—</span>, csv: (r: any) => r.data?.[c] ?? '' })),
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} tone={statusTone(r.status) === 'slate' && cfg.active.includes(r.status) ? 'blue' : undefined} /> },
    { key: 'createdAt', header: 'Recorded', render: (r: any) => dateTime(r.createdAt) },
  ];
  const Icon = cfg.icon;
  return (
    <div>
      <PageHeader eyebrow={<span className="badge brand"><Icon className="h-3.5 w-3.5" />{cfg.group}</span>} title={cfg.label} subtitle={cfg.subtitle}
        actions={<>{cfg.key === 'hiv' && <button className="btn" onClick={() => downloadCsv('/records/hiv/nascop.csv', {}, 'nascop-line-list.csv')} title="KenyaEMR-style current-on-ART line list (indicative columns)"><Download />NASCOP line list</button>}
          <button className="btn primary" onClick={() => setCreating(true)}><Plus />New {cfg.single}</button></>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open work" value={active} hint={cfg.active.map(humanize).join(', ')} icon={Icon} loading={summary.isLoading} />
        <StatCard label="This month" value={s?.thisMonth ?? 0} hint="Recorded since the 1st" icon={Plus} tone="blue" loading={summary.isLoading} />
        <StatCard label="All records" value={s?.total ?? 0} icon={History} tone="violet" loading={summary.isLoading} />
        <StatCard label={humanize(last)} value={s?.byStatus?.[last] ?? 0} icon={Save} tone="green" loading={summary.isLoading} />
      </div>
      <div className="tabs">
        <button className={cn('tab', !status && 'on')} onClick={() => setStatus('')}>All<span className="n">{s?.total ?? 0}</span></button>
        {cfg.statuses.map((st) => <button key={st} className={cn('tab', status === st && 'on')} onClick={() => setStatus(st)}>{humanize(st)}<span className="n">{s?.byStatus?.[st] ?? 0}</span></button>)}
      </div>
      <DataTable path={`/records/${cfg.key}`} query={{ status: status || undefined }} columns={columns} onRowClick={(r: any) => setOpenId(r.id)} exportName={cfg.key}
        searchPlaceholder={cfg.patient ? 'Search by number, patient name or MRN' : 'Search by number or name'} emptyTitle={`No ${cfg.single}s yet`} emptyMessage={cfg.empty} />
      {creating && <RecordForm cfg={cfg} onClose={() => setCreating(false)} onSaved={(r) => { setCreating(false); setOpenId(r.id); }} />}
      {openId && <RecordDrawer cfg={cfg} id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function useRefresh(cfg: RegisterConfig) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/records/${cfg.key}`) });
}

/** Create or edit a record. */
function RecordForm({ cfg, record, onClose, onSaved }: { cfg: RegisterConfig; record?: any; onClose: () => void; onSaved: (r: any) => void }) {
  const toast = useToast(); const refresh = useRefresh(cfg);
  const [patientId, setPatientId] = useState<string>(record?.patientId ?? ''); const [visitId, setVisitId] = useState<string>(record?.visitId ?? '');
  const [title, setTitle] = useState<string>(record?.title ?? ''); const [status, setStatus] = useState<string>(record?.status ?? cfg.statuses[0]);
  const [data, setData] = useState<Record<string, any>>(record?.data ?? {}); const [busy, setBusy] = useState(false); const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => { if (!record) setVisitId(''); }, [patientId, record]);
  const save = async () => {
    const e: Record<string, string> = {};
    if (cfg.patient && !patientId) e.patientId = 'Choose the patient';
    for (const f of cfg.fields) if (f.required && (data[f.name] === undefined || data[f.name] === '')) e[f.name] = `Enter ${f.label.toLowerCase()}`;
    setErr(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { title, status, patientId: patientId || undefined, visitId: visitId || undefined, data };
      const r = record ? await api.patch(`/records/${cfg.key}/${record.id}`, body) : await api.post(`/records/${cfg.key}`, body);
      toast.push(record ? 'Saved' : `${cfg.single.charAt(0).toUpperCase() + cfg.single.slice(1)} recorded`, 'success'); refresh(); onSaved(r);
    } catch (x) { toast.push((x as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={record ? `Edit ${record.number}` : `New ${cfg.single}`} subtitle={cfg.label}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Save />}Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {cfg.patient && <Field label="Patient *" error={err.patientId} className="sm:col-span-2"><EntityPicker source={PICK.patient} value={patientId} onChange={setPatientId} placeholder="Search by name, MRN or phone" /></Field>}
        {cfg.visit && patientId && <Field label="Visit" hint="Link a visit to bill services to it." className="sm:col-span-2"><EntityPicker source={{ path: '/visits', query: { patientId }, label: (v: any) => `${v.visitNumber} · ${humanize(v.type)}`, sub: (v: any) => `${dateTime(v.startedAt)} · ${humanize(v.status)}` }} value={visitId} onChange={setVisitId} placeholder="Choose a visit (optional)" /></Field>}
        <Field label={cfg.titleLabel ?? 'Title'}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Enter ${(cfg.titleLabel ?? 'title').toLowerCase()}`} /></Field>
        <Field label="Status"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{cfg.statuses.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></Field>
        {cfg.fields.filter((f) => !f.readOnly).map((f) => (
          <Field key={f.name} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}${f.required ? ' *' : ''}`} hint={f.hint} error={err[f.name]} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            {f.type === 'select' ? <select className="input" value={data[f.name] ?? ''} onChange={(e) => setData({ ...data, [f.name]: e.target.value })}><option value="">Choose {f.label.toLowerCase()}</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : f.type === 'textarea' ? <textarea className="input" rows={3} value={data[f.name] ?? ''} onChange={(e) => setData({ ...data, [f.name]: e.target.value })} placeholder={`Enter ${f.label.toLowerCase()}`} />
              : f.type === 'checkbox' ? <span className="flex h-[46px] items-center"><input type="checkbox" checked={!!data[f.name]} onChange={(e) => setData({ ...data, [f.name]: e.target.checked })} /></span>
              : <input className="input" type={f.type === 'staff' ? 'text' : f.type ?? 'text'} step={f.type === 'number' ? 'any' : undefined} value={data[f.name] ?? ''} onChange={(e) => setData({ ...data, [f.name]: f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} placeholder={f.type === 'date' || f.type === 'datetime-local' ? undefined : `Enter ${f.label.toLowerCase()}`} />}
          </Field>
        ))}
      </div>
    </Modal>
  );
}

function RecordDrawer({ cfg, id, onClose }: { cfg: RegisterConfig; id: string; onClose: () => void }) {
  const { data: r, isLoading, refetch } = useGet<any>(`/records/${cfg.key}/${id}`);
  const toast = useToast(); const refresh = useRefresh(cfg);
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(''); const [svc, setSvc] = useState(''); const [qty, setQty] = useState(1);
  const items = useMemo(() => cfg.fields.map((f) => [f.label, fmt(f, r?.data?.[f.name])] as [string, React.ReactNode]), [cfg, r]);
  const setStatus = async (st: string) => {
    setBusy(st);
    try { await api.patch(`/records/${cfg.key}/${id}`, { status: st }); toast.push(`Marked ${humanize(st).toLowerCase()}`, 'success'); refetch(); refresh(); } catch (x) { toast.push((x as Error).message, 'error'); } finally { setBusy(''); }
  };
  const charge = async () => {
    setBusy('charge');
    try { await api.post(`/records/${cfg.key}/${id}/charge`, { serviceItemId: svc, quantity: qty }); toast.push('Charge added to the bill', 'success'); setSvc(''); refetch(); } catch (x) { toast.push((x as Error).message, 'error'); } finally { setBusy(''); }
  };
  return (
    <Drawer open onClose={onClose} title={r ? `${r.number}${r.title ? ` · ${r.title}` : ''}` : 'Loading…'} subtitle={cfg.label}
      actions={r && <><button className="btn sm" onClick={() => window.print()}><Printer />Print</button><button className="btn sm" onClick={() => setEditing(true)}><Pencil />Edit</button></>}>
      {isLoading || !r ? <div className="skeleton h-40" /> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /><span className="text-xs text-slate-500">Recorded {dateTime(r.createdAt)} · updated {dateTime(r.updatedAt)}</span></div>
          {r.patient && (
            <Link href={`/patients/${r.patient.id}`} className="tile"><span className="ti">{fullName(r.patient).slice(0, 1)}</span><span><b>{fullName(r.patient)}</b><small>{r.patient.mrn} · {humanize(r.patient.sex ?? '')}{r.patient.phone ? ` · ${r.patient.phone}` : ''}</small></span></Link>
          )}
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Move to</div>
            <div className="flex flex-wrap gap-2">{cfg.statuses.filter((s) => s !== r.status).map((s) => <button key={s} className="chip" disabled={!!busy} onClick={() => setStatus(s)}>{busy === s && <Spinner />}{humanize(s)}</button>)}</div>
          </div>
          <Card title="Details" bodyClass="!pt-4"><KV items={[[cfg.titleLabel ?? 'Title', r.title], ...items]} /></Card>
          {cfg.visit && (
            <Card title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-brand" />Bill a service</span>} subtitle={r.visitId ? 'Posts to the visit bill at the payer price.' : 'Link a visit (Edit) to bill services.'}>
              {r.visitId ? <div className="grid gap-3 sm:grid-cols-[1fr_90px_auto]">
                <EntityPicker source={PICK.serviceItem(cfg.chargeCategory)} value={svc} onChange={setSvc} placeholder="Choose a priced service" />
                <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} aria-label="Quantity" />
                <button className="btn primary" disabled={!svc || busy === 'charge'} onClick={charge}>{busy === 'charge' ? <Spinner /> : <Plus />}Add</button>
              </div> : <button className="btn sm" onClick={() => setEditing(true)}><Pencil />Link a visit</button>}
            </Card>
          )}
          <Card title={<span className="flex items-center gap-2"><History className="h-4 w-4 text-brand" />History</span>}>
            {(r.history ?? []).length === 0 ? <p className="m-0 text-sm text-slate-500">No changes yet.</p> : (
              <ol className="m-0 flex list-none flex-col gap-3 p-0">{r.history.map((h: any) => (
                <li key={h.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" /><span><b>{h.action === 'STATUS' ? `Status ${humanize(h.data?.from ?? '')} → ${humanize(h.data?.to ?? '')}` : h.action === 'CREATE' ? 'Created' : h.action === 'CHARGE' ? 'Service billed' : 'Details updated'}</b><small className="block text-slate-500">{dateTime(h.at)}{h.by ? ` · ${h.by}` : ''}</small></span></li>
              ))}</ol>
            )}
          </Card>
        </div>
      )}
      {editing && r && <RecordForm cfg={cfg} record={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); }} />}
    </Drawer>
  );
}
