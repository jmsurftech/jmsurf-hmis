'use client';
import { zodResolver } from '@/lib/zodResolver';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Card, Field, PageHeader, Spinner } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';

const ID_TYPES = ['NATIONAL_ID', 'MAISHA_NAMBA', 'PASSPORT', 'BIRTH_CERT', 'ALIEN_ID', 'REFUGEE_ID'];
const schema = z.object({
  idType: z.string().optional(), idNumber: z.string().optional(),
  firstName: z.string().min(1, 'Required'), middleName: z.string().optional(), lastName: z.string().min(1, 'Required'),
  sex: z.enum(['MALE', 'FEMALE', 'INTERSEX', 'UNKNOWN']), dateOfBirth: z.string().optional(),
  phone: z.string().regex(/^(\+?\d{9,13})?$/, 'Invalid phone').optional(), email: z.union([z.literal(''), z.string().email()]).optional(),
  county: z.string().optional(), subCounty: z.string().optional(), village: z.string().optional(),
  occupation: z.string().optional(), maritalStatus: z.string().optional(), bloodGroup: z.string().optional(),
  crId: z.string().optional(), shaNumber: z.string().optional(),
  nokName: z.string().optional(), nokRelationship: z.string().optional(), nokPhone: z.string().optional(),
});
type F = z.infer<typeof schema>;

export default function NewPatient() {
  const router = useRouter(); const toast = useToast(); const [looking, setLooking] = useState(false);
  const { register, handleSubmit, getValues, setValue, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { idType: 'NATIONAL_ID', sex: 'FEMALE' } });
  const lookup = async () => {
    const { idType, idNumber } = getValues();
    if (!idNumber) return toast.push('Enter an ID number first', 'error');
    setLooking(true);
    try {
      const r = await api.get<Partial<F> & { dateOfBirth?: string }>('/patients/registry-lookup', { idType, idNumber });
      (Object.keys(r) as (keyof F)[]).forEach((k) => { const v = r[k]; if (v != null && k in schema.shape) setValue(k, (k === 'dateOfBirth' ? String(v).slice(0, 10) : v) as any); });
      toast.push('Prefilled from Client Registry', 'success');
    } catch (e) { toast.push((e as Error).message || 'Not found in Client Registry', 'error'); } finally { setLooking(false); }
  };
  const submit = handleSubmit(async ({ nokName, nokRelationship, nokPhone, ...v }) => {
    const body: Record<string, unknown> = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined));
    if (nokName) body.nextOfKin = [{ name: nokName, relationship: nokRelationship, phone: nokPhone }];
    try { const p = await api.post<{ id: string }>('/patients', body); toast.push('Patient registered', 'success'); router.push(`/patients/${p.id}`); }
    catch (e) { toast.push((e as Error).message, 'error'); }
  });
  const inp = (n: keyof F, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <Field label={label} error={errors[n]?.message as string}><input className="input" {...props} {...register(n)} /></Field>;
  return (
    <form onSubmit={submit}>
      <PageHeader title="Register patient" actions={<><button type="button" className="btn-secondary" onClick={() => router.back()}>Cancel</button><button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />}Save patient</button></>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Identification" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="ID type"><select className="input" {...register('idType')}>{ID_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></Field>
            {inp('idNumber', 'ID number')}
            <div className="flex items-end"><button type="button" className="btn-secondary w-full" onClick={lookup} disabled={looking}>{looking ? <Spinner /> : <Search className="h-4 w-4" />}Client Registry lookup</button></div>
            {inp('crId', 'Client Registry ID (CR)')}
            {inp('shaNumber', 'SHA number')}
          </div>
        </Card>
        <Card title="Demographics">
          <div className="grid gap-3 sm:grid-cols-3">
            {inp('firstName', 'First name *')}{inp('middleName', 'Middle name')}{inp('lastName', 'Last name *')}
            <Field label="Sex *"><select className="input" {...register('sex')}>{['FEMALE', 'MALE', 'INTERSEX', 'UNKNOWN'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            {inp('dateOfBirth', 'Date of birth', { type: 'date' })}
            <Field label="Blood group"><select className="input" {...register('bloodGroup')}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Marital status"><select className="input" {...register('maritalStatus')}><option value="">—</option>{['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            {inp('occupation', 'Occupation')}
          </div>
        </Card>
        <Card title="Contact & address">
          <div className="grid gap-3 sm:grid-cols-2">
            {inp('phone', 'Phone', { placeholder: '+2547…' })}{inp('email', 'Email', { type: 'email' })}
            {inp('county', 'County')}{inp('subCounty', 'Sub-county')}{inp('village', 'Village / estate')}
          </div>
        </Card>
        <Card title="Next of kin" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">{inp('nokName', 'Name')}{inp('nokRelationship', 'Relationship')}{inp('nokPhone', 'Phone')}</div>
        </Card>
      </div>
    </form>
  );
}
