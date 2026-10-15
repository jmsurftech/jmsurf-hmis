/** Urea reduction ratio (%) = (pre − post) / pre × 100. */
export function urr(preUrea: number, postUrea: number): number {
  if (preUrea <= 0) throw new Error('Pre-dialysis urea must be positive');
  return Math.round(((preUrea - postUrea) / preUrea) * 1000) / 10;
}

/** Single-pool Kt/V (Daugirdas II): −ln(R − 0.008·t) + (4 − 3.5·R)·UF/W. t in hours, UF litres, W post-weight kg. */
export function ktvDaugirdas(preUrea: number, postUrea: number, hours: number, ufLitres: number, postWeightKg: number): number {
  if (preUrea <= 0 || postWeightKg <= 0) throw new Error('Invalid inputs');
  const R = postUrea / preUrea;
  const v = -Math.log(R - 0.008 * hours) + (4 - 3.5 * R) * (ufLitres / postWeightKg);
  return Math.round(v * 100) / 100;
}

export const adequacy = (ktv: number, urrPct: number) => ({ ktvAdequate: ktv >= 1.2, urrAdequate: urrPct >= 65 });

/** Generate recurring session datetimes on given weekdays (0=Sun) for N weeks from a start date at HH:mm. */
export function recurringDates(start: Date, weekdays: number[], weeks: number, time: string): Date[] {
  const [h, m] = time.split(':').map(Number);
  const out: Date[] = [];
  const s = new Date(start);
  for (let i = 0; i < weeks * 7; i++) {
    const day = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i, h, m || 0);
    if (weekdays.includes(day.getDay())) out.push(day);
  }
  return out;
}
