import Link from 'next/link';
import { Check, CloudOff, FileCheck2, ShieldCheck, Smartphone, Zap, Banknote } from 'lucide-react';
import { Logo } from '@/components/AppShell';

const tiers = [
  { name: 'Clinic', price: 'KES 4,999', per: '/month', desc: 'Outpatient clinics and medical centres', features: ['OPD, triage & queue', 'Lab, pharmacy & billing', 'SHA & insurance claims', 'M-Pesa & eTIMS receipts', 'Up to 10 staff users', 'Offline mode'] },
  { name: 'Hospital', price: 'KES 14,999', per: '/month', desc: 'Level 4–5 hospitals with inpatient care', features: ['Everything in Clinic', 'IPD, maternity, theatre, dialysis', 'Radiology & eMAR', 'Inventory & procurement', 'Finance, HR & payroll', 'Unlimited users'], highlight: true },
  { name: 'Enterprise', price: 'Custom', per: '', desc: 'Groups, faith-based networks & counties', features: ['Everything in Hospital', 'Multi-facility consolidation', 'Dedicated database option', 'SSO & custom integrations', 'On-site edge node', 'Named success manager'] },
];
const features = [
  { icon: ShieldCheck, title: 'Certified-ready', text: 'Built for the Kenya Digital Health Act: SHA, Client Registry, KMHFR, eTIMS and DHIS2 integration built in.' },
  { icon: Banknote, title: 'Paid faster', text: 'Claim scrubbing before you submit, a first-pass acceptance dashboard and M-Pesa STK at the till.' },
  { icon: CloudOff, title: 'Works offline', text: 'Keep registering, treating and billing when the internet drops. Records sync when the connection returns.' },
  { icon: FileCheck2, title: 'MOH reporting', text: 'MOH 705A/B and 717 generated on the fly, then pushed to DHIS2 in one click.' },
  { icon: Smartphone, title: 'Any device', text: 'Works on desktops, tablets and phones, with a TV display mode for queues.' },
  { icon: Zap, title: 'Live in a day', text: 'Self-service onboarding, CSV imports and no setup fee.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <nav className="flex items-center gap-2 text-sm"><a href="#pricing" className="hidden px-3 sm:block">Pricing</a><Link href="/login" className="btn-secondary">Sign in</Link><Link href="/signup" className="btn-primary">Start free</Link></nav>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
        <p className="mb-4 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">Hospital management for Kenya & Africa</p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Certified-ready. <span className="text-primary-600">Paid faster.</span> Works offline.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-400">JMSURF HMIS runs your whole facility, from reception to claims. Every department, every payer, and every compliance report in one place.</p>
        <div className="mt-8 flex justify-center gap-3"><Link href="/signup" className="btn-primary px-5 py-3 text-base">Create your facility</Link><a href="#pricing" className="btn-secondary px-5 py-3 text-base">See pricing</a></div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => <div key={f.title} className="card p-6"><f.icon className="mb-3 h-6 w-6 text-primary-600" /><h3 className="font-semibold">{f.title}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{f.text}</p></div>)}
      </section>
      <section id="pricing" className="bg-slate-50 py-16 dark:bg-slate-900/50">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">Simple, published pricing</h2>
          <p className="mt-2 text-center text-slate-600 dark:text-slate-400">No setup fee. Cancel anytime. Prices exclude VAT.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {tiers.map((t) => (
              <div key={t.name} className={`card flex flex-col p-6 ${t.highlight ? 'ring-2 ring-primary-500' : ''}`}>
                {t.highlight && <span className="mb-2 self-start rounded-full bg-primary-600 px-2 py-0.5 text-xs text-white">Most popular</span>}
                <h3 className="text-lg font-semibold">{t.name}</h3>
                <p className="text-sm text-slate-500">{t.desc}</p>
                <p className="my-4"><span className="text-3xl font-bold">{t.price}</span><span className="text-slate-500">{t.per}</span></p>
                <ul className="flex-1 space-y-2 text-sm">{t.features.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-primary-600" />{f}</li>)}</ul>
                <Link href={t.name === 'Enterprise' ? 'mailto:sales@jmsurf.co.ke' : '/signup'} className={`mt-6 ${t.highlight ? 'btn-primary' : 'btn-secondary'}`}>{t.name === 'Enterprise' ? 'Contact sales' : 'Get started'}</Link>
              </div>
            ))}
          </div>
          <div className="card mt-6 flex flex-col items-center justify-between gap-3 p-6 sm:flex-row">
            <div><h3 className="font-semibold">Pay per visit</h3><p className="text-sm text-slate-500">For low-volume or seasonal clinics: <b>KES 49 per patient visit</b>, with no monthly minimum.</p></div>
            <Link href="/signup" className="btn-secondary">Choose per-visit</Link>
          </div>
        </div>
      </section>
      <footer className="py-8 text-center text-xs text-slate-500">© {new Date().getFullYear()} JMSURF HMIS · Nairobi, Kenya</footer>
    </div>
  );
}
