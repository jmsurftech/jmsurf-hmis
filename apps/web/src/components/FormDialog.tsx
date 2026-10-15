'use client';
import { zodResolver } from '@/lib/zodResolver';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAction } from '@/lib/hooks';
import { Field, Modal, Spinner } from './ui';

export interface FieldDef {
  name: string; label: string; type?: 'text' | 'number' | 'date' | 'datetime-local' | 'email' | 'select' | 'textarea' | 'money' | 'checkbox' | 'tel' | 'password';
  options?: (string | { value: string; label: string })[]; required?: boolean; placeholder?: string; full?: boolean;
}

function schemaFor(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny;
    if (f.type === 'checkbox') s = z.boolean().optional();
    else if (f.type === 'number' || f.type === 'money') s = f.required ? z.coerce.number({ invalid_type_error: 'Required' }) : z.union([z.literal(''), z.coerce.number()]).optional();
    else if (f.type === 'email') s = f.required ? z.string().email() : z.union([z.literal(''), z.string().email()]).optional();
    else s = f.required ? z.string().min(1, 'Required') : z.string().optional();
    shape[f.name] = s;
  }
  return z.object(shape);
}

export function FormDialog({ open, onClose, title, fields, path, method = 'post', defaults, invalidate, success = 'Saved', transform, onDone }: {
  open: boolean; onClose: () => void; title: string; fields: FieldDef[]; path: string; method?: 'post' | 'patch' | 'put';
  defaults?: Record<string, any>; invalidate?: string[]; success?: string; transform?: (v: Record<string, any>) => any; onDone?: (r: any) => void;
}) {
  const form = useForm<Record<string, any>>({ resolver: zodResolver(schemaFor(fields)), defaultValues: defaults ?? {} });
  useEffect(() => { if (open) form.reset(defaults ?? {}); }, [open]); // eslint-disable-line
  const m = useAction(method, path, { invalidate: invalidate ?? [path.split('?')[0]], success, onSuccess: (r) => { onDone?.(r); onClose(); } });
  const submit = form.handleSubmit((v) => {
    const out: Record<string, any> = {};
    for (const f of fields) {
      const val = v[f.name];
      if (val === '' || val === undefined) continue;
      if (f.type === 'money') out[f.name.endsWith('Minor') ? f.name : `${f.name}Minor`] = Math.round(Number(val) * 100);
      else out[f.name] = val;
    }
    m.mutate(transform ? transform(out) : out);
  });
  return (
    <Modal open={open} onClose={onClose} title={title} wide={fields.length > 6}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={m.isPending}>{m.isPending && <Spinner />}Save</button></>}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const err = form.formState.errors[f.name]?.message as string | undefined;
          const reg = form.register(f.name);
          return (
            <Field key={f.name} label={f.label + (f.required ? ' *' : '')} error={err} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              {f.type === 'select' ? (
                <select className="input" {...reg}><option value="">Select…</option>{f.options?.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o.replace(/_/g, ' ')}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              ) : f.type === 'textarea' ? <textarea rows={3} className="input" placeholder={f.placeholder} {...reg} />
                : f.type === 'checkbox' ? <input type="checkbox" className="h-4 w-4" {...reg} />
                : <input className="input" type={f.type === 'money' ? 'number' : f.type ?? 'text'} step={f.type === 'money' ? '0.01' : undefined} placeholder={f.placeholder} {...reg} />}
            </Field>
          );
        })}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
