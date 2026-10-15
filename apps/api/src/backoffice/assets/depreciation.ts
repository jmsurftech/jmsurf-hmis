/** Straight-line depreciation (pure). Monthly convention: depreciation starts in the month of purchase. */
export interface DepreciationInput {
  costMinor: number;
  usefulLifeYears: number;
  purchaseDate: Date;
  residualMinor?: number;
}

export function monthsBetween(from: Date, to: Date) {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) + 1;
}

export function straightLine(a: DepreciationInput, asOf: Date) {
  const residual = a.residualMinor ?? 0;
  const depreciable = Math.max(0, a.costMinor - residual);
  const lifeMonths = Math.max(1, Math.round(a.usefulLifeYears * 12));
  const monthly = depreciable / lifeMonths;
  const elapsed = asOf < a.purchaseDate ? 0 : Math.min(lifeMonths, monthsBetween(a.purchaseDate, asOf));
  const accumulatedMinor = elapsed >= lifeMonths ? depreciable : Math.round(monthly * elapsed);
  return {
    annualMinor: Math.round(monthly * 12),
    monthlyMinor: Math.round(monthly),
    monthsElapsed: elapsed,
    accumulatedMinor,
    netBookValueMinor: a.costMinor - accumulatedMinor,
    fullyDepreciated: elapsed >= lifeMonths,
  };
}

/** Year-by-year schedule (calendar years). */
export function schedule(a: DepreciationInput) {
  const rows: { year: number; depreciationMinor: number; accumulatedMinor: number; netBookValueMinor: number }[] = [];
  const startYear = a.purchaseDate.getUTCFullYear();
  let prev = 0;
  for (let y = startYear; ; y++) {
    const r = straightLine(a, new Date(Date.UTC(y, 11, 31)));
    rows.push({ year: y, depreciationMinor: r.accumulatedMinor - prev, accumulatedMinor: r.accumulatedMinor, netBookValueMinor: r.netBookValueMinor });
    prev = r.accumulatedMinor;
    if (r.fullyDepreciated || y - startYear > 100) break;
  }
  return rows;
}
