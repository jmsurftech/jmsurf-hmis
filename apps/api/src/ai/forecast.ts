/**
 * Stock demand forecast (pure statistics, no LLM). Weekly consumption from StockMovement (ISSUE/DISPENSE/EXPIRY out),
 * forecast = moving average × seasonal index (week-of-year index when ≥ 1 year of history, else 1),
 * with reorder point = lead-time demand + safety stock (z·σ·√LT).
 */
export interface Movement { type: string; quantity: number; createdAt: Date }

export const CONSUMPTION_TYPES = ['ISSUE', 'DISPENSE', 'EXPIRY'];
const WEEK_MS = 7 * 86400000;

/** Bucket consumption into `weeks` weekly totals ending at `asOf` (oldest first). */
export function weeklySeries(moves: Movement[], weeks: number, asOf = new Date()): number[] {
  const out = new Array(weeks).fill(0);
  const end = asOf.getTime();
  for (const m of moves) {
    if (!CONSUMPTION_TYPES.includes(m.type)) continue;
    const age = Math.floor((end - new Date(m.createdAt).getTime()) / WEEK_MS);
    if (age < 0 || age >= weeks) continue;
    out[weeks - 1 - age] += Math.abs(m.quantity);
  }
  return out;
}

export const movingAverage = (xs: number[], window: number) => {
  const tail = xs.slice(-window);
  return tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : 0;
};

export const stdDev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Seasonal indices for a period (e.g. 52 weeks) from ≥ 1 full period; index = mean of that slot / overall mean. */
export function seasonalIndices(series: number[], period: number): number[] | null {
  if (series.length < period) return null;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  if (mean === 0) return null;
  const idx = new Array(period).fill(0).map((_, slot) => {
    const vals = series.filter((_, i) => (i % period) === slot);
    return vals.reduce((a, b) => a + b, 0) / vals.length / mean;
  });
  return idx;
}

export interface ForecastInput {
  series: number[]; // weekly consumption, oldest first
  onHand: number;
  reorderLevel?: number;
  leadTimeWeeks?: number;
  horizonWeeks?: number;
  window?: number;
  serviceZ?: number; // 1.65 ≈ 95% service level
  seasonPeriod?: number;
}

export interface ForecastResult {
  avgWeekly: number; forecast: number[]; forecastTotal: number; safetyStock: number; reorderPoint: number;
  weeksOfCover: number | null; suggestedOrderQty: number; shouldReorder: boolean; seasonal: boolean;
}

export function forecastDemand(i: ForecastInput): ForecastResult {
  const window = i.window ?? 8, horizon = i.horizonWeeks ?? 4, lt = i.leadTimeWeeks ?? 2, z = i.serviceZ ?? 1.65, period = i.seasonPeriod ?? 52;
  const base = movingAverage(i.series, window);
  const idx = seasonalIndices(i.series, period);
  const forecast = Array.from({ length: horizon }, (_, h) => {
    const slot = (i.series.length + h) % period;
    return Math.max(0, Math.round((idx ? base * idx[slot] : base) * 10) / 10);
  });
  const sigma = stdDev(i.series.slice(-Math.max(window, 4)));
  const safetyStock = Math.ceil(z * sigma * Math.sqrt(lt));
  const reorderPoint = Math.max(Math.ceil(base * lt + safetyStock), i.reorderLevel ?? 0);
  const forecastTotal = Math.round(forecast.reduce((a, b) => a + b, 0));
  const target = reorderPoint + forecastTotal;
  const shouldReorder = i.onHand <= reorderPoint;
  return {
    avgWeekly: Math.round(base * 10) / 10, forecast, forecastTotal, safetyStock, reorderPoint,
    weeksOfCover: base > 0 ? Math.round((i.onHand / base) * 10) / 10 : null,
    suggestedOrderQty: shouldReorder ? Math.max(0, Math.ceil(target - i.onHand)) : 0, shouldReorder, seasonal: !!idx,
  };
}
