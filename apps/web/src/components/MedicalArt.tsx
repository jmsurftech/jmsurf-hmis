import { Ambulance, Bandage, Dna, HeartPulse, Microscope, Pill, Stethoscope, Syringe, Thermometer, TestTube } from 'lucide-react';
import { cn } from '@/lib/cn';

/** [icon, left %, top %, size px, float delay s, rotate deg] */
const ITEMS: [React.ElementType, number, number, number, number, number][] = [
  [Stethoscope, 6, 14, 46, 0, -12], [Pill, 88, 10, 34, 2, 24], [HeartPulse, 78, 72, 40, 4, 0], [Syringe, 14, 78, 34, 1, 38],
  [Dna, 50, 6, 30, 3, 0], [Microscope, 94, 44, 36, 5, -8], [Thermometer, 32, 88, 28, 2.5, 18], [TestTube, 64, 90, 28, 1.5, -20],
  [Bandage, 2, 46, 30, 3.5, 30], [Ambulance, 40, 50, 30, 6, 0],
];

/** Slow-drifting medical icons behind a section. `tone="light"` is for the crimson hero cards. */
export function MedicalFloat({ tone = 'brand', count = ITEMS.length, className }: { tone?: 'brand' | 'light'; count?: number; className?: string }) {
  return (
    <div className={cn('med-float', tone === 'light' && 'light', className)} aria-hidden>
      {ITEMS.slice(0, count).map(([Icon, l, t, s, d, r], i) => (
        <span key={i} style={{ left: `${l}%`, top: `${t}%`, animationDelay: `-${d}s`, ['--r' as string]: `${r}deg` } as React.CSSProperties}><Icon style={{ width: s, height: s }} /></span>
      ))}
    </div>
  );
}

/** Heart-monitor trace that sweeps across, with a glowing head. */
export function EcgLine({ className, tone = 'brand' }: { className?: string; tone?: 'brand' | 'light' }) {
  const d = 'M0 40 H120 L135 40 L145 18 L155 62 L165 6 L177 70 L188 40 H300 L312 40 L320 30 L328 40 H420 L435 40 L445 18 L455 62 L465 6 L477 70 L488 40 H600 L612 40 L620 30 L628 40 H800';
  return (
    <svg className={cn('ecg', tone === 'light' && 'light', className)} viewBox="0 0 800 80" preserveAspectRatio="none" aria-hidden>
      <path d={d} className="ecg-base" />
      <path d={d} className="ecg-trace" pathLength={1} />
    </svg>
  );
}

/** Stethoscope drawing whose chest-piece pulses with a heartbeat. */
export function StethoscopeArt({ className }: { className?: string }) {
  return (
    <svg className={cn('steth', className)} viewBox="0 0 200 220" fill="none" aria-hidden>
      <path className="steth-tube" d="M54 18 C54 70, 60 104, 100 112 C140 104, 146 70, 146 18" />
      <path className="steth-tube" d="M100 112 C100 150, 120 172, 150 168" />
      <circle cx="54" cy="16" r="8" className="steth-ear" /><circle cx="146" cy="16" r="8" className="steth-ear" />
      <g className="steth-head"><circle cx="160" cy="172" r="26" className="steth-bell" /><circle cx="160" cy="172" r="14" className="steth-disc" /></g>
      <circle cx="160" cy="172" r="26" className="steth-ring" />
      <path className="steth-heart" d="M160 182 l-9-9 a6 6 0 0 1 9-8 a6 6 0 0 1 9 8 z" />
    </svg>
  );
}
