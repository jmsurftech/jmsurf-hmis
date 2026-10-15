import { adequacy, ktvDaugirdas, recurringDates, urr } from './dialysis-calc';
import { eddFromLmp, gestationWeeks, immunizationSchedule } from '../maternity/kepi';

describe('dialysis adequacy', () => {
  it('computes URR', () => expect(urr(100, 30)).toBe(70));
  it('computes Kt/V (Daugirdas)', () => {
    // pre 100, post 30, 4h, 3L UF, 70kg
    const k = ktvDaugirdas(100, 30, 4, 3, 70);
    expect(k).toBeGreaterThan(1.3);
    expect(k).toBeLessThan(1.5);
  });
  it('adequacy thresholds', () => expect(adequacy(1.1, 70)).toEqual({ ktvAdequate: false, urrAdequate: true }));
  it('recurring Mon/Wed/Fri for 2 weeks', () => {
    const ds = recurringDates(new Date(2026, 9, 19), [1, 3, 5], 2, '07:30');
    expect(ds).toHaveLength(6);
    expect(ds[0].getHours()).toBe(7);
  });
});

describe('maternity', () => {
  it('EDD by Naegele', () => expect(eddFromLmp(new Date('2026-01-01T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-08'));
  it('gestation weeks', () => expect(gestationWeeks(new Date('2026-01-01'), new Date('2026-03-01'))).toBe(8));
  it('KEPI schedule from DOB', () => {
    const s = immunizationSchedule(new Date('2026-01-01T00:00:00Z'));
    expect(s.find((x) => x.vaccine === 'BCG')!.dueDate.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(s.find((x) => x.vaccine === 'Measles-Rubella' && x.dose === 1)!.dueDate.toISOString().slice(0, 10)).toBe('2026-10-02');
  });
});
