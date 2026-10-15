export interface RxWarning { type: 'ALLERGY' | 'DUPLICATE'; severity: 'HIGH' | 'MEDIUM'; message: string }

/** Drug classes used for cross-sensitivity allergy checks. */
const CLASSES: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'cloxacillin', 'flucloxacillin', 'benzylpenicillin', 'co-amoxiclav', 'augmentin', 'piperacillin'],
  sulfonamide: ['sulfamethoxazole', 'cotrimoxazole', 'co-trimoxazole', 'septrin', 'sulfadoxine', 'sulfasalazine'],
  nsaid: ['ibuprofen', 'diclofenac', 'aspirin', 'naproxen', 'indomethacin', 'meloxicam', 'piroxicam', 'ketorolac'],
  cephalosporin: ['ceftriaxone', 'cefuroxime', 'cefixime', 'cephalexin', 'cefazolin', 'ceftazidime'],
  quinolone: ['ciprofloxacin', 'levofloxacin', 'norfloxacin', 'ofloxacin', 'moxifloxacin'],
  macrolide: ['erythromycin', 'azithromycin', 'clarithromycin'],
  opioid: ['morphine', 'pethidine', 'codeine', 'tramadol', 'fentanyl'],
};

const norm = (s?: string | null) => (s ?? '').toLowerCase().trim();
const classesOf = (name: string) => Object.entries(CLASSES).filter(([cls, members]) => name.includes(cls) || members.some((m) => name.includes(m))).map(([c]) => c);

export function allergyWarnings(drug: { name: string; genericName?: string | null }, allergies: { substance: string; severity?: string | null }[]): RxWarning[] {
  const names = [norm(drug.name), norm(drug.genericName)].filter(Boolean);
  const drugClasses = new Set(names.flatMap(classesOf));
  const out: RxWarning[] = [];
  for (const a of allergies) {
    const sub = norm(a.substance);
    if (!sub) continue;
    const direct = names.some((n) => n.includes(sub) || sub.includes(n));
    const cls = classesOf(sub).find((c) => drugClasses.has(c));
    if (direct || cls) {
      out.push({
        type: 'ALLERGY', severity: 'HIGH',
        message: direct ? `Patient is allergic to ${a.substance}` : `Cross-sensitivity: ${drug.name} is a ${cls}; patient allergic to ${a.substance}`,
      });
    }
  }
  if (drugClasses.has('cephalosporin') && allergies.some((a) => classesOf(norm(a.substance)).includes('penicillin')))
    out.push({ type: 'ALLERGY', severity: 'MEDIUM', message: 'Possible penicillin–cephalosporin cross-reactivity' });
  return out;
}

export function duplicateWarnings(
  drug: { itemId: string; name: string; genericName?: string | null },
  active: { itemId: string; drugName: string; genericName?: string | null }[],
): RxWarning[] {
  const g = norm(drug.genericName) || norm(drug.name);
  const myClasses = new Set(classesOf(g));
  const out: RxWarning[] = [];
  for (const a of active) {
    const ag = norm(a.genericName) || norm(a.drugName);
    if (a.itemId === drug.itemId || ag === g) out.push({ type: 'DUPLICATE', severity: 'HIGH', message: `Duplicate: ${a.drugName} already prescribed on this visit` });
    else {
      const shared = classesOf(ag).find((c) => myClasses.has(c));
      if (shared) out.push({ type: 'DUPLICATE', severity: 'MEDIUM', message: `Duplicate therapy (${shared}): ${a.drugName} already prescribed` });
    }
  }
  return out;
}

/** Quantity from frequency × days, e.g. TDS × 5 = 15 doses. */
export const FREQ_PER_DAY: Record<string, number> = { OD: 1, STAT: 1, BD: 2, TDS: 3, QID: 4, QDS: 4, Q6H: 4, Q8H: 3, Q12H: 2, Q4H: 6, NOCTE: 1, PRN: 0 };
export const dosesPerDay = (freq: string) => FREQ_PER_DAY[freq?.toUpperCase().replace(/\s/g, '')] ?? 1;
