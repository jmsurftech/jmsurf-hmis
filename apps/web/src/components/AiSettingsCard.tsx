'use client';
import { Sparkles } from 'lucide-react';
import { Card, Spinner } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';

/** Admin opt-in for AI drafting assistance (tenant.settings.aiEnabled). */
export function AiSettingsCard() {
  const s = useGet<{ aiEnabled: boolean; llmConfigured: boolean; model: string }>('/ai/settings');
  const save = useAction('put', '/ai/settings', { invalidate: ['/ai/settings'], success: 'AI setting saved' });
  const on = !!s.data?.aiEnabled;
  return (
    <Card title="AI assistance" className="lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="max-w-2xl space-y-1">
          <p><Sparkles className="mr-1 inline h-4 w-4 text-violet-600" />Drafts SOAP notes from dictation (English/Kiswahili), suggests ICD-11 codes, drafts discharge summaries and explains claim denial risk.</p>
          <p className="text-xs text-slate-500">Patient identifiers are removed before text is sent. Every output is a draft that a clinician or officer must review and sign off. All calls are logged with token usage.
            Engine: {s.data?.llmConfigured ? s.data.model : 'offline rule-based drafts (no ANTHROPIC_API_KEY configured)'}.</p>
        </div>
        <button type="button" className={on ? 'btn-secondary' : 'btn-primary'} disabled={s.isLoading || save.isPending} onClick={() => save.mutate({ aiEnabled: !on })}>
          {save.isPending && <Spinner />}{on ? 'Disable AI assistance' : 'Enable AI assistance'}</button>
      </div>
    </Card>
  );
}
