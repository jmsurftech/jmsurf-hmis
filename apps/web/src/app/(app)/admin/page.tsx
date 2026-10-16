'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Card, Field, Loading, PageHeader, Spinner } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { AiSettingsCard } from '@/components/AiSettingsCard';

/** Tenant settings: top-level tenant fields plus free-form `settings` JSON (address, receipts, integrations…). */
export default function AdminSettings() {
  const { data, isLoading } = useGet<any>('/admin/tenant');
  const { register, handleSubmit, reset, watch } = useForm<Record<string, any>>();
  useEffect(() => { if (data) reset({ ...data, ...(data.settings ?? {}), integrations: data.settings?.integrations ?? {} }); }, [data, reset]);
  const save = useAction('patch', '/admin/tenant', { invalidate: ['/admin/tenant'], success: 'Settings saved' });
  const color = watch('primaryColor') || '#0d7c80';
  if (isLoading) return <Loading />;
  const submit = (v: Record<string, any>) => save.mutate({
    name: v.name, logoUrl: v.logoUrl || undefined, primaryColor: v.primaryColor || undefined, kraPin: v.kraPin || undefined, timezone: v.timezone || undefined,
    settings: { phone: v.phone, address: v.address, customDomain: v.customDomain, receiptHeader: v.receiptHeader, receiptFooter: v.receiptFooter, mpesaShortcode: v.integrations?.mpesaShortcode, integrations: v.integrations },
  });
  return (
    <form onSubmit={handleSubmit(submit)}>
      <PageHeader title="Settings & branding" actions={<button className="btn-primary" disabled={save.isPending}>{save.isPending && <Spinner />}Save</button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Organisation"><div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className="input" {...register('name')} /></Field><Field label="KRA PIN"><input className="input" {...register('kraPin')} /></Field>
          <Field label="Country"><input className="input" disabled {...register('countryCode')} /></Field><Field label="Currency"><input className="input" disabled {...register('currency')} /></Field>
          <Field label="Timezone"><input className="input" {...register('timezone')} /></Field><Field label="Phone"><input className="input" {...register('phone')} /></Field>
          <Field label="Address" className="sm:col-span-2"><input className="input" {...register('address')} /></Field></div></Card>
        <Card title="Branding"><div className="grid gap-3 sm:grid-cols-2">
          <Field label="Logo URL" className="sm:col-span-2"><input className="input" {...register('logoUrl')} /></Field>
          <Field label="Primary colour"><input type="color" className="h-10 w-full rounded" {...register('primaryColor')} /></Field>
          <Field label="Custom domain"><input className="input" placeholder="hmis.myhospital.co.ke" {...register('customDomain')} /></Field>
          <Field label="Receipt header" className="sm:col-span-2"><textarea className="input" rows={2} {...register('receiptHeader')} /></Field>
          <Field label="Receipt footer" className="sm:col-span-2"><textarea className="input" rows={2} {...register('receiptFooter')} /></Field>
          <div className="rounded-lg p-3 text-sm text-white sm:col-span-2" style={{ background: color }}>Preview: {watch('name') || 'Your facility'}</div></div></Card>
        <Card title="Integrations" className="lg:col-span-2"><div className="grid gap-3 sm:grid-cols-3">
          <Field label="SHA facility ID"><input className="input" {...register('integrations.shaFacilityId')} /></Field>
          <Field label="M-Pesa paybill / till"><input className="input" {...register('integrations.mpesaShortcode')} /></Field>
          <Field label="eTIMS device serial"><input className="input" {...register('integrations.etimsSerial')} /></Field>
          <Field label="DHIS2 org unit"><input className="input" {...register('integrations.dhis2OrgUnit')} /></Field>
          <Field label="SMS sender ID"><input className="input" {...register('integrations.smsSenderId')} /></Field></div></Card>
        <AiSettingsCard />
      </div>
    </form>
  );
}
