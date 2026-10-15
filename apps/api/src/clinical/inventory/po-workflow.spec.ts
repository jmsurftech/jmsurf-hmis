import { applyReceipt, assertTransition, poTotal } from './po-workflow';

describe('purchase order workflow', () => {
  const lines = [{ itemId: 'a', quantity: 10, unitCostMinor: 100 }, { itemId: 'b', quantity: 5, unitCostMinor: 200 }];
  it('totals lines', () => expect(poTotal(lines)).toBe(2000));
  it('allows valid transitions only', () => {
    expect(() => assertTransition('DRAFT', 'PENDING_APPROVAL')).not.toThrow();
    expect(() => assertTransition('PENDING_APPROVAL', 'APPROVED')).not.toThrow();
    expect(() => assertTransition('DRAFT', 'APPROVED')).toThrow();
    expect(() => assertTransition('RECEIVED', 'CANCELLED')).toThrow();
  });
  it('handles partial then full receipt', () => {
    const r1 = applyReceipt('APPROVED', lines, [{ itemId: 'a', quantity: 4 }]);
    expect(r1.status).toBe('PARTIAL');
    const r2 = applyReceipt(r1.status, r1.lines, [{ itemId: 'a', quantity: 6 }, { itemId: 'b', quantity: 5 }]);
    expect(r2.status).toBe('RECEIVED');
  });
  it('rejects over-receipt and unapproved', () => {
    expect(() => applyReceipt('APPROVED', lines, [{ itemId: 'a', quantity: 11 }])).toThrow(/Over-receipt/);
    expect(() => applyReceipt('DRAFT', lines, [{ itemId: 'a', quantity: 1 }])).toThrow();
    expect(() => applyReceipt('APPROVED', lines, [{ itemId: 'z', quantity: 1 }])).toThrow();
  });
});
