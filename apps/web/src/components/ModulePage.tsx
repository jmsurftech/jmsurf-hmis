'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from './DataTable';
import { FormDialog, type FieldDef } from './FormDialog';
import { KV, Loading, Modal, PageHeader, Spinner, StatusBadge, Tabs } from './ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime } from '@/lib/format';

/** A row action: posts to `path(row)`, optionally collecting `fields` first. */
export interface RowAction<T = any> {
  label: string; path: (r: T) => string; fields?: FieldDef[] | ((r: T) => FieldDef[]); show?: (r: T) => boolean;
  transform?: (v: Record<string, any>, r: T) => any; defaults?: (r: T) => Record<string, any>; tone?: 'primary' | 'secondary' | 'danger'; success?: string; method?: 'post' | 'patch';
}
export interface ModuleTab<T = any> {
  id: string; label: string;
  /** List endpoint for the table. Omit with `custom` to render a custom panel only. */
  path?: string; columns?: Column<T>[]; query?: Record<string, any>; searchable?: boolean;
  fields?: FieldDef[]; createLabel?: string; createPath?: string; transform?: (v: Record<string, any>) => any; createDefaults?: Record<string, any>;
  /** Detail view: fetched from `detailPath(row)` (falls back to the row) and rendered by `renderDetail` (else generic key/values). */
  detailPath?: (r: T) => string; renderDetail?: (d: any, row: T) => React.ReactNode; detailTitle?: (r: T) => string;
  actions?: RowAction<T>[]; custom?: React.ReactNode; invalidate?: string[];
}

const isScalar = (v: unknown) => v == null || ['string', 'number', 'boolean'].includes(typeof v);
const prettyKey = (k: string) => k.replace(/Minor$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
function fmt(k: string, v: any): React.ReactNode {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (k === 'status' || k.endsWith('Status')) return <StatusBadge status={String(v)} />;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dateTime(v);
  return String(v);
}
export function GenericKV({ data, omit = [] }: { data: Record<string, any>; omit?: string[] }) {
  const items = Object.entries(data ?? {}).filter(([k, v]) => isScalar(v) && !k.endsWith('Id') && k !== 'id' && !omit.includes(k)).map(([k, v]) => [prettyKey(k), fmt(k, v)] as [string, React.ReactNode]);
  return <KV items={items} />;
}

function ActionButton<T>({ a, row, invalidate, onDone }: { a: RowAction<T>; row: T; invalidate: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const path = a.path(row);
  const m = useAction(a.method ?? 'post', path, { invalidate, success: a.success ?? `${a.label} done`, onSuccess: onDone });
  const cls = a.tone === 'danger' ? 'btn-danger' : a.tone === 'primary' ? 'btn-primary' : 'btn-secondary';
  const fields = typeof a.fields === 'function' ? a.fields(row) : a.fields;
  if (!fields?.length) return <button className={cls} disabled={m.isPending} onClick={() => m.mutate((a.transform ? a.transform({}, row) : {}) as any)}>{m.isPending && <Spinner />}{a.label}</button>;
  return <>
    <button className={cls} onClick={() => setOpen(true)}>{a.label}</button>
    <FormDialog open={open} onClose={() => setOpen(false)} title={a.label} fields={fields} path={path} method={a.method} invalidate={invalidate} success={a.success ?? `${a.label} done`}
      defaults={a.defaults?.(row)} transform={a.transform ? (v) => a.transform!(v, row) : undefined} onDone={onDone} />
  </>;
}

function Detail<T extends Record<string, any>>({ tab, row, onClose }: { tab: ModuleTab<T>; row: T; onClose: () => void }) {
  const q = useGet<any>(tab.detailPath ? tab.detailPath(row) : null);
  const data = tab.detailPath ? q.data : row;
  const invalidate = [...(tab.invalidate ?? []), tab.path ?? '', ...(tab.detailPath ? [tab.detailPath(row)] : [])].filter(Boolean);
  const actions = (tab.actions ?? []).filter((a) => !a.show || a.show((data ?? row) as T));
  return (
    <Modal open onClose={onClose} wide title={tab.detailTitle?.(row) ?? (row as any).number ?? tab.label}
      footer={actions.length ? <div className="flex flex-wrap justify-end gap-2">{actions.map((a) => <ActionButton key={a.label} a={a} row={(data ?? row) as T} invalidate={invalidate} onDone={() => { if (!tab.detailPath) onClose(); }} />)}</div> : undefined}>
      {tab.detailPath && q.isLoading ? <Loading /> : tab.renderDetail ? tab.renderDetail(data, row) : <GenericKV data={data ?? {}} />}
    </Modal>
  );
}

/** Tabbed module page: each tab is a list (DataTable) with a create form (FormDialog) and a detail modal with row actions. */
export function ModulePage({ title, subtitle, tabs, actions }: { title: string; subtitle?: string; tabs: ModuleTab[]; actions?: React.ReactNode }) {
  const [tabId, setTabId] = useState(tabs[0].id);
  const [create, setCreate] = useState(false);
  const [row, setRow] = useState<any>(null);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={<>{actions}{tab.fields && <button className="btn-primary" onClick={() => setCreate(true)}><Plus className="h-4 w-4" />{tab.createLabel ?? 'New'}</button>}</>} />
      {tabs.length > 1 && <Tabs tabs={tabs.map((t) => ({ id: t.id, label: t.label }))} value={tab.id} onChange={(id) => { setTabId(id); setRow(null); }} />}
      {tab.custom}
      {tab.path && tab.columns && <DataTable key={tab.id} path={tab.path} columns={tab.columns} query={tab.query} searchable={tab.searchable ?? false} onRowClick={(tab.detailPath || tab.actions || tab.renderDetail) ? setRow : undefined} />}
      {tab.fields && <FormDialog open={create} onClose={() => setCreate(false)} title={tab.createLabel ?? 'New'} fields={tab.fields} path={tab.createPath ?? tab.path!} defaults={tab.createDefaults}
        invalidate={[tab.path ?? '', ...(tab.invalidate ?? [])].filter(Boolean)} transform={tab.transform} />}
      {row && <Detail tab={tab} row={row} onClose={() => setRow(null)} />}
    </div>
  );
}

/** Convert a datetime-local / date string to ISO. */
export const iso = (v?: string) => (v ? new Date(v).toISOString() : undefined);
export const pick = (o: Record<string, any>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== '').map((k) => [k, o[k]]));
