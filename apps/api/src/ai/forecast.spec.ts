import { forecastDemand, movingAverage, seasonalIndices, stdDev, weeklySeries } from './forecast';

describe('forecast', () => {
  const asOf = new Date('2026-10-15T00:00:00Z');
  const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86400000);

  it('buckets only consumption movements into weekly totals', () => {
    const s = weeklySeries([
      { type: 'DISPENSE', quantity: -5, createdAt: daysAgo(1) },
      { type: 'ISSUE', quantity: 3, createdAt: daysAgo(2) },
      { type: 'RECEIPT', quantity: 100, createdAt: daysAgo(2) },
      { type: 'DISPENSE', quantity: 7, createdAt: daysAgo(8) },
      { type: 'DISPENSE', quantity: 7, createdAt: daysAgo(100) },
    ], 4, asOf);
    expect(s).toEqual([0, 0, 7, 8]);
  });

  it('moving average and std dev', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(movingAverage([], 4)).toBe(0);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('flat demand → reorder suggestion when below reorder point', () => {
    const r = forecastDemand({ series: new Array(12).fill(10), onHand: 15, leadTimeWeeks: 2, horizonWeeks: 4 });
    expect(r.avgWeekly).toBe(10);
    expect(r.forecast).toEqual([10, 10, 10, 10]);
    expect(r.safetyStock).toBe(0);
    expect(r.reorderPoint).toBe(20);
    expect(r.shouldReorder).toBe(true);
    expect(r.suggestedOrderQty).toBe(45); // 20 + 40 - 15
    expect(r.seasonal).toBe(false);
  });

  it('no reorder when well stocked', () => {
    const r = forecastDemand({ series: new Array(8).fill(5), onHand: 200 });
    expect(r.shouldReorder).toBe(false);
    expect(r.suggestedOrderQty).toBe(0);
    expect(r.weeksOfCover).toBe(40);
  });

  it('applies seasonality with a full period of history', () => {
    // period 4: high demand in slot 0
    const series = [20, 10, 10, 10, 20, 10, 10, 10];
    const idx = seasonalIndices(series, 4)!;
    expect(idx[0]).toBeCloseTo(1.6, 5);
    const r = forecastDemand({ series, onHand: 0, seasonPeriod: 4, window: 4, horizonWeeks: 4 });
    expect(r.seasonal).toBe(true);
    expect(r.forecast[0]).toBeGreaterThan(r.forecast[1]);
  });
});
