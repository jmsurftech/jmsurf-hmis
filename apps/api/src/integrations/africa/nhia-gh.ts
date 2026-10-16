import { env, joinUrl } from '../config';
import { IntegrationHttpService } from '../http-client';
import { ClaimStatusResult, ClaimSubmitResult, ClientRegistryResult, EligibilityResult, NationalInsurancePort, PreAuthResult } from '../ports';
import { bundleParts, memberIdFrom } from './fhir-extract';

/** NHIA Ghana Claim-IT claim (G-DRG coded). Items are classified as medicine vs procedure by code prefix. Pure. */
export function buildNhiaClaim(bundle: any, cfg = { facilityId: env('NHIA_FACILITY_ID'), cccPrefix: env('NHIA_CCC', '') }) {
  const b = bundleParts(bundle);
  const inpatient = b.encounter.class === 'IMP';
  const isMedicine = (code?: string) => /^[A-Z]{6,}\d/.test(code ?? '') || /^MED/i.test(code ?? '');
  const date = (d?: string) => (d ?? b.created ?? '').slice(0, 10);
  return {
    claim: {
      claimID: b.claimNumber, facilityID: cfg.facilityId, claimCheckCode: cfg.cccPrefix || (b.preAuthRefs[0] ?? ''),
      memberNo: memberIdFrom(b.patient.ids, /nhis|nhia/i) ?? memberIdFrom(b.patient.ids, /member|insur/i) ?? '', cardSerialNo: memberIdFrom(b.patient.ids, /serial/i) ?? '',
      surname: b.patient.family, otherNames: b.patient.given, dateOfBirth: b.patient.birthDate, gender: b.patient.gender === 'female' ? 'F' : 'M',
      hospitalRecNo: b.patient.mrn ?? '', isDependant: false, typeOfService: inpatient ? 'IPD' : 'OPD', typeOfAttendance: 'EAE', serviceOutcome: 'DISC',
      dateOfService: [date(b.encounter.start), ...(inpatient && b.encounter.end ? [date(b.encounter.end)] : [])],
      specialtyAttended: env('NHIA_SPECIALTY', 'OPDC'), attendingPrac: b.practitionerLicence ?? '',
      diagnosis: b.diagnoses.map((d: any) => ({ gdrgCode: env('NHIA_DEFAULT_GDRG', 'OPDC06A'), icd10: d.code, diagnosis: d.display ?? '' })),
      procedure: b.items.filter((i: any) => !isMedicine(i.code)).map((i: any) => ({ gdrgCode: i.code, date: date(i.date), quantity: i.quantity, amount: i.net })),
      medicine: b.items.filter((i: any) => isMedicine(i.code)).map((i: any) => ({ medicineCode: i.code, dispensedQty: i.quantity, serviceDate: date(i.date), amount: i.net })),
      totalClaimed: b.total,
    },
  };
}

/** Ghana NHIA (Claim-IT e-claims + CCC member verification). API key auth. */
export class NhiaGhAdapter implements NationalInsurancePort {
  constructor(private http: IntegrationHttpService) {}
  private base() { return env('NHIA_BASE_URL', 'http://localhost:4100/nhia'); }
  private headers() { return { 'x-api-key': env('NHIA_API_KEY'), 'x-facility-id': env('NHIA_FACILITY_ID') }; }
  async lookupClient(_t: string, memberNo: string): Promise<ClientRegistryResult> {
    const r: any = await this.http.request({ adapter: 'nhia', operation: 'member.verify', url: joinUrl(this.base(), '/api/v1/members/verify'), headers: this.headers(), body: { memberNo } });
    if (!r?.found) return { found: false };
    return { found: true, crId: r.memberNo, firstName: r.otherNames, lastName: r.surname, sex: r.gender, dateOfBirth: r.dateOfBirth, shaNumber: r.memberNo };
  }
  async checkEligibility(a: { crId?: string; idNumber?: string }): Promise<EligibilityResult> {
    const r: any = await this.http.request({ adapter: 'nhia', operation: 'ccc', url: joinUrl(this.base(), '/api/v1/ccc'), headers: this.headers(), body: { memberNo: a.crId ?? a.idNumber } });
    return { eligible: r?.status === 'ACTIVE', memberNumber: r?.memberNo, reference: r?.ccc, message: r?.message, raw: r };
  }
  async requestPreAuth(): Promise<PreAuthResult> {
    return { status: 'SUBMITTED', message: 'NHIA uses the Claim Check Code (CCC) at attendance; no separate pre-authorisation API.' };
  }
  async submitClaim(bundle: unknown): Promise<ClaimSubmitResult> {
    const body = buildNhiaClaim(bundle);
    const r: any = await this.http.request({ adapter: 'nhia', operation: 'claim.submit', url: joinUrl(this.base(), '/api/v1/claims'), headers: this.headers(), body, idempotencyKey: `nhia:${body.claim.claimID}` });
    const ok = r?.status === 'RECEIVED';
    return { accepted: ok, externalRef: r?.claimRef, status: ok ? 'SUBMITTED' : 'REJECTED', message: r?.message, raw: r };
  }
  async claimStatus(ref: string): Promise<ClaimStatusResult> {
    const r: any = await this.http.request({ adapter: 'nhia', operation: 'claim.status', method: 'GET', url: joinUrl(this.base(), `/api/v1/claims/${encodeURIComponent(ref)}`), headers: this.headers() });
    return { status: r?.status === 'VETTED' ? 'APPROVED' : r?.status ?? 'IN_REVIEW', approvedMinor: r?.approvedAmount != null ? Math.round(r.approvedAmount * 100) : undefined, reason: r?.remarks, raw: r };
  }
}
