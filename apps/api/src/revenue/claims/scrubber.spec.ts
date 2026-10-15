import { hasBlockingIssues, parseFrequency, rejectionRisk, scrubClaim, ScrubContext } from './scrubber';

const base = (): ScrubContext => ({
  payerType: 'SHA', serviceDate: new Date('2026-10-10T10:00:00Z'),
  diagnoses: [{ code: 'CA40.0', codeSystem: 'ICD-11' }],
  patient: { crId: 'CR1' }, facilityLevel: 4,
  lines: [{ ref: 'l1', code: 'SHA-OPD-001', description: 'OPD', quantity: 1, amountMinor: 100000 }],
  packages: { 'SHA-OPD-001': { code: 'SHA-OPD-001', tariffMinor: 100000, minFacilityLevel: 2, requiresPreauth: false, frequencyLimit: '2/week' } },
  approvedPreauthCodes: [], priorUsage: {}, duplicateClaimNumbers: [],
  practitioner: { licenseNumber: 'A1', licenseExpiry: new Date('2027-01-01') },
});
const codes = (c: ScrubContext) => scrubClaim(c).map((i) => i.code);

describe('claim scrubber', () => {
  it('passes a clean claim', () => {
    expect(scrubClaim(base())).toEqual([]);
    expect(rejectionRisk([])).toBe(0);
  });
  it('flags missing diagnosis', () => { const c = base(); c.diagnoses = []; expect(codes(c)).toContain('MISSING_DIAGNOSIS'); });
  it('flags missing CR ID for SHA only', () => {
    const c = base(); c.patient = {};
    expect(codes(c)).toContain('MISSING_CR_ID');
    c.payerType = 'INSURER';
    expect(codes(c)).not.toContain('MISSING_CR_ID');
  });
  it('flags package not allowed for facility level', () => {
    const c = base(); c.packages['SHA-OPD-001'].minFacilityLevel = 5;
    expect(codes(c)).toContain('PACKAGE_NOT_ALLOWED_FOR_LEVEL');
  });
  it('flags missing pre-auth, accepts approved one', () => {
    const c = base(); c.packages['SHA-OPD-001'].requiresPreauth = true;
    expect(codes(c)).toContain('PREAUTH_REQUIRED');
    c.approvedPreauthCodes = ['SHA-OPD-001'];
    expect(codes(c)).not.toContain('PREAUTH_REQUIRED');
  });
  it('flags frequency limit using prior usage within the window', () => {
    const c = base();
    c.priorUsage = { 'SHA-OPD-001': [new Date('2026-10-08'), new Date('2026-10-09')] };
    expect(codes(c)).toContain('FREQUENCY_LIMIT_EXCEEDED');
    c.priorUsage = { 'SHA-OPD-001': [new Date('2026-09-01'), new Date('2026-10-09')] };
    expect(codes(c)).not.toContain('FREQUENCY_LIMIT_EXCEEDED');
  });
  it('flags amount above tariff (per unit)', () => {
    const c = base(); c.lines[0].amountMinor = 150000;
    expect(codes(c)).toContain('AMOUNT_ABOVE_TARIFF');
    c.lines[0].quantity = 2; c.packages['SHA-OPD-001'].frequencyLimit = null;
    expect(codes(c)).not.toContain('AMOUNT_ABOVE_TARIFF');
  });
  it('flags duplicate claims', () => { const c = base(); c.duplicateClaimNumbers = ['CLM-1']; expect(codes(c)).toContain('DUPLICATE_CLAIM'); });
  it('flags practitioner licence missing / expired', () => {
    const c = base(); c.practitioner = { licenseNumber: null };
    expect(codes(c)).toContain('PRACTITIONER_NO_LICENCE');
    c.practitioner = { licenseNumber: 'A', licenseExpiry: new Date('2026-01-01') };
    expect(codes(c)).toContain('PRACTITIONER_LICENCE_EXPIRED');
  });
  it('warns on unmapped intervention', () => {
    const c = base(); c.lines[0].code = 'LOCAL-1';
    const issues = scrubClaim(c);
    expect(issues[0]).toMatchObject({ code: 'UNMAPPED_INTERVENTION', severity: 'WARNING' });
    expect(hasBlockingIssues(issues)).toBe(false);
  });
  it('risk grows with issues and stays in [0,1]', () => {
    const c = base(); c.diagnoses = []; c.patient = {}; c.duplicateClaimNumbers = ['x'];
    const issues = scrubClaim(c);
    const r = rejectionRisk(issues, { historicalRejectionRate: 0.3 });
    expect(r).toBeGreaterThan(0.9); expect(r).toBeLessThanOrEqual(1);
    expect(rejectionRisk([{ code: 'UNMAPPED_INTERVENTION', severity: 'WARNING', message: '' }])).toBe(0.25);
  });
  it('parses frequency strings', () => {
    expect(parseFrequency('3/week')).toEqual({ max: 3, days: 7 });
    expect(parseFrequency('1/year')).toEqual({ max: 1, days: 365 });
    expect(parseFrequency('bogus')).toBeNull();
  });
});
