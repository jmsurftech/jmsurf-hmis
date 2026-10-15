import { FhirSystems as S } from './systems';

/** Plain input shapes (decoupled from Prisma so mappers are pure and unit-testable). */
export interface PatientIn {
  id: string; mrn?: string; crId?: string | null; shaNumber?: string | null; idType?: string | null; idNumber?: string | null;
  firstName: string; middleName?: string | null; lastName: string; sex: string; dateOfBirth?: Date | string | null; phone?: string | null;
}
export interface EncounterIn { id: string; type: string; startedAt: Date | string; endedAt?: Date | string | null; status?: string }
export interface PractitionerIn { id: string; name: string; cadre?: string; regulator?: string | null; licenseNumber?: string | null; hwrId?: string | null }
export interface OrganizationIn { id: string; name: string; kmhflCode?: string | null; shaFacilityId?: string | null; level?: number }
export interface DiagnosisIn { code: string; display: string; codeSystem?: string; type?: string }
export interface ClaimItemIn { code: string; description: string; quantity: number; unitPriceMinor: number; totalMinor: number; serviceDate?: Date | string }
export interface ClaimIn {
  id: string; claimNumber: string; createdAt: Date | string; currency: string; totalMinor: number;
  use?: 'claim' | 'preauthorization'; preAuthRefs?: string[]; fund?: string | null; insurerName?: string;
  diagnoses: DiagnosisIn[]; items: ClaimItemIn[];
}

const iso = (d?: Date | string | null) => (d ? new Date(d).toISOString() : undefined);
const date = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
export const money = (minor: number, currency: string) => ({ value: Math.round(minor) / 100, currency });
const clean = <T>(o: T): T => JSON.parse(JSON.stringify(o));

export function toFhirPatient(p: PatientIn) {
  const identifier: any[] = [];
  if (p.crId) identifier.push({ use: 'official', system: S.crId, value: p.crId });
  if (p.idNumber) identifier.push({ system: S.nationalId, value: p.idNumber, type: { text: p.idType ?? 'NATIONAL_ID' } });
  if (p.shaNumber) identifier.push({ system: S.shaNumber, value: p.shaNumber });
  if (p.mrn) identifier.push({ use: 'usual', system: S.mrn, value: p.mrn });
  const gender = ({ MALE: 'male', FEMALE: 'female', INTERSEX: 'other' } as Record<string, string>)[p.sex] ?? 'unknown';
  return clean({
    resourceType: 'Patient', id: p.id, identifier,
    name: [{ use: 'official', family: p.lastName, given: [p.firstName, p.middleName].filter(Boolean) }],
    gender, birthDate: date(p.dateOfBirth),
    telecom: p.phone ? [{ system: 'phone', value: p.phone }] : undefined,
  });
}

const ENCOUNTER_CLASS: Record<string, { code: string; display: string }> = {
  OPD: { code: 'AMB', display: 'ambulatory' }, IPD: { code: 'IMP', display: 'inpatient encounter' },
  EMERGENCY: { code: 'EMER', display: 'emergency' }, DAYCASE: { code: 'SS', display: 'short stay' },
};
export function toFhirEncounter(e: EncounterIn, patientRef: string, orgRef?: string, practitionerRef?: string) {
  const cls = ENCOUNTER_CLASS[e.type] ?? ENCOUNTER_CLASS.OPD;
  return clean({
    resourceType: 'Encounter', id: e.id, status: e.endedAt ? 'finished' : 'in-progress',
    class: { system: S.actCode, ...cls }, subject: { reference: patientRef },
    period: { start: iso(e.startedAt), end: iso(e.endedAt) },
    serviceProvider: orgRef ? { reference: orgRef } : undefined,
    participant: practitionerRef ? [{ individual: { reference: practitionerRef } }] : undefined,
  });
}

export function toFhirPractitioner(p: PractitionerIn) {
  const identifier: any[] = [];
  if (p.hwrId) identifier.push({ system: S.hwr, value: p.hwrId });
  if (p.licenseNumber) identifier.push({ system: S.licence, value: p.licenseNumber, assigner: p.regulator ? { display: p.regulator } : undefined });
  const parts = p.name.trim().split(/\s+/);
  return clean({
    resourceType: 'Practitioner', id: p.id, identifier,
    name: [{ text: p.name, family: parts.length > 1 ? parts[parts.length - 1] : parts[0], given: parts.slice(0, -1) }],
    qualification: p.cadre ? [{ code: { text: p.cadre } }] : undefined,
  });
}

