'use client';
import { useState } from 'react';
import { Card, Loading, PageHeader } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';

const LABELS: Record<string, string> = {
  APPT_24H: 'Appointment reminder (24 h before)', APPT_2H: 'Appointment reminder (2 h before)', IMMUNIZATION_DUE: 'Immunization due',
  RESULTS_READY: 'Results ready', BILL_BALANCE: 'Bill balance', OTP: 'Portal login code', TELEMED_LINK: 'Video consultation link',
};

function Editor({ t }: { t: any }) {
  const [body, setBody] = useState(t.body);
  const save = useAction<any>('put', '/messaging/templates', { invalidate: ['/messaging/templates'], success: 'Template saved' });
  const reset = useAction<any>('del', () => `/messaging/templates/${t.code}/${t.lang}`, { invalidate: ['/messaging/templates'], success: 'Reset to default', onSuccess: () => setBody(t.defaultBody) });
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold uppercase">{t.lang === 'sw' ? 'Kiswahili' : 'English'}</span>{t.isDefault ? <span className="text-slate-400">default</span> : <span className="text-primary-600">customised</span>}</div>
      <textarea className="input font-mono text-xs" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>{body.length} chars · {Math.ceil(body.length / 160)} SMS</span>
        <div className="flex gap-1">
          {!t.isDefault && <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => reset.mutate(null)}>Reset</button>}
          <button className="btn-primary px-2 py-0.5 text-xs" disabled={body === t.body} onClick={() => save.mutate({ code: t.code, lang: t.lang, body })}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { data, isLoading } = useGet<any[]>('/messaging/templates');
  const codes = [...new Set((data ?? []).map((t) => t.code))];
  return (
    <div>
      <PageHeader title="Message templates" subtitle="SMS / WhatsApp texts in English and Kiswahili. Placeholders: {{name}}, {{facility}}, {{time}}, {{date}}, {{amount}}, {{bill}}, {{test}}, {{vaccine}}, {{dose}}, {{link}}, {{code}}, {{phone}}." />
      {isLoading ? <Loading /> : <div className="space-y-4">{codes.map((code) => (
        <Card key={code} title={LABELS[code] ?? code}>
          <div className="grid gap-3 md:grid-cols-2">{(data ?? []).filter((t) => t.code === code).map((t) => <Editor key={`${t.code}-${t.lang}-${t.body}`} t={t} />)}</div>
        </Card>))}</div>}
    </div>
  );
}
