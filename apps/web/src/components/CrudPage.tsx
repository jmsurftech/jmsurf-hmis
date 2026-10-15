'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from './DataTable';
import { FormDialog, type FieldDef } from './FormDialog';
import { PageHeader } from './ui';

/** Standard list page: header with a "New" button, optional extra content, searchable table, create dialog. */
export function CrudPage<T = any>({ title, subtitle, path, columns, fields, createLabel = 'New', createPath, query, onRowClick, actions, toolbar, transform, children, searchable, onCreated, emptyMessage, exportName }: {
  title: string; subtitle?: string; path: string; columns: Column<T>[]; fields?: FieldDef[]; createLabel?: string; createPath?: string;
  query?: Record<string, any>; onRowClick?: (r: T) => void; actions?: React.ReactNode; toolbar?: React.ReactNode; transform?: (v: any) => any; children?: React.ReactNode; searchable?: boolean; onCreated?: (r: any) => void;
  emptyMessage?: React.ReactNode; exportName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={<>{actions}{fields && <button className="btn primary" onClick={() => setOpen(true)}><Plus />{createLabel}</button>}</>} />
      {children}
      <DataTable path={path} columns={columns} query={query} onRowClick={onRowClick} toolbar={toolbar} searchable={searchable} exportName={exportName ?? title.toLowerCase().replace(/\W+/g, '-')}
        emptyMessage={emptyMessage ?? (fields ? <>Use <b>{createLabel}</b> to add the first one.</> : undefined)} />
      {fields && <FormDialog open={open} onClose={() => setOpen(false)} title={createLabel} fields={fields} path={createPath ?? path} invalidate={[path]} transform={transform} onDone={onCreated} />}
    </div>
  );
}
