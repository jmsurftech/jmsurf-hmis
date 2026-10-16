import { applyRegisterRules, crossmatch } from './register-rules';

const now = new Date('2026-10-16T09:00:00Z');

describe('register rules', () => {
  it('blocks release of unscreened blood and fills expiry', () => {
    const r = applyRegisterRules('blood-units', 'AVAILABLE', { component: 'Packed red cells', collectedOn: '2026-10-01', screening: 'Pending' }, now);
    expect(r.errors[0]).toMatch(/TTI/);
    expect(r.data.expiresOn).toBe('2026-11-12');
  });
  it('discards reactive units', () => {
    expect(applyRegisterRules('blood-units', 'QUARANTINE', { screening: 'Reactive' }, now).status).toBe('DISCARDED');
  });
  it('crossmatch applies ABO/Rh rules', () => {
    const units = [
      { number: 'U1', status: 'AVAILABLE', data: { bloodGroup: 'O-', component: 'Packed red cells', expiresOn: '2026-11-01' } },
      { number: 'U2', status: 'AVAILABLE', data: { bloodGroup: 'A+', component: 'Packed red cells', expiresOn: '2026-11-01' } },
    ];
    const x = crossmatch('O-', 'Packed red cells', units, now);
    expect(x.results.map((r) => r.compatible)).toEqual([true, false]);
    expect(x.errors[0]).toMatch(/^U2/);
    expect(crossmatch('Pending', undefined, units, now).errors[0]).toMatch(/blood group/);
  });
  it('flags viral suppression and tracing', () => {
    const r = applyRegisterRules('hiv', 'ACTIVE', { lastVl: 1200, nextRefill: '2026-10-01' }, now);
    expect(r.data.vlSuppressed).toBe('No');
    expect(r.data.tracing).toBe('DEFAULTER');
    expect(applyRegisterRules('hiv', 'ACTIVE', { lastVl: 20 }, now).data.vlCategory).toBe('LDL');
  });
  it('computes BSA for oncology and holds on bad labs', () => {
    expect(applyRegisterRules('oncology', 'PLANNED', { heightCm: 170, weightKg: 70 }, now).data.bsa).toBe(1.82);
    expect(applyRegisterRules('oncology', 'IN_PROGRESS', { labsOk: 'No' }, now).errors).toHaveLength(1);
  });
  it('CSSD failed indicator forces FAILED and blocks issue without pass', () => {
    expect(applyRegisterRules('cssd', 'STERILE', { indicator: 'Fail' }, now).status).toBe('FAILED');
    expect(applyRegisterRules('cssd', 'ISSUED', { indicator: 'Pending' }, now).errors).toHaveLength(1);
  });
  it('ambulance mileage, chronic control, FP return date, mortuary days', () => {
    expect(applyRegisterRules('ambulance', 'COMPLETED', { kmOut: 1000, kmIn: 1042 }, now).data.mileageKm).toBe(42);
    expect(applyRegisterRules('ambulance', 'COMPLETED', { kmOut: 1000, kmIn: 900 }, now).errors).toHaveLength(1);
    expect(applyRegisterRules('chronic', 'ACTIVE', { condition: 'Hypertension', lastBp: '150/95' }, now).data.controlled).toBe('No');
    expect(applyRegisterRules('family-planning', 'ACTIVE', { method: 'Injectable (DMPA)', givenOn: '2026-10-01' }, now).data.returnOn).toBe('2026-12-24');
    expect(applyRegisterRules('mortuary', 'ADMITTED', {}, now, new Date('2026-10-14T10:00:00Z')).data.storageDays).toBe(3);
    expect(applyRegisterRules('mortuary', 'RELEASED', {}, now).errors[0]).toMatch(/burial permit/);
  });
});
