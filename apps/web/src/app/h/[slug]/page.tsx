'use client';
import { CalendarPlus, MapPin, Phone, Stethoscope, Video } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

const kes = (m: number) => `KES ${(m / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

export default function FacilityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [f, setF] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/public/facilities/${encodeURIComponent(slug)}`).then(async (r) => { if (!r.ok) throw new Error('Facility not found'); setF(await r.json()); }).catch((e) => setErr(e.message));
  }, [slug]);
  if (err) return <div className="flex min-h-screen items-center justify-center p-6 text-slate-500">{err}</div>;
  if (!f) return <div className="flex min-h-screen items-center justify-center p-6 text-slate-400">Loading…</div>;
  const color = f.primaryColor || '#0d7c80';
  const main = f.facilities[0];
  const groups: Record<string, any[]> = {};
  for (const s of f.services) (groups[s.category] ||= []).push(s);
  const book = `/portal?tenant=${encodeURIComponent(f.slug)}`;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="px-4 pb-10 pt-8 text-white" style={{ background: color }}>
        <div className="mx-auto max-w-3xl">
          {f.logoUrl && <img src={f.logoUrl} alt="" className="mb-3 h-12 w-12 rounded-lg bg-white object-contain p-1" />}
          <h1 className="text-2xl font-bold sm:text-3xl">{f.name}</h1>
          {main && <p className="mt-1 flex items-center gap-1 text-sm opacity-90"><MapPin className="h-4 w-4" />{[main.address, main.county].filter(Boolean).join(', ') || 'Kenya'}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={book} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold" style={{ color }}><CalendarPlus className="h-4 w-4" />Book an appointment</Link>
            {main?.phone && <a href={`tel:${main.phone}`} className="inline-flex items-center gap-2 rounded-xl border border-white/50 px-4 py-2.5 text-sm"><Phone className="h-4 w-4" />{main.phone}</a>}
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-6 max-w-3xl space-y-4 px-4 pb-12">
        {f.telemedicine && (
          <section className="card flex items-center gap-3 p-4"><Video className="h-8 w-8 shrink-0" style={{ color }} />
            <div className="flex-1"><p className="font-semibold">See a doctor by video</p><p className="text-sm text-slate-500">Book a video consultation, pay by M-Pesa and join from your phone.</p></div>
            <Link href={book} className="btn-primary">Book</Link></section>)}
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Our clinicians</h2>
          <div className="grid gap-2 sm:grid-cols-2">{f.practitioners.map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800"><Stethoscope className="h-4 w-4 text-slate-400" /><div><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.specialty ?? p.cadre.replace('_', ' ').toLowerCase()}</p></div></div>))}</div>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Services</h2>
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat} className="mb-3"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</p>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{items.map((s) => <li key={s.name} className="flex justify-between py-1.5"><span>{s.name}</span><span className="text-slate-500">{kes(s.basePriceMinor)}</span></li>)}</ul></div>))}
        </section>
        {f.facilities.length > 1 && <section className="card p-4"><h2 className="mb-2 font-semibold">Branches</h2>{f.facilities.map((x: any) => <p key={x.id} className="text-sm">{x.name}{x.county ? `, ${x.county}` : ''}{x.phone ? ` · ${x.phone}` : ''}</p>)}</section>}
        <p className="text-center text-xs text-slate-400">Powered by JMSURF HMIS</p>
      </main>
    </div>
  );
}
