'use client';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { Field, Modal, Spinner } from './ui';

interface Eligibility { eligible: boolean; fund?: string; schemeName?: string; message?: string; reference?: string; balanceMinor?: number }

export function OpenVisitDialog({ open, onClose, patient }: { open: boolean; onClose: () => void; patient: { id: string; crId?: string | null; shaNumber?: string | null; idNumber?: string | null } }) {
  const router = useRouter();
  const [payerType, setPayerType] = useState('CASH'); const [type, setType] = useState('OPD');
  const [schemeId, setSchemeId] = useState(''); const [departmentId, setDepartmentId] = useState(''); const [servicePointId, setServicePointId] = useState('');
  const [elig, setElig] = useState<Eligibility | null>(null); const [checking, setChecking] = useState(false); const [eligErr, setEligErr] = useState('');
  const schemes = useList<any>('/payers/schemes', { pageSize: 100 }, open && payerType === 'INSURANCE');
  const depts = useList<any>('/departments', { pageSize: 100 }, open);
  const sps = useList<any>('/queue/service-points', { pageSize: 100 }, open);
  const m = useAction('post', '/visits', { invalidate: ['/visits', '/queue', `/patients/${patient.id}`], success: 'Visit opened', onSuccess: (v: any) => { onClose(); if (v?.id && type === 'OPD') router.push(`/opd/${v.id}`); } });

  const checkSha = async () => {
    setChecking(true); setEligErr(''); setElig(null);
    try { setElig(await api.get<Eligibility>('/visits/eligibility', { patientId: patient.id, payerType: 'SHA' })); }
    catch (e) { setEligErr((e as Error).message); } finally { setChecking(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Open visit" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={m.isPending || (payerType === 'SHA' && elig?.eligible === false)} onClick={() => m.mutate({ patientId: patient.id, type, payerType, schemeId: schemeId || undefined, departmentId: departmentId || undefined, servicePointId: servicePointId || undefined, eligibilityRef: elig?.reference, shaFund: elig?.fund })}>{m.isPending && <Spinner />}Open visit</button></>}>
      <div className="space-y-4">
        <Field label="Visit type"><select className="input" value={type} onChange={(e) => setType(e.target.value)}>{['OPD', 'EMERGENCY', 'WALK_IN', 'REFERRAL', 'TELEMEDICINE', 'HOME_CARE'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <div>
          <span className="label">Payer</span>
          <div className="grid grid-cols-3 gap-2">
            {['CASH', 'SHA', 'INSURANCE'].map((p) => <button key={p} type="button" onClick={() => { setPayerType(p); setElig(null); if (p === 'SHA') checkSha(); }} className={payerType === p ? 'btn-primary' : 'btn-secondary'}>{p}</button>)}
          </div>
        </div>
        {payerType === 'SHA' && (
          <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            {checking ? <span className="flex items-center gap-2"><Spinner />Checking SHA eligibility…</span>
              : eligErr ? <span className="text-red-600">{eligErr} <button className="underline" onClick={checkSha}>Retry</button></span>
              : elig ? (
                <div className={elig.eligible ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                  <p className="flex items-center gap-2 font-medium">{elig.eligible ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}{elig.eligible ? 'Eligible' : 'Not eligible'} {elig.fund && `· ${elig.fund}`}</p>
                  {elig.message && <p className="mt-1 text-xs">{elig.message}</p>}
                  {elig.reference && <p className="mt-1 text-xs text-slate-500">Ref: {elig.reference}</p>}
                </div>
              ) : <button className="btn-secondary" onClick={checkSha}>Check eligibility</button>}
          </div>
        )}
        {payerType === 'INSURANCE' && <Field label="Scheme"><select className="input" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}><option value="">Select scheme…</option>{schemes.data?.data.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Field label="Department"><select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">—</option>{depts.data?.data.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Send to queue"><select className="input" value={servicePointId} onChange={(e) => setServicePointId(e.target.value)}><option value="">—</option>{sps.data?.data.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
