/** Helpers to read our FHIR claim Bundle (see fhir/mappers.ts) for non-FHIR national insurers. Pure. */
export function bundleParts(bundle: any) {
  const res = (t: string) => (bundle?.entry ?? []).map((e: any) => e.resource).find((r: any) => r?.resourceType === t);
  const claim = res('Claim') ?? {};
  const patient = res('Patient') ?? {};
  const encounter = res('Encounter') ?? {};
  const org = res('Organization') ?? {};
  const prac = res('Practitioner');
  const idBy = (r: any, re: RegExp) => (r?.identifier ?? []).find((i: any) => re.test(`${i.system ?? ''} ${i.type?.text ?? ''}`))?.value;
  const name = patient.name?.[0] ?? {};
  return {
    claimNumber: claim.identifier?.[0]?.value ?? bundle?.identifier?.value,
    created: claim.created ?? bundle?.timestamp,
    patient: { family: name.family ?? '', given: (name.given ?? []).join(' '), gender: patient.gender, birthDate: patient.birthDate, mrn: idBy(patient, /mrn/i), ids: patient.identifier ?? [] },
    encounter: { class: encounter.class?.code, start: encounter.period?.start, end: encounter.period?.end },
    facilityIds: org.identifier ?? [],
    practitionerLicence: idBy(prac, /licen/i),
    preAuthRefs: claim.insurance?.[0]?.preAuthRef ?? [],
    diagnoses: (claim.diagnosis ?? []).map((d: any) => d.diagnosisCodeableConcept?.coding?.[0] ?? {}),
    items: (claim.item ?? []).map((it: any) => ({
      code: it.productOrService?.coding?.[0]?.code, display: it.productOrService?.text ?? it.productOrService?.coding?.[0]?.display,
      quantity: it.quantity?.value ?? 1, unitPrice: it.unitPrice?.value ?? 0, net: it.net?.value ?? 0, date: it.servicedDate,
    })),
    total: claim.total?.value ?? 0,
  };
}
export const memberIdFrom = (ids: any[], re: RegExp) => ids.find((i: any) => re.test(`${i.system ?? ''} ${i.type?.text ?? ''}`))?.value;
