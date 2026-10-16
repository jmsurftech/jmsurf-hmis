import { storageDaysDue, totalStorageDays } from './mortuary.rules';

describe('mortuary storage charge days', () => {
  const adm = new Date('2026-10-10T20:00:00+03:00');
  it('charges the admission day on first run', () => {
    expect(storageDaysDue(adm, null, new Date('2026-10-10T22:00:00+03:00'))).toBe(1);
  });
  it('catches up missed days', () => {
    expect(storageDaysDue(adm, null, new Date('2026-10-13T08:00:00+03:00'))).toBe(4);
  });
  it('is idempotent within a day', () => {
    const last = new Date('2026-10-12T01:00:00+03:00');
    expect(storageDaysDue(adm, last, new Date('2026-10-12T23:59:00+03:00'))).toBe(0);
    expect(storageDaysDue(adm, last, new Date('2026-10-13T00:01:00+03:00'))).toBe(1);
  });
  it('uses EAT day boundaries (21:30 UTC is next day in Nairobi)', () => {
    expect(storageDaysDue(new Date('2026-10-10T12:00:00Z'), null, new Date('2026-10-10T21:30:00Z'))).toBe(2);
  });
  it('total days inclusive, min 1', () => {
    expect(totalStorageDays(adm, new Date('2026-10-10T23:00:00+03:00'))).toBe(1);
    expect(totalStorageDays(adm, new Date('2026-10-15T10:00:00+03:00'))).toBe(6);
  });
});
