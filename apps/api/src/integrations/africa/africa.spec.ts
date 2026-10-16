import { buildNhifFolio } from './nhif-tz';
import { buildNhiaClaim } from './nhia-gh';
import { buildAirtelPayment, buildMomoRequestToPay, toMsisdn } from './mobile-money';
import { MobileMoneyRouter, NationalInsuranceRouter } from './routers';
import { NhifTzAdapter } from './nhif-tz';
import { NhiaGhAdapter } from './nhia-gh';

const bundle = {
  resourceType: 'Bundle', timestamp: '2026-10-15T10:00:00Z', identifier: { value: 'CLM-0007' },
  entry: [
    { resource: { resourceType: 'Claim', identifier: [{ value: 'CLM-0007' }], created: '2026-10-15T10:00:00Z', insurance: [{ preAuthRef: ['AUTH-55'] }],
      diagnosis: [{ diagnosisCodeableConcept: { coding: [{ code: 'B54', display: 'Malaria' }] } }],
      item: [
        { productOrService: { coding: [{ code: 'OPDC06A' }], text: 'OPD consultation' }, quantity: { value: 1 }, unitPrice: { value: 30 }, net: { value: 30 }, servicedDate: '2026-10-14' },
        { productOrService: { coding: [{ code: 'ARTEMT1' }], text: 'Artemether-lumefantrine' }, quantity: { value: 24 }, unitPrice: { value: 0.5 }, net: { value: 12 }, servicedDate: '2026-10-14' },
      ], total: { value: 42 } } },
    { resource: { resourceType: 'Patient', name: [{ family: 'Mensah', given: ['Ama', 'Akos'] }], gender: 'female', birthDate: '1992-04-01',
      identifier: [{ system: 'urn:jmsurf-hmis:mrn', value: 'MRN9' }, { system: 'https://nhis.gov.gh/member', value: 'NHIS12345' }, { system: 'https://nhif.or.tz/member', value: 'NHIF777' }] } },
    { resource: { resourceType: 'Encounter', class: { code: 'AMB' }, period: { start: '2026-10-14T08:00:00Z' } } },
    { resource: { resourceType: 'Practitioner', identifier: [{ system: 'https://x/licence-number', value: 'MDC-001' }] } },
  ],
};

describe('NHIF Tanzania folio builder', () => {
  it('maps bundle → SubmitFolios entity', () => {
    const f = buildNhifFolio(bundle, { facilityCode: '01234', createdBy: 'tester' }, 5).entities[0];
    expect(f).toMatchObject({ FacilityCode: '01234', ClaimYear: 2026, ClaimMonth: 10, SerialNo: '01234/10/2026/5', CardNo: 'NHIF777', FirstName: 'Ama Akos', LastName: 'Mensah',
      Gender: 'Female', PatientFileNo: 'MRN9', AuthorizationNo: 'AUTH-55', AttendanceDate: '2026-10-14', PatientTypeCode: 'OUT', PractitionerNo: 'MDC-001', ClaimNumber: 'CLM-0007' });
    expect(f.FolioDiseases).toEqual([{ DiseaseCode: 'B54', Remarks: 'Malaria', CreatedBy: 'tester' }]);
    expect(f.FolioItems[1]).toMatchObject({ ItemCode: 'ARTEMT1', ItemQuantity: 24, UnitPrice: 0.5, AmountClaimed: 12 });
  });
});

describe('NHIA Ghana claim builder', () => {
  it('splits procedures and medicines, carries member and diagnosis', () => {
    const c = buildNhiaClaim(bundle, { facilityId: 'GH-FAC-1', cccPrefix: '' }).claim;
    expect(c).toMatchObject({ claimID: 'CLM-0007', facilityID: 'GH-FAC-1', memberNo: 'NHIS12345', surname: 'Mensah', gender: 'F', typeOfService: 'OPD', claimCheckCode: 'AUTH-55', totalClaimed: 42 });
    expect(c.procedure).toEqual([{ gdrgCode: 'OPDC06A', date: '2026-10-14', quantity: 1, amount: 30 }]);
    expect(c.medicine).toEqual([{ medicineCode: 'ARTEMT1', dispensedQty: 24, serviceDate: '2026-10-14', amount: 12 }]);
    expect(c.diagnosis[0]).toMatchObject({ icd10: 'B54', diagnosis: 'Malaria' });
  });
});

describe('Mobile money builders', () => {
  it('normalises MSISDNs by country', () => {
    expect(toMsisdn('0772 123 456', 'UG')).toBe('256772123456');
    expect(toMsisdn('+255 754 000 111', 'TZ')).toBe('255754000111');
  });
  it('MTN MoMo requesttopay body', () => {
    expect(buildMomoRequestToPay({ phone: '0772123456', amountMinor: 500050, accountRef: 'BILL-1', description: 'Hospital bill' }, 'UG')).toEqual({
      amount: '5001', currency: 'UGX', externalId: 'BILL-1', payer: { partyIdType: 'MSISDN', partyId: '256772123456' }, payerMessage: 'Hospital bill', payeeNote: 'BILL-1' });
  });
  it('Airtel payment body uses local msisdn', () => {
    expect(buildAirtelPayment({ phone: '+255784111222', amountMinor: 100000, accountRef: 'B2', description: 'Bill B2' }, 'TZ', 'tx1')).toEqual({
      reference: 'Bill B2', subscriber: { country: 'TZ', currency: 'TZS', msisdn: '784111222' }, transaction: { amount: 1000, country: 'TZ', currency: 'TZS', id: 'tx1' } });
  });
});

describe('Country routers', () => {
  it('selects national insurer by country', () => {
    const sha = {} as any;
    const r = new NationalInsuranceRouter(sha, {} as any, { current: async () => undefined } as any);
    expect(r.forCountry('KE')).toBe(sha);
    expect(r.forCountry('TZ')).toBeInstanceOf(NhifTzAdapter);
    expect(r.forCountry('GH')).toBeInstanceOf(NhiaGhAdapter);
    expect(r.forCountry('ZA')).toBe(sha);
  });
  it('selects mobile money provider by country with env override', () => {
    expect(MobileMoneyRouter.providerFor('KE')).toBe('mpesa');
    expect(MobileMoneyRouter.providerFor('UG')).toBe('mtn');
    expect(MobileMoneyRouter.providerFor('TZ')).toBe('airtel');
    process.env.MOBILE_MONEY_PROVIDER_UG = 'airtel';
    expect(MobileMoneyRouter.providerFor('UG')).toBe('airtel');
    delete process.env.MOBILE_MONEY_PROVIDER_UG;
  });
});
