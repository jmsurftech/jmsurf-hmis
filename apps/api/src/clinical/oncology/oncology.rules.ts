/** Oncology dosing rules (pure). */

/** Mosteller BSA (m²) = sqrt(height_cm × weight_kg / 3600), rounded to 2 dp. */
export function bsaMosteller(heightCm: number, weightKg: number): number {
  if (!(heightCm > 0) || !(weightKg > 0)) throw new Error('Height and weight must be positive');
  if (heightCm > 260 || weightKg > 400) throw new Error('Height or weight out of range');
  return Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100;
}

export interface ProtocolDrug { drug: string; dose: number; unit: 'mg/m2' | 'mg/kg' | 'mg' | 'units/m2'; route?: string; days?: number[]; maxDose?: number }

/** Planned dose for one drug given BSA/weight and a % dose modification; capped at maxDose (e.g. vincristine 2 mg). */
export function plannedDose(d: ProtocolDrug, bsa: number, weightKg: number, modPct = 100): { drug: string; dose: number; unit: string; route?: string; days?: number[]; capped: boolean } {
  const base = d.unit === 'mg/m2' || d.unit === 'units/m2' ? d.dose * bsa : d.unit === 'mg/kg' ? d.dose * weightKg : d.dose;
  let dose = Math.round(base * (modPct / 100) * 10) / 10;
  let capped = false;
  if (d.maxDose != null && dose > d.maxDose) { dose = d.maxDose; capped = true; }
  return { drug: d.drug, dose, unit: d.unit.startsWith('units') ? 'units' : 'mg', route: d.route, days: d.days, capped };
}

/** Cycle dates: cycle n starts start + (n-1) × interval days. */
export function cycleDates(start: Date, cycles: number, intervalDays: number): Date[] {
  return Array.from({ length: cycles }, (_, i) => new Date(start.getTime() + i * intervalDays * 86400000));
}