export function toFhirOrganization(o: OrganizationIn) {
  const identifier: any[] = [];
  if (o.kmhflCode) identifier.push({ use: 'official', system: S.kmhfr, value: o.kmhflCode });
  if (o.shaFacilityId) identifier.push({ system: S.shaFacility, value: o.shaFacilityId });
  return clean({
    resourceType: 'Organization', id: o.id, active: true, name: o.name, identifier,
    type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'prov', display: 'Healthcare Provider' }] }],
    extension: o.level ? [{ url: 'urn:jmsurf-hmis:facility-level', valueInteger: o.level }] : undefined,
  });
}

export function toFhirClaim(c: ClaimIn, refs: { patient: string; provider: string; encounter: string; practitioner?: string; insurer?: string }) {
  const diagnosis = c.diagnoses.map((d, i) => ({
    sequence: i + 1,
    diagnosisCodeableConcept: {
      coding: [{ system: (d.codeSystem ?? 'ICD-11') === 'ICD-10' ? S.icd10 : S.icd11, code: d.code, display: d.display }],
    },
    type: [{ coding: [{ system: S.diagType, code: d.type === 'PRIMARY' ? 'principal' : d.type === 'PROVISIONAL' ? 'provisional' : 'discharge' }] }],
  }));
  const item = c.items.map((it, i) => ({
    sequence: i + 1,
    diagnosisSequence: diagnosis.length ? [1] : undefined,
    productOrService: { coding: [{ system: S.shaIntervention, code: it.code, display: it.description }], text: it.description },
    servicedDate: date(it.serviceDate ?? c.createdAt),
    quantity: { value: it.quantity },
    unitPrice: money(it.unitPriceMinor, c.currency),
    net: money(it.totalMinor, c.currency),
    encounter: [{ reference: refs.encounter }],
  }));
  return clean({
    resourceType: 'Claim', id: c.id,
    identifier: [{ system: 'urn:jmsurf-hmis:claim-number', value: c.claimNumber }],
    status: 'active', use: c.use ?? 'claim',
    type: { coding: [{ system: S.claimType, code: 'institutional' }] },
    subType: c.fund ? { text: c.fund } : undefined,
    patient: { reference: refs.patient }, created: iso(c.createdAt),
    insurer: refs.insurer ? { reference: refs.insurer } : { display: c.insurerName ?? 'Social Health Authority' },
    provider: { reference: refs.provider },
    priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
    insurance: [{ sequence: 1, focal: true, coverage: { display: c.fund ?? 'SHA' }, preAuthRef: c.preAuthRefs?.length ? c.preAuthRefs : undefined }],
    careTeam: refs.practitioner ? [{ sequence: 1, provider: { reference: refs.practitioner }, role: { coding: [{ code: 'primary' }] } }] : undefined,
    diagnosis, item, total: money(c.totalMinor, c.currency),
  });
}

/** Build the FHIR R4 Claim Bundle submitted to the HIE e-Claims endpoint (Bundle.type=collection, urn:uuid fullUrls). */
export function buildClaimBundle(input: {
  patient: PatientIn; encounter: EncounterIn; organization: OrganizationIn; practitioner?: PractitionerIn | null; claim: ClaimIn;
}) {
  const ref = (type: string, id: string) => `${type}/${id}`;
  const patient = toFhirPatient(input.patient);
  const org = toFhirOrganization(input.organization);
  const prac = input.practitioner ? toFhirPractitioner(input.practitioner) : undefined;
  const enc = toFhirEncounter(input.encounter, ref('Patient', patient.id), ref('Organization', org.id), prac && ref('Practitioner', prac.id));
  const claim = toFhirClaim(input.claim, {
    patient: ref('Patient', patient.id), provider: ref('Organization', org.id), encounter: ref('Encounter', enc.id),
    practitioner: prac && ref('Practitioner', prac.id),
  });
  const resources = [claim, patient, enc, org, ...(prac ? [prac] : [])];
  return {
    resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(),
    identifier: { system: 'urn:jmsurf-hmis:claim-number', value: input.claim.claimNumber },
    entry: resources.map((r: any) => ({ fullUrl: `${r.resourceType}/${r.id}`, resource: r })),
  };
}
