import { calcInvoice, moduleForPath, nextStatus, previousPeriod, readOnlyAllows } from './subscription.rules';

const DAY = 86400000;
describe('subscription invoice calc', () => {
  it('prices Clinic and Hospital plans + KES 49 per visit', () => {
    expect(calcInvoice('CLINIC', 0).amountMinor).toBe(499900);
    expect(calcInvoice('CLINIC', 100).amountMinor).toBe(499900 + 490000);
    expect(calcInvoice('HOSPITAL', 10)).toEqual({ baseMinor: 1499900, visits: 10, perVisitMinor: 4900, amountMinor: 1499900 + 49000 });
  });
  it('uses custom Enterprise pricing', () => {
    expect(calcInvoice('ENTERPRISE', 2, { customMonthlyMinor: 5000000, perVisitMinor: 2000 }).amountMinor).toBe(5004000);
    expect(calcInvoice('ENTERPRISE', 0).amountMinor).toBe(0);
  });
  it('computes previous period', () => {
    expect(previousPeriod(new Date('2026-01-01T00:05:00Z')).period).toBe('2025-12');
  });
});

describe('dunning', () => {
  const now = new Date('2026-03-20T00:00:00Z');
  it('TRIAL → GRACE → READ_ONLY', () => {
    expect(nextStatus({ status: 'TRIAL', trialEndsAt: new Date(now.getTime() + DAY), now })).toBe('TRIAL');
    expect(nextStatus({ status: 'TRIAL', trialEndsAt: new Date(now.getTime() - DAY), now })).toBe('GRACE');
    expect(nextStatus({ status: 'TRIAL', trialEndsAt: new Date(now.getTime() - 10 * DAY), now })).toBe('READ_ONLY');
  });
  it('ACTIVE overdue → GRACE → READ_ONLY, paid → ACTIVE', () => {
    expect(nextStatus({ status: 'ACTIVE', oldestUnpaidDue: new Date(now.getTime() - 2 * DAY), now })).toBe('GRACE');
    expect(nextStatus({ status: 'GRACE', oldestUnpaidDue: new Date(now.getTime() - 20 * DAY), now })).toBe('READ_ONLY');
    expect(nextStatus({ status: 'READ_ONLY', oldestUnpaidDue: null, hasPaid: true, now })).toBe('ACTIVE');
  });
});

describe('route guards', () => {
  it('maps routes to modules', () => {
    expect(moduleForPath('/api/inpatient/admissions')).toBe('ipd');
    expect(moduleForPath('/api/patients')).toBeNull();
  });
  it('read-only allows GET, auth and subscription payment only', () => {
    expect(readOnlyAllows('GET', '/api/patients')).toBe(true);
    expect(readOnlyAllows('POST', '/api/patients')).toBe(false);
    expect(readOnlyAllows('POST', '/api/subscription/invoices/x/pay')).toBe(true);
  });
});
