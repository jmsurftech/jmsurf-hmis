export interface RefRange {
  sex?: 'MALE' | 'FEMALE' | string | null;
  ageMinDays?: number | null;
  ageMaxDays?: number | null;
  low?: number | null;
  high?: number | null;
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

/** Choose the most specific matching range: sex-specific beats generic, narrower age band beats wider. */
export function pickRange(ranges: RefRange[] | null | undefined, sex?: string | null, ageDays?: number): RefRange | undefined {
  if (!ranges?.length) return undefined;
  const matches = ranges.filter((r) => {
    if (r.sex && sex && r.sex !== sex) return false;
    if (r.sex && !sex) return false;
    if (ageDays != null) {
      if (r.ageMinDays != null && ageDays < r.ageMinDays) return false;
      if (r.ageMaxDays != null && ageDays > r.ageMaxDays) return false;
    } else if (r.ageMinDays != null || r.ageMaxDays != null) {
      return false;
    }
    return true;
  });
  const width = (r: RefRange) => (r.ageMaxDays ?? 1e9) - (r.ageMinDays ?? 0);
  return matches.sort((a, b) => (b.sex ? 1 : 0) - (a.sex ? 1 : 0) || width(a) - width(b))[0];
}

/** Flag a numeric result: N, L, H, LL (critical low), HH (critical high). Non-numeric values return undefined. */
export function flagResult(value: string, range?: RefRange): { flag?: 'N' | 'L' | 'H' | 'LL' | 'HH'; isCritical: boolean } {
  const n = Number(String(value).replace(/[<>]/g, '').trim());
  if (!range || String(value).trim() === '' || Number.isNaN(n)) return { flag: undefined, isCritical: false };
  if (range.criticalLow != null && n <= range.criticalLow) return { flag: 'LL', isCritical: true };
  if (range.criticalHigh != null && n >= range.criticalHigh) return { flag: 'HH', isCritical: true };
  if (range.low != null && n < range.low) return { flag: 'L', isCritical: false };
  if (range.high != null && n > range.high) return { flag: 'H', isCritical: false };
  return { flag: 'N', isCritical: false };
}
