import Link from 'next/link';
import {
  Activity, ArrowRight, Baby, Banknote, BarChart3, BedDouble, Building2, Check, ClipboardCheck, CloudOff, Droplets, FileCheck2, FlaskConical, HeartPulse, Home,
  Landmark, ListOrdered, Lock, Package, Pill, Plus, Receipt, ScanLine, Scissors, ShieldCheck, Smartphone, Stethoscope, Users, Wallet, Zap,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const MODULES = [
  { icon: Users, t: 'Patients & registry', d: 'Client Registry lookup, SHA number, covers, allergies, next of kin.' },
  { icon: ListOrdered, t: 'Queues & appointments', d: 'Tokens per service point, TV display, doctor calendars.' },
  { icon: Stethoscope, t: 'Outpatient EMR', d: 'Triage (SATS), vitals with NEWS2, SOAP notes, ICD-11 diagnoses.' },
  { icon: FlaskConical, t: 'Laboratory', d: 'Collect, result and verify with reference ranges and flags.' },
  { icon: ScanLine, t: 'Radiology', d: 'Imaging worklist, reports and verification.' },
  { icon: Pill, t: 'Pharmacy & OTC', d: 'E-prescriptions, FEFO dispensing and a counter point of sale.' },
  { icon: BedDouble, t: 'Inpatient & eMAR', d: 'Bed board, admissions, ward rounds, medication rounds, discharge.' },
  { icon: Baby, t: 'Maternity', d: 'ANC, delivery, newborn records and the KEPI immunisation schedule.' },
  { icon: Scissors, t: 'Theatre', d: 'Bookings with clash checks and the WHO surgical safety checklist.' },
  { icon: Droplets, t: 'Dialysis', d: 'Chair schedule, sessions and Kt/V for the renal package.' },
  { icon: Home, t: 'Home care', d: 'Home visits with GPS check-in and check-out.' },
  { icon: Receipt, t: 'Billing & cashier', d: 'Price lists per payer, co-pay split, shifts, M-Pesa and eTIMS.' },
  { icon: FileCheck2, t: 'SHA & insurance claims', d: 'Eligibility, pre-auth, scrubber, FHIR submission, remittance.' },
  { icon: Package, t: 'Inventory & procurement', d: 'Stores, batches and expiry, requisitions, LPOs and GRNs.' },
  { icon: Landmark, t: 'Finance', d: 'Automatic journals, trial balance and financial statements.' },
  { icon: Wallet, t: 'HR & Kenya payroll', d: 'PAYE, SHIF, NSSF, housing levy and P10 export.' },
  { icon: BarChart3, t: 'Reports & MOH', d: 'KPI dashboard, MOH 705A/B and 717, DHIS2 push.' },
  { icon: ShieldCheck, t: 'Quality & audit', d: 'Incidents, complaints and a tamper-evident audit log.' },
];
const FLOW = [
  { t: 'Check eligibility', d: 'The visit opens with a live SHA check that shows which fund covers it.' },
  { t: 'Treat and code', d: 'ICD-11 diagnoses and SHA intervention codes are captured as care happens.' },
  { t: 'Scrub before you submit', d: 'Missing codes, tariff gaps and pre-auth problems are flagged first.' },
  { t: 'Submit and track', d: 'Claims go over FHIR R4, with status, queries and resubmission in one place.' },
  { t: 'Reconcile', d: 'Remittance advice is matched to claims automatically, with ageing by payer.' },
];
const TIERS = [
  { name: 'Clinic', price: 'KES 4,999', per: '/month', desc: 'Outpatient clinics and medical centres', features: ['OPD, triage and queues', 'Lab, pharmacy and billing', 'SHA and insurance claims', 'M-Pesa and eTIMS receipts', 'Up to 10 staff users', 'Offline mode'] },
  { name: 'Hospital', price: 'KES 14,999', per: '/month', desc: 'Level 4 and 5 hospitals with inpatient care', features: ['Everything in Clinic', 'IPD, maternity, theatre, dialysis', 'Radiology and eMAR', 'Inventory and procurement', 'Finance, HR and payroll', 'Unlimited users'], hot: true },
  { name: 'Enterprise', price: 'Custom', per: '', desc: 'Groups, faith-based networks and counties', features: ['Everything in Hospital', 'Multi-facility consolidation', 'Dedicated database option', 'SSO and custom integrations', 'On-site edge node', 'Named success manager'] },
];
const FAQ = [
  ['Is JMSURF HMIS ready for SHA?', 'Yes. Eligibility, pre-authorisation, claims and remittance are part of the core workflow, and the SHA connection is configured per facility once your credentials are issued.'],
  ['Can we keep working when the internet drops?', 'Yes. Registration, consultation and cash billing continue offline, and records sync safely when the connection returns.'],
  ['Do you issue eTIMS receipts?', 'Yes. Receipts are signed through KRA eTIMS with the QR code printed on the receipt, and M-Pesa STK push is built into the till.'],
  ['How long does it take to go live?', 'Most facilities are live within two days: create the account, load price lists and stock with CSV templates, add users and start seeing patients.'],
  ['Where is our data kept and who can see it?', 'Each facility is isolated, every read of a sensitive record and every change is written to a tamper-evident audit log, and access is limited by role and facility.'],
  ['Can we move from our current system?', 'Yes. Patients, price lists, stock and opening balances import from CSV or Excel templates, and our team can help with the move.'],
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="glass-bubbles" aria-hidden>{[[-4, 8, 240, 0], [88, 4, 280, 3], [72, 52, 180, 6], [6, 60, 150, 9], [44, 30, 110, 4]].map(([l, t, s, d]) => <span key={`${l}-${t}`} style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, animationDelay: `-${d}s` }} />)}</div>
      <div className="relative z-[1] px-3 sm:px-5">
        <header className="lp-nav">
          <Link href="/" className="brandrow" style={{ color: 'inherit', flex: 'none' }}><span className="brand-logo" style={{ width: 42, height: 42, borderRadius: 14 }}><img src="/hmis-logo.svg" alt="" style={{ width: 32, height: 32 }} /></span><span><b>JMSURF HMIS</b></span></Link>
          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex"><a href="#modules">Modules</a><a href="#claims">SHA claims</a><a href="#offline">Offline</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className="btn hide-sm">Sign in</Link>
            <Link href="/signup" className="btn primary">Start free</Link>
          </div>
        </header>

        {/* Hero */}
        <section className="lp-sec grid items-center gap-12 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <span className="lp-eyebrow"><HeartPulse className="h-4 w-4" />Hospital management for Kenya and Africa</span>
            <h1 className="lp-h1 mt-6">Certified-ready.<br /><span className="gradtext">Paid faster.</span><br />Works offline.</h1>
            <p className="lp-lead mt-6 max-w-xl">JMSURF HMIS runs your whole facility, from the front desk to the claims office: every department, every payer and every MOH report in one place.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn primary lg">Create your facility<ArrowRight /></Link>
              <a href="#pricing" className="btn lg">See pricing</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              {['SHA, Client Registry and KMHFR', 'KRA eTIMS', 'M-Pesa STK and Paybill', 'DHIS2 / KHIS'].map((x) => <span key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-brand" />{x}</span>)}
            </div>
          </div>
          <HeroMock />
        </section>

        {/* Stats band */}
        <section className="mx-auto grid max-w-[1200px] grid-cols-2 gap-4 px-0 pb-6 sm:px-5 md:grid-cols-4">
          {[['18', 'departments in one system'], ['3', 'SHA funds covered: PHC, SHIF, ECCIF'], ['48 h', 'from sign-up to live'], ['0', 'setup fee']].map(([v, l]) => (
            <div key={l} className="card px-6 py-5"><div className="text-3xl font-extrabold tracking-tight text-brand">{v}</div><div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{l}</div></div>
          ))}
        </section>

        {/* Modules */}
        <section id="modules" className="lp-sec">
          <div className="mx-auto max-w-2xl text-center">
            <span className="lp-eyebrow"><Activity className="h-4 w-4" />Every department</span>
            <h2 className="lp-h2 mt-5">One system from reception to the boardroom</h2>
            <p className="lp-lead mt-4">Each module shares the same patient record and the same bill, so nothing is typed twice and nothing goes unbilled.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div key={m.t} className="card hover lp-feature flex gap-4 p-5">
                <span className="fi shrink-0"><m.icon /></span>
                <div><h3 className="m-0 text-[15.5px] font-extrabold">{m.t}</h3><p className="m-0 mt-1 text-sm text-slate-600 dark:text-slate-400">{m.d}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* Claims flow */}
        <section id="claims" className="lp-sec">
          <div className="hero-card grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_1.2fr]">
            <span className="orb" style={{ width: 380, height: 380, background: '#ff9aa6', top: -140, right: -80 }} />
            <div className="relative">
              <span className="chipw"><Banknote className="h-4 w-4" />Claims intelligence</span>
              <h2 className="lp-h2 mt-5 text-white">Get paid on the first submission</h2>
              <p className="muted mt-4 text-[16px] leading-relaxed">The claims workbench checks every claim against SHA and insurer rules before it leaves the building, then follows it until the money lands. Track first-pass acceptance and ageing by payer on one screen.</p>
              <Link href="/signup" className="btn white lg mt-8">Start with claims<ArrowRight /></Link>
            </div>
            <ol className="relative m-0 flex list-none flex-col gap-3 p-0">
              {FLOW.map((s, i) => (
                <li key={s.t} className="flex gap-4 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white font-extrabold text-brand">{i + 1}</span>
                  <div><b className="text-[15px]">{s.t}</b><p className="muted m-0 mt-0.5 text-sm">{s.d}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Offline + security */}
        <section id="offline" className="lp-sec grid gap-5 md:grid-cols-3">
          {[
            { icon: CloudOff, t: 'Works offline', d: 'Keep registering, treating and billing when the internet drops. Every change is queued and synced safely when the connection returns.' },
            { icon: Lock, t: 'Private by design', d: 'Role- and facility-based access, consent records, encrypted sensitive notes and a hash-chained audit log for the Data Protection Act.' },
            { icon: Smartphone, t: 'Any device', d: 'Desktops, tablets and phones, light or dark, with a TV display mode for queues and a touch-friendly ward view.' },
            { icon: Zap, t: 'Live in two days', d: 'Self-service sign-up, CSV import for patients, prices and stock, and a guided setup for departments and payers.' },
            { icon: Building2, t: 'Multi-facility', d: 'Run branches under one organisation with shared patient records, stock transfers and consolidated reports.' },
            { icon: ClipboardCheck, t: 'Compliance pack', d: 'DPIA, backup and recovery policy, HMIS self-attestation evidence and conformance tests for DHA certification.' },
          ].map((f) => (
            <div key={f.t} className="card lp-feature p-6"><span className="fi"><f.icon /></span><h3 className="m-0 mt-4 text-lg font-extrabold">{f.t}</h3><p className="m-0 mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.d}</p></div>
          ))}
        </section>

        {/* Pricing */}
        <section id="pricing" className="lp-sec">
          <div className="mx-auto max-w-2xl text-center">
            <span className="lp-eyebrow"><Receipt className="h-4 w-4" />Simple, published pricing</span>
            <h2 className="lp-h2 mt-5">No setup fee. Cancel anytime.</h2>
            <p className="lp-lead mt-4">Prices are in Kenya shillings and exclude VAT.</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {TIERS.map((t) => (
              <div key={t.name} className={`card lp-price flex flex-col p-7 ${t.hot ? 'hot' : ''}`}>
                <div className="flex items-center justify-between"><h3 className="m-0 text-xl font-extrabold">{t.name}</h3>{t.hot && <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">Most popular</span>}</div>
                <p className={`m-0 mt-1 text-sm ${t.hot ? 'muted-w' : 'text-slate-500'}`}>{t.desc}</p>
                <p className="m-0 my-6"><span className="text-4xl font-extrabold tracking-tight">{t.price}</span><span className={t.hot ? 'muted-w' : 'text-slate-500'}>{t.per}</span></p>
                <ul className="m-0 flex flex-1 list-none flex-col gap-2.5 p-0 text-sm">{t.features.map((f) => <li key={f} className="flex gap-2.5"><Check className={`h-4 w-4 shrink-0 ${t.hot ? '' : 'text-brand'}`} />{f}</li>)}</ul>
                <Link href={t.name === 'Enterprise' ? 'mailto:info@jmsurf.co.ke?subject=JMSURF%20HMIS%20Enterprise' : '/signup'} className={`btn lg mt-7 ${t.hot ? 'white' : t.name === 'Clinic' ? 'primary' : ''}`} style={t.hot ? { background: '#fff', color: 'var(--brand)', borderColor: '#fff' } : undefined}>{t.name === 'Enterprise' ? 'Talk to us' : 'Get started'}</Link>
              </div>
            ))}
          </div>
          <div className="card mt-5 flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div><h3 className="m-0 text-lg font-extrabold">Pay per visit</h3><p className="m-0 mt-1 text-sm text-slate-600 dark:text-slate-400">For low-volume or seasonal clinics: <b>KES 49 per patient visit</b>, with no monthly minimum.</p></div>
            <Link href="/signup" className="btn">Choose per visit<ArrowRight /></Link>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="lp-sec lp-faq">
          <div className="mx-auto max-w-2xl text-center"><h2 className="lp-h2">Questions facilities ask</h2></div>
          <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-3">
            {FAQ.map(([q, a]) => <details key={q} className="card"><summary>{q}<Plus className="h-5 w-5" /></summary><p>{a}</p></details>)}
          </div>
        </section>

        {/* CTA */}
        <section className="lp-sec pt-0">
          <div className="card flex flex-col items-center gap-5 px-6 py-14 text-center">
            <img src="/hmis-logo.svg" alt="" className="h-16 w-16" />
            <h2 className="lp-h2 max-w-2xl">Bring your whole facility onto one system this week</h2>
            <p className="lp-lead m-0 max-w-xl">Create your facility in minutes and invite your team. No setup fee.</p>
            <div className="flex flex-wrap justify-center gap-3"><Link href="/signup" className="btn primary lg">Create your facility<ArrowRight /></Link><Link href="/login" className="btn lg">Sign in</Link></div>
          </div>
        </section>

        <footer className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 border-t border-slate-200/70 px-2 py-8 text-sm text-slate-500 sm:flex-row dark:border-slate-800">
          <span>© {new Date().getFullYear()} JMSURF HMIS · Nairobi, Kenya</span>
          <span>Powered by <b className="text-slate-700 dark:text-slate-200">JMSURF TECHNOLOGIES</b></span>
        </footer>
      </div>
    </div>
  );
}

/** Product preview built from the real UI pieces, with neutral labels instead of invented people. */
function HeroMock() {
  return (
    <div className="lp-mock">
      <div className="grid grid-cols-[150px_1fr] gap-3 max-sm:grid-cols-1">
        <div className="card hidden flex-col gap-1 p-3 sm:flex">
          {[['Dashboard', BarChart3, true], ['Patients', Users], ['Queue', ListOrdered], ['OPD', Stethoscope], ['Laboratory', FlaskConical], ['Pharmacy', Pill], ['Billing', Receipt], ['Claims', FileCheck2]].map(([l, I, on]: any) => (
            <span key={l} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold ${on ? 'bg-white text-brand shadow dark:bg-slate-800' : 'text-slate-600 dark:text-slate-300'}`}><I className="h-4 w-4" />{l}</span>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            {[['Visits today', '128', Users, 'var(--brand)'], ['Collected', 'KES 412k', Banknote, 'var(--ok)'], ['Beds in use', '81%', BedDouble, 'var(--info)']].map(([l, v, I, c]: any) => (
              <div key={l} className="card p-3.5" style={{ ['--k' as string]: c }}><div className="flex items-center gap-1.5 text-[11.5px] font-extrabold"><I className="h-4 w-4" style={{ color: c }} />{l}</div><div className="mt-2 text-xl font-extrabold tracking-tight">{v}</div></div>
            ))}
          </div>
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between text-[13px] font-extrabold">Claims this month<span className="badge green"><span className="dot" />96% first pass</span></div>
            <div className="flex h-28 items-end gap-2">{[38, 52, 46, 64, 58, 72, 66, 84, 78, 92, 88, 96].map((h, i) => <span key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%`, background: i === 11 ? 'linear-gradient(180deg, #df5264, #bd2332)' : 'rgb(189 35 50 / .18)' }} />)}</div>
          </div>
          <div className="card p-4">
            <div className="mb-2 text-[13px] font-extrabold">Queue · Consultation</div>
            {[['T-021', 'Patient 1', 'Serving', 'blue'], ['T-022', 'Patient 2', 'Called', 'amber'], ['T-023', 'Patient 3', 'Waiting', '']].map(([t, n, s, c]) => (
              <div key={t} className="list-row text-[13px]"><span className="token" style={{ minWidth: 48, height: 34, fontSize: 13, borderRadius: 11 }}>{t}</span><b className="flex-1">{n}</b><span className={`badge ${c}`}><span className="dot" />{s}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
