import { env } from '../config';

/**
 * Identifier / code systems used in FHIR payloads to the Kenya HIE.
 * ASSUMPTION: the official system URIs are published in the DHA/HIE implementation guide issued to certified vendors.
 * All are overridable by env so they can be corrected without a code change. See docs/integrations/ASSUMPTIONS.md.
 */
export const FhirSystems = {
  get crId() { return env('FHIR_SYSTEM_CR_ID', 'https://cr.health.go.ke/identifier/cr-id'); },
  get nationalId() { return env('FHIR_SYSTEM_NATIONAL_ID', 'https://cr.health.go.ke/identifier/national-id'); },
  get shaNumber() { return env('FHIR_SYSTEM_SHA_NUMBER', 'https://sha.go.ke/identifier/member-number'); },
  get kmhfr() { return env('FHIR_SYSTEM_KMHFR', 'https://kmhfr.health.go.ke/identifier/facility-code'); },
  get shaFacility() { return env('FHIR_SYSTEM_SHA_FACILITY', 'https://sha.go.ke/identifier/facility-id'); },
  get hwr() { return env('FHIR_SYSTEM_HWR', 'https://hwr.health.go.ke/identifier/registration-number'); },
  get licence() { return env('FHIR_SYSTEM_LICENCE', 'https://hwr.health.go.ke/identifier/licence-number'); },
  get shaIntervention() { return env('FHIR_SYSTEM_SHA_INTERVENTION', 'https://sha.go.ke/codesystem/intervention'); },
  get mrn() { return env('FHIR_SYSTEM_MRN', 'urn:jmsurf-hmis:mrn'); },
  icd11: 'http://id.who.int/icd/release/11/mms',
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  claimType: 'http://terminology.hl7.org/CodeSystem/claim-type',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  diagType: 'http://terminology.hl7.org/CodeSystem/ex-diagnosistype',
};
