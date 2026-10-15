import { findClashes } from './clash';

const d = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 20, h, m));
const existing = [
  { id: '1', theatre: 'T1', surgeonId: 'S1', anaesthetistId: 'A1', scheduledStart: d(8), scheduledEnd: d(10) },
  { id: '2', theatre: 'T2', surgeonId: 'S2', scheduledStart: d(9), scheduledEnd: d(11), status: 'CANCELLED' },
];

describe('theatre clash detection', () => {
  it('detects theatre overlap', () => {
    expect(findClashes({ theatre: 'T1', scheduledStart: d(9), scheduledEnd: d(11) }, existing)).toEqual([{ bookingId: '1', reason: 'THEATRE' }]);
  });
  it('detects surgeon double-booking in another theatre', () => {
    expect(findClashes({ theatre: 'T3', surgeonId: 'S1', scheduledStart: d(9, 30), scheduledEnd: d(12) }, existing)[0].reason).toBe('SURGEON');
  });
  it('detects anaesthetist clash', () => {
    expect(findClashes({ theatre: 'T3', anaesthetistId: 'A1', scheduledStart: d(7), scheduledEnd: d(8, 30) }, existing)[0].reason).toBe('ANAESTHETIST');
  });
  it('back-to-back is fine without buffer, clashes with buffer', () => {
    expect(findClashes({ theatre: 'T1', scheduledStart: d(10), scheduledEnd: d(11) }, existing)).toEqual([]);
    expect(findClashes({ theatre: 'T1', scheduledStart: d(10), scheduledEnd: d(11) }, existing, 15)).toHaveLength(1);
  });
  it('ignores cancelled and self', () => {
    expect(findClashes({ theatre: 'T2', surgeonId: 'S2', scheduledStart: d(9), scheduledEnd: d(10) }, existing)).toEqual([]);
    expect(findClashes({ id: '1', theatre: 'T1', scheduledStart: d(8), scheduledEnd: d(10) }, existing)).toEqual([]);
  });
  it('rejects invalid window', () => {
    expect(() => findClashes({ theatre: 'T1', scheduledStart: d(10), scheduledEnd: d(9) }, existing)).toThrow();
  });
});
