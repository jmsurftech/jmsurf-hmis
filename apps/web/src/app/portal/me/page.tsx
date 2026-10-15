'use client';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { portal, portalStore, usePortal, usePortalAction } from '@/lib/portal';
import { Box, Busy } from '../parts';

const SCOPE_LABEL: Record<string, string> = { SMS: 'SMS reminders', WHATSAPP: 'WhatsApp messages', DATA_SHARING_HIE: 'Share my record with SHA / national HIE', RESEARCH: 'Use de-identified data for research', MARKETING: 'Health tips & offers' };

export default function Me() {
  const me = usePortal<any>('/portal/me');
  const consents = usePortal<any[]>('/portal/consents');
  const setConsent = usePortalAction((b: any) => portal.put('/portal/consents', b));
  const setPrefs = usePortalAction((b: any) => portal.put('/portal/me/preferences', b));
  const fb = usePortalAction((b: any) => portal.post('/portal/feedback', b), false);
  const [score, setScore] = useState<number | null>(null); const [comment, setComment] = useState(''); const [thanks, setThanks] = useState(false);
  const download = async () => {
    const subject = portalStore.subject();
    const data = await portal.get('/portal/record', subject ? { patientId: subject } : {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `health-record-${me.data?.mrn ?? 'me'}.json`; a.click();
  };
  if (me.isLoading) return <Busy />;
  const p = me.data;
  return (
    <div>
      <Box title="Profile">
        <p className="text-lg font-semibold">{p?.firstName} {p?.middleName ?? ''} {p?.lastName}</p>
        <p className="text-sm text-slate-500">MRN {p?.mrn} · {p?.sex}{p?.dateOfBirth ? ` · born ${new Date(p.dateOfBirth).toLocaleDateString('en-KE')}` : ''}</p>
        <p className="text-sm text-slate-500">{p?.phone}</p>
        {p?.allergies?.length > 0 && <p className="mt-1 text-sm text-red-700">Allergies: {p.allergies.map((a: any) => a.substance).join(', ')}</p>}
        <div className="mt-3 flex gap-2 text-sm"><Link className="btn-secondary" href="/portal/sha">SHA status</Link><Link className="btn-secondary" href="/portal/prescriptions">Medicines</Link></div>
      </Box>
      <Box title="Language / Lugha">
        <div className="grid grid-cols-2 gap-2">{[['en', 'English'], ['sw', 'Kiswahili']].map(([v, l]) => (
          <button key={v} onClick={() => setPrefs.mutate({ language: v })} className={`rounded-xl border p-2 text-sm ${p?.preferences?.language === v ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-slate-200 dark:border-slate-700'}`}>{l}</button>))}</div>
      </Box>
      <Box title="Privacy & consent">
        {consents.isLoading ? <Busy /> : (consents.data ?? []).map((c) => (
          <label key={c.scope} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
            <span>{SCOPE_LABEL[c.scope] ?? c.scope}</span>
            <input type="checkbox" className="h-5 w-5 accent-primary-600" checked={c.granted} onChange={(e) => setConsent.mutate({ scope: c.scope, granted: e.target.checked, patientId: portalStore.subject() ?? undefined })} />
          </label>))}
      </Box>
      <Box title="My health record">
        <p className="mb-2 text-sm text-slate-500">Download a complete copy of your record (JSON), as provided for under the Kenya Data Protection Act.</p>
        <button className="btn-secondary w-full justify-center" onClick={download}><Download className="h-4 w-4" />Download my record</button>
      </Box>
      <Box title="How likely are you to recommend us?">
        {thanks ? <p className="text-sm text-emerald-700">Thank you for your feedback! / Asante!</p> : <>
          <div className="grid grid-cols-11 gap-1">{Array.from({ length: 11 }, (_, i) => (
            <button key={i} onClick={() => setScore(i)} className={`rounded-md border py-1.5 text-xs ${score === i ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 dark:border-slate-700'}`}>{i}</button>))}</div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>Not likely</span><span>Very likely</span></div>
          <textarea className="input mt-2" rows={2} placeholder="Tell us more (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn-primary mt-2 w-full justify-center" disabled={score === null || fb.isPending} onClick={async () => { await fb.mutateAsync({ score, comment: comment || undefined }); setThanks(true); }}>Send feedback</button>
        </>}
      </Box>
    </div>
  );
}
