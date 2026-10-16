'use client';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/ui';

/** Result envelope of every /ai/* draft endpoint. */
export interface AiDraft { draft: true; requiresSignOff: true; disclaimer: string; model: string; source: 'LLM' | 'OFFLINE' }

export function useAiEnabled() {
  const s = useGet<{ aiEnabled: boolean; llmConfigured: boolean; model: string }>('/ai/settings');
  return s.data?.aiEnabled ?? false;
}

/** Calls an AI endpoint and returns the draft; shows errors as toasts. */
export function useAiCall<T>() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = async (path: string, body?: unknown): Promise<(T & AiDraft) | null> => {
    setBusy(true);
    try { return await api.post<T & AiDraft>(path, body); } catch (e: any) { toast.push(e.message, 'error'); return null; } finally { setBusy(false); }
  };
  return { busy, run };
}

export function AiButton({ onClick, busy, label = 'AI draft', disabled }: { onClick: () => void; busy?: boolean; label?: string; disabled?: boolean }) {
  return (
    <button type="button" className="btn-secondary" onClick={onClick} disabled={busy || disabled} title="Generates a draft that you must review and sign off">
      {busy ? <Spinner /> : <Sparkles className="h-4 w-4 text-violet-600" />}{label}
    </button>
  );
}

export function AiDisclaimer({ draft }: { draft?: AiDraft | null }) {
  if (!draft) return null;
  return (
    <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
      <Sparkles className="mr-1 inline h-3 w-3" /><b>AI draft</b> ({draft.source === 'OFFLINE' ? 'offline rules' : draft.model}). {draft.disclaimer}
    </p>
  );
}

/** Dictation box (English / Kiswahili) → structured SOAP draft, passed to onDraft to fill the note form. */
export function AiSoapDictation({ visitId, onDraft }: { visitId: string; onDraft: (soap: { subjective: string; objective: string; assessment: string; plan: string }) => void }) {
  const enabled = useAiEnabled();
  const [text, setText] = useState('');
  const [last, setLast] = useState<AiDraft | null>(null);
  const { busy, run } = useAiCall<{ subjective: string; objective: string; assessment: string; plan: string }>();
  if (!enabled) return null;
  return (
    <div className="mb-3 space-y-2 md:col-span-2">
      <textarea rows={3} className="input" placeholder="Dictate or paste free text (English / Kiswahili), then click AI draft…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end"><AiButton busy={busy} disabled={!text.trim()} onClick={async () => { const r = await run('/ai/soap', { text, visitId }); if (r) { setLast(r); onDraft(r); } }} /></div>
      <AiDisclaimer draft={last} />
    </div>
  );
}

/** ICD-11 suggestions from the visit's note text, validated server-side against the local ICD-11 list. */
export function AiIcdSuggest({ visitId, noteText, onPick }: { visitId: string; noteText: string; onPick: (code: string, title: string, type: 'PRIMARY' | 'SECONDARY') => void }) {
  const enabled = useAiEnabled();
  const [res, setRes] = useState<(AiDraft & { suggestions: { code: string; title: string; confidence: number; rationale: string }[] }) | null>(null);
  const { busy, run } = useAiCall<{ suggestions: { code: string; title: string; confidence: number; rationale: string }[] }>();
  if (!enabled) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <AiButton label="AI suggest codes" busy={busy} disabled={!noteText.trim()} onClick={async () => setRes(await run('/ai/icd', { text: noteText, visitId }))} />
      {!noteText.trim() && <p className="text-xs text-slate-500">Write the SOAP note first; suggestions are based on it.</p>}
      {res && <>
        <AiDisclaimer draft={res} />
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {res.suggestions.length === 0 && <li className="py-2 text-xs text-slate-500">No matching ICD-11 codes found.</li>}
          {res.suggestions.map((s) => <li key={s.code} className="flex items-center justify-between gap-2 py-2">
            <span><span className="font-mono text-xs text-primary-700 dark:text-primary-400">{s.code}</span> {s.title} <span className="text-xs text-slate-500">({Math.round(s.confidence * 100)}%: {s.rationale})</span></span>
            <span className="flex gap-1"><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => onPick(s.code, s.title, 'PRIMARY')}>Primary</button><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => onPick(s.code, s.title, 'SECONDARY')}>Secondary</button></span>
          </li>)}
        </ul>
      </>}
    </div>
  );
}

/** "AI draft" discharge summary: fetches a draft and hands the text to the caller (e.g. to prefill the discharge dialog). */
export function AiDischargeButton({ admissionId, onDraft }: { admissionId: string; onDraft: (summary: string) => void }) {
  const enabled = useAiEnabled();
  const { busy, run } = useAiCall<{ summary: string }>();
  if (!enabled) return null;
  return <AiButton label="AI draft summary" busy={busy} onClick={async () => {
    const r = await run(`/ai/admissions/${admissionId}/discharge-summary`);
    if (r) onDraft(`${r.summary}\n\n[AI draft (${r.source === 'OFFLINE' ? 'offline rules' : r.model}); reviewed and signed off by the discharging clinician]`);
  }} />;
}

/** Claim denial-risk explanation + fix suggestions from the scrubber issues. */
export function AiClaimRisk({ claimId }: { claimId: string }) {
  const enabled = useAiEnabled();
  const [res, setRes] = useState<(AiDraft & { riskLevel: string; explanation: string; fixes: { issueCode: string; action: string }[] }) | null>(null);
  const { busy, run } = useAiCall<{ riskLevel: string; explanation: string; fixes: { issueCode: string; action: string }[] }>();
  if (!enabled) return null;
  return (
    <div className="space-y-2 rounded-lg border border-violet-200 p-3 dark:border-violet-900">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Denial risk assistant</span>
        <AiButton label="AI explain & fix" busy={busy} onClick={async () => setRes(await run(`/ai/claims/${claimId}/risk`))} /></div>
      {res && <>
        <p className="text-sm"><b>Risk: {res.riskLevel}.</b> {res.explanation}</p>
        {res.fixes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{res.fixes.map((f, i) => <li key={i}><span className="font-mono text-xs">{f.issueCode}</span>: {f.action}</li>)}</ul>}
        <AiDisclaimer draft={res} />
      </>}
    </div>
  );
}
