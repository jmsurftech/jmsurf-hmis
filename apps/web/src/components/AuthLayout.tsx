import Link from 'next/link';
import { Banknote, CloudOff, ShieldCheck, Stethoscope } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { MedicalFloat } from './MedicalArt';

const POINTS = [
  { icon: ShieldCheck, t: 'SHA-native', d: 'Eligibility, pre-auth and claims in the normal workflow.' },
  { icon: Banknote, t: 'Paid faster', d: 'Claims are checked before they are submitted.' },
  { icon: CloudOff, t: 'Works offline', d: 'Keep treating and billing when the internet drops.' },
  { icon: Stethoscope, t: 'Every department', d: 'From the front desk to theatre, lab and payroll.' },
];

/** Sign-in and sign-up frame: crimson story panel on the left (desktop), glass form card on the right. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="authwrap">
      <div className="glass-bubbles" aria-hidden>{[[60, 6, 200, 0], [90, 60, 160, 4], [52, 80, 120, 8]].map(([l, t, s, d]) => <span key={`${l}-${t}`} style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, animationDelay: `-${d}s` }} />)}</div>
      <aside className="auth-art">
        <span className="orb" style={{ width: 420, height: 420, background: '#ff9aa6', top: -160, right: -120 }} />
        <MedicalFloat tone="light" count={8} />
        <Link href="/" className="relative flex items-center gap-3 text-white no-underline">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-lg"><img src="/hmis-logo.svg" alt="" className="h-9 w-9" /></span>
          <span><b className="block text-lg font-extrabold">JMSURF HMIS</b><small className="text-white/80">Hospital management</small></span>
        </Link>
        <div className="relative">
          <h2>Certified-ready. Paid faster. Works offline.</h2>
          <p className="mt-4">One system for your whole facility, built for Kenya and ready for Africa.</p>
          <div className="mt-8 grid gap-4">{POINTS.map((p) => <div key={p.t} className="pt"><i><p.icon /></i><span>{p.t}<small>{p.d}</small></span></div>)}</div>
        </div>
        <div className="relative text-xs text-white/75">Powered by <b className="text-white">JMSURF TECHNOLOGIES</b></div>
      </aside>
      <div className="auth-side">
        <div className="absolute right-4 top-4 z-[2]"><ThemeToggle /></div>
        <div className="flex w-full flex-col items-center gap-5">
          {children}
          <div className="powered lg:hidden">JMSURF HMIS · Powered by <b>JMSURF TECHNOLOGIES</b></div>
        </div>
      </div>
    </div>
  );
}
