/** NCD control targets (Kenya NCD guidelines): BP < 140/90; FBS < 7 mmol/L (or HbA1c < 7 %). */
export function ncdControlled(condition: string, v: { systolic?: number | null; diastolic?: number | null; fbs?: number | null; rbs?: number | null; hba1c?: number | null }): boolean | null {
  const parts: boolean[] = [];
  if (condition.includes('HTN') && v.systolic != null && v.diastolic != null) parts.push(v.systolic < 140 && v.diastolic < 90);
  if (condition.includes('DM')) {
    if (v.hba1c != null) parts.push(v.hba1c < 7);
    else if (v.fbs != null) parts.push(v.fbs < 7);
    else if (v.rbs != null) parts.push(v.rbs < 11.1);
  }
  return parts.length ? parts.every(Boolean) : null;
}
/** Default next FP visit by method (days). */
export const FP_REVISIT_DAYS: Record<string, number> = { PILLS_COC: 28 * 3, PILLS_POP: 28 * 3, INJECTABLE: 84, IMPLANT: 365 * 3, IUCD: 365, CONDOMS: 30, EC: 30, NATURAL: 90 };
