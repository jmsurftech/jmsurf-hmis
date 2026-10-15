import { bedDaysDue, marTimes } from './bed-charges';

describe('daily bed charges', () => {
  const adm = new Date('2026-10-10T08:00:00Z'); // 11:00 EAT
  it('charges admission day on first run', () => {
    expect(bedDaysDue(adm, null, new Date('2026-10-10T10:00:00Z'))).toBe(1);
  });
  it('does not double-charge on the same day', () => {
    expect(bedDaysDue(adm, new Date('2026-10-10T10:00:00Z'), new Date('2026-10-10T20:00:00Z'))).toBe(0);
  });
  it('charges next day after EAT midnight', () => {
    // 2026-10-10T21:30Z = 00:30 EAT on the 11th
    expect(bedDaysDue(adm, new Date('2026-10-10T10:00:00Z'), new Date('2026-10-10T21:30:00Z'))).toBe(1);
  });
  it('catches up missed days', () => {
    expect(bedDaysDue(adm, new Date('2026-10-10T10:00:00Z'), new Date('2026-10-13T10:00:00Z'))).toBe(3);
    expect(bedDaysDue(adm, null, new Date('2026-10-12T10:00:00Z'))).toBe(3);
  });
});

describe('eMAR schedule', () => {
  it('TDS for 2 days = 6 doses 8h apart', () => {
    const t = marTimes(new Date('2026-10-10T06:00:00Z'), 3, 2);
    expect(t).toHaveLength(6);
    expect(t[1].toISOString()).toBe('2026-10-10T14:00:00.000Z');
  });
  it('PRN yields no schedule', () => expect(marTimes(new Date(), 0, 3)).toEqual([]));
});
