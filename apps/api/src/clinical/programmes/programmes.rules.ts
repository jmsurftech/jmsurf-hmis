/** HIV / TB programme rules (pure). */
export const VL_SUPPRESSION_THRESHOLD = 1000; // copies/mL (WHO / NASCOP)
export const VL_LDL_THRESHOLD = 50;

/** Virally suppressed when < 1000 copies/mL. LDL (lower than detectable) counts as suppressed. */
export function isSuppressed(copiesPerMl: number | null | undefined, ldl = false): boolean {
  if (ldl) return true;
  if (copiesPerMl == null || Number.isNaN(copiesPerMl) || copiesPerMl < 0) throw new Error('Viral load copies/mL required unless LDL');
  return copiesPerMl < VL_SUPPRESSION_THRESHOLD;
}
export function vlCategory(copies: number | null | undefined, ldl = false): 'LDL' | 'LLV' | 'UNSUPPRESSED' {
  if (ldl || (copies != null && copies < VL_LDL_THRESHOLD)) return 'LDL';
  return isSuppressed(copies, ldl) ? 'LLV' : 'UNSUPPRESSED';
}

/** Days late for a missed appointment → NASCOP tracing category. */
export function tracingCategory(daysLate: number): 'ON_TIME' | 'MISSED' | 'DEFAULTER' | 'LTFU' {
  if (daysLate <= 0) return 'ON_TIME';
  if (daysLate <= 30) return daysLate <= 7 ? 'MISSED' : 'DEFAULTER';
  return 'LTFU';
}

/** TB: intensive phase 2 months (56 doses) then continuation. */
export function tbPhaseFor(intensiveStart: Date, now = new Date()): 'INTENSIVE' | 'CONTINUATION' | 'COMPLETED' {
  const days = (now.getTime() - intensiveStart.getTime()) / 86400000;
  if (days < 56) return 'INTENSIVE';
  if (days < 168) return 'CONTINUATION';
  return 'COMPLETED';
}

/**
 * NASCOP / KenyaEMR-compatible line list columns. INDICATIVE ONLY: these mirror the commonly used
 * KenyaEMR "Current on ART" line-list fields; confirm against the current NASCOP data dictionary before submission.
 */
export const NASCOP_COLUMNS = [
  'CCC_Number', 'Patient_MRN', 'Sex', 'Date_of_Birth', 'Enrollment_Date', 'Entry_Point', 'WHO_Stage', 'ART_Start_Date',
  'Current_Regimen', 'Regimen_Line', 'PMTCT', 'Last_VL_Date', 'Last_VL_Result', 'VL_Suppressed', 'Next_Appointment', 'Status',
] as const;

export function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(columns: readonly string[], rows: Record<string, unknown>[]) {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvEscape(r[c])).join(','))].join('\n') + '\n';
}
