import type { PickerSource } from '@/components/EntityPicker';
import { fullName } from './format';

/** Shared picker sources for forms (each hits the real list endpoint). */
export const PICK = {
  patient: { path: '/patients', label: (p: any) => fullName(p), sub: (p: any) => [p.mrn, p.phone].filter(Boolean).join(' · ') },
  ward: { path: '/inpatient/wards', sub: (w: any) => w.type },
  bed: (wardId?: string, onlyAvailable = true): PickerSource => ({
    path: '/inpatient/wards',
    map: (wards) => wards.filter((w) => !wardId || w.id === wardId).flatMap((w) => (w.beds ?? []).filter((b: any) => !onlyAvailable || b.status === 'AVAILABLE').map((b: any) => ({ ...b, wardName: w.name }))),
    label: (b: any) => b.label, sub: (b: any) => `${b.wardName} · ${b.status}`,
  }),
  store: { path: '/inventory/stores', sub: (s: any) => s.type },
  supplier: { path: '/procurement/suppliers', sub: (s: any) => s.kraPin ?? s.phone },
  scheme: { path: '/payers/schemes', sub: (s: any) => s.payer?.name },
  payer: { path: '/payers', sub: (p: any) => p.type },
  stockItem: { path: '/inventory/items', sub: (i: any) => [i.code, i.unit].filter(Boolean).join(' · ') },
  serviceItem: (category?: string): PickerSource => ({ path: '/pricing/service-items', query: category ? { category } : undefined, sub: (s: any) => [s.code, s.category].filter(Boolean).join(' · ') }),
  practitioner: { path: '/admin/practitioners', idOf: (p: any) => p.userId ?? p.id, label: (p: any) => p.user ? fullName(p.user) : p.name ?? fullName(p), sub: (p: any) => [p.cadre, p.licenseNumber].filter(Boolean).join(' · ') },
  employee: { path: '/hr/employees', label: (e: any) => fullName(e), sub: (e: any) => e.staffNo },
  department: { path: '/admin/departments' },
  facility: { path: '/admin/facilities' },
  account: { path: '/finance/accounts', label: (a: any) => `${a.code} ${a.name}` },
  labTest: { path: '/lab/tests', sub: (t: any) => t.code },
} satisfies Record<string, PickerSource | ((...a: any[]) => PickerSource)>;

/** Queue service points (fixed set in the API). */
export const SERVICE_POINTS = ['REGISTRATION', 'TRIAGE', 'CONSULTATION', 'LAB', 'PHARMACY', 'CASHIER', 'RADIOLOGY', 'DENTAL', 'EYE', 'MATERNITY', 'DIALYSIS', 'THEATRE', 'PROCEDURE'];
