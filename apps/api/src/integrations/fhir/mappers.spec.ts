import { buildClaimBundle, toFhirClaim, toFhirOrganization, toFhirPatient, toFhirPractitioner, toFhirEncounter } from './mappers';
import { FhirSystems } from './systems';

const patient = { id: 'p1', mrn: 'MRN1', crId: 'CR123', shaNumber: 'SHA9', idType: 'NATIONAL_ID', idNumber: '12345678', firstName: 'Wanjiku', middleName: 'A', lastName: 'Kamau', sex: 'FEMALE', dateOfBirth: '1990-05-01T00:00:00Z', phone: '+254700000000' };

describe('FHIR mappers', () => {
  it('maps Patient identifiers, name and gender', () => {
    const r = toFhirPatient(patient);
    expect(r.resourceType).toBe('Patient');
    expect(r.gender).toBe('female');
    expect(r.birthDate).toBe('1990-05-01');
    expect(r.name[0]).toEqual({ use: 'official', family: 'Kamau', given: ['Wanjiku', 'A'] });
    expect(r.identifier.find((i: any) => i.system === FhirSystems.crId).value).toBe('CR123');
    expect(r.identifier).toHaveLength(4);
  });

  it('maps Organization with KMHFR code', () => {
    const r = toFhirOrganization({ id: 'f1', name: 'Mercy Hospital', kmhflCode: '12345', level: 5 });
    expect(r.identifier[0]).toEqual({ use: 'official', system: FhirSystems.kmhfr, value: '12345' });
    expect(r.extension![0].valueInteger).toBe(5);
  });

  it('maps Practitioner with HWR and licence', () => {
    const r = toFhirPractitioner({ id: 'pr1', name: 'Dr Otieno Ouma', licenseNumber: 'A1234', hwrId: 'HWR-1', regulator: 'KMPDC' });
    expect(r.identifier.map((i: any) => i.value)).toEqual(['HWR-1', 'A1234']);
    expect(r.name[0].family).toBe('Ouma');
  });

  it('maps Encounter class', () => {
    expect(toFhirEncounter({ id: 'e', type: 'IPD', startedAt: new Date() }, 'Patient/p').class.code).toBe('IMP');
  });

  it('maps Claim with ICD-11 diagnoses and SHA intervention codes, money in major units', () => {
    const c = toFhirClaim({
      id: 'c1', claimNumber: 'CLM-1', createdAt: '2026-10-01T10:00:00Z', currency: 'KES', totalMinor: 250000, fund: 'SHIF', preAuthRefs: ['PA-1'],
      diagnoses: [{ code: 'CA40.0', display: 'Pneumonia', type: 'PRIMARY' }, { code: '5A11', display: 'T2DM', type: 'SECONDARY' }],
      items: [{ code: 'SHA-OPD-001', description: 'OPD consult', quantity: 1, unitPriceMinor: 250000, totalMinor: 250000 }],
    }, { patient: 'Patient/p1', provider: 'Organization/f1', encounter: 'Encounter/e1' });
    expect(c.diagnosis[0].diagnosisCodeableConcept.coding[0]).toEqual({ system: 'http://id.who.int/icd/release/11/mms', code: 'CA40.0', display: 'Pneumonia' });
    expect(c.diagnosis[0].type[0].coding[0].code).toBe('principal');
    expect(c.item[0].productOrService.coding[0]).toMatchObject({ system: FhirSystems.shaIntervention, code: 'SHA-OPD-001' });
    expect(c.total).toEqual({ value: 2500, currency: 'KES' });
    expect(c.insurance[0].preAuthRef).toEqual(['PA-1']);
  });

  it('builds a Bundle with all referenced resources', () => {
    const b = buildClaimBundle({
      patient, encounter: { id: 'e1', type: 'OPD', startedAt: new Date() }, organization: { id: 'f1', name: 'X', kmhflCode: '1' },
      practitioner: { id: 'pr1', name: 'Dr A B' },
      claim: { id: 'c1', claimNumber: 'CLM-1', createdAt: new Date(), currency: 'KES', totalMinor: 100, diagnoses: [], items: [] },
    });
    expect(b.resourceType).toBe('Bundle');
    expect(b.entry.map((e) => e.resource.resourceType)).toEqual(['Claim', 'Patient', 'Encounter', 'Organization', 'Practitioner']);
    const claim: any = b.entry[0].resource;
    expect(claim.careTeam[0].provider.reference).toBe('Practitioner/pr1');
  });
});
