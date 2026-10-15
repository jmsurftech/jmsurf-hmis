import { MOH705_CATEGORIES, mohCategoryFor, OTHER_CATEGORY } from './moh-mapping';

export function ageInYears(dob: Date | null | undefined, at: Date): number | null {
  if (!dob) return null;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export interface DiagnosisRow { code: string; codeSystem: string; visitDate: Date; dateOfBirth: Date | null; sex?: string }

/**
 * Aggregate OPD diagnoses into MOH 705A (under 5) or 705B (5 and over). Patients without DOB are counted in 705B.
 * Returns one row per category (all categories present, zero-filled) plus TOTAL.
 */
export function moh705(rows: DiagnosisRow[], form: '705A' | '705B') {
  const counts = new Map<string, { male: number; female: number; total: number }>();
  const cats = MOH705_CATEGORIES.filter((c) => !c.only || c.only === form);
  for (const c of cats) counts.set(c.key, { male: 0, female: 0, total: 0 });
  const unmappedCodes = new Map<string, number>();
  for (const r of rows) {
    const age = ageInYears(r.dateOfBirth, r.visitDate);
    const under5 = age !== null && age < 5;
    if ((form === '705A') !== under5) continue;
    let cat = mohCategoryFor(r.code, r.codeSystem);
    if (cat.only && cat.only !== form) cat = OTHER_CATEGORY;
    if (cat === OTHER_CATEGORY) unmappedCodes.set(r.code, (unmappedCodes.get(r.code) ?? 0) + 1);
    const c = counts.get(cat.key)!;
    c.total++;
    if (r.sex === 'MALE') c.male++; else if (r.sex === 'FEMALE') c.female++;
  }
  const out = cats.map((c) => ({ key: c.key, label: c.label, ...counts.get(c.key)!, value: counts.get(c.key)!.total }));
  const total = out.reduce((s, r) => s + r.total, 0);
  out.push({ key: 'TOTAL', label: 'Total', male: out.reduce((s, r) => s + r.male, 0), female: out.reduce((s, r) => s + r.female, 0), total, value: total });
  return { rows: out, unmappedCodes: [...unmappedCodes.entries()].map(([code, count]) => ({ code, count })) };
}
