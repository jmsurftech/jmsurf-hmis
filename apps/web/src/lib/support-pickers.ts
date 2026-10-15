import type { PickerSource } from '@/components/EntityPicker';
import { fullName } from './format';

const day = 86400000;
/** Pickers used by the clinical support & programme pages. */
export const SPICK = {
  admission: { path: '/inpatient/admissions', label: (a: any) => fullName(a.visit?.patient), sub: (a: any) => [a.visit?.patient?.mrn, a.visit?.visitNumber].filter(Boolean).join(' · ') } as PickerSource,
  surgery: (): PickerSource => ({ path: '/theatre/bookings', query: { from: new Date(Date.now() - 7 * day).toISOString(), to: new Date(Date.now() + 14 * day).toISOString() }, label: (s: any) => s.procedure, sub: (s: any) => `${s.theatre} · ${new Date(s.scheduledStart).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` }),
  ambulance: { path: '/ems/ambulances', label: (a: any) => `${a.regNumber}${a.callSign ? ` (${a.callSign})` : ''}`, sub: (a: any) => `${a.type} · ${a.status}` } as PickerSource,
  availableAmbulance: { path: '/ems/ambulances', map: (r: any[]) => r.filter((a) => a.status === 'AVAILABLE'), label: (a: any) => `${a.regNumber}${a.callSign ? ` (${a.callSign})` : ''}`, sub: (a: any) => a.type } as PickerSource,
  donor: { path: '/blood-bank/donors', label: (d: any) => `${d.firstName} ${d.lastName}`, sub: (d: any) => [d.donorNumber, d.abo && `${d.abo}${d.rh === 'POS' ? '+' : '-'}`].filter(Boolean).join(' · ') } as PickerSource,
  compartment: { path: '/mortuary/compartments', map: (r: any[]) => r.filter((c) => c.status === 'AVAILABLE'), label: (c: any) => c.label, sub: (c: any) => c.type } as PickerSource,
  instrumentSet: (status?: string): PickerSource => ({ path: '/cssd/sets', query: status ? { status } : undefined, label: (s: any) => `${s.code} – ${s.name}`, sub: (s: any) => s.status }),
  protocol: { path: '/oncology/protocols', label: (p: any) => `${p.code} – ${p.name}`, sub: (p: any) => `${p.cycles} cycles q${p.intervalDays}d` } as PickerSource,
  ward: { path: '/inpatient/wards', sub: (w: any) => w.type } as PickerSource,
};
export const groupLabel = (abo?: string | null, rh?: string | null) => (abo ? `${abo}${rh === 'POS' ? '+' : rh === 'NEG' ? '-' : ''}` : '—');
