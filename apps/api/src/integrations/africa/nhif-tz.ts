import { env, joinUrl } from '../config';
import { IntegrationHttpService, TokenCache } from '../http-client';
import { ClaimStatusResult, ClaimSubmitResult, ClientRegistryResult, EligibilityResult, NationalInsurancePort, PreAuthResult } from '../ports';
import { bundleParts, memberIdFrom } from './fhir-extract';

/** NHIF Tanzania "Folio" claim (SubmitFolios). Pure. ICD codes: NHIF expects ICD-10, so the ICD-10 coding is preferred when present. */
export function buildNhifFolio(bundle: any, cfg = { facilityCode: env('NHIF_TZ_FACILITY_CODE'), createdBy: env('NHIF_TZ_USER', 'HMIS') }, serialNo = 1) {
  const b = bundleParts(bundle);
  const attended = new Date(b.encounter.start ?? b.created ?? Date.now());
  const inpatient = b.encounter.class === 'IMP';
  return {
    entities: [{
      FacilityCode: cfg.facilityCode, ClaimYear: attended.getUTCFullYear(), ClaimMonth: attended.getUTCMonth() + 1, FolioNo: serialNo,
      SerialNo: `${cfg.facilityCode}/${String(attended.getUTCMonth() + 1).padStart(2, '0')}/${attended.getUTCFullYear()}/${serialNo}`,
      CardNo: memberIdFrom(b.patient.ids, /nhif/i) ?? memberIdFrom(b.patient.ids, /member|insur/i) ?? '', FirstName: b.patient.given, LastName: b.patient.family,
      Gender: b.patient.gender === 'female' ? 'Female' : 'Male', DateOfBirth: b.patient.birthDate, PatientFileNo: b.patient.mrn ?? '',
      AuthorizationNo: b.preAuthRefs[0] ?? '', AttendanceDate: attended.toISOString().slice(0, 10), PatientTypeCode: inpatient ? 'IN' : 'OUT',
      DateAdmitted: inpatient ? b.encounter.start?.slice(0, 10) : null, DateDischarged: inpatient ? b.encounter.end?.slice(0, 10) ?? null : null,
      PractitionerNo: b.practitionerLicence ?? '', CreatedBy: cfg.createdBy, DateCreated: new Date(b.created ?? Date.now()).toISOString(),
      FolioDiseases: b.diagnoses.map((d: any) => ({ DiseaseCode: d.code, Remarks: d.display ?? null, CreatedBy: cfg.createdBy })),
      FolioItems: b.items.map((i: any) => ({ ItemCode: i.code, ItemQuantity: i.quantity, UnitPrice: i.unitPrice, AmountClaimed: i.net, ApprovalRefNo: b.preAuthRefs[0] ?? null, CreatedBy: cfg.createdBy })),
      ClaimNumber: b.claimNumber,
    }],
  };
}

/** NHIF Tanzania (claims server + verification service). OAuth2 password grant. */
export class NhifTzAdapter implements NationalInsurancePort {
  private tokens = new TokenCache();
  constructor(private http: IntegrationHttpService) {}
  private base() { return env('NHIF_TZ_BASE_URL', 'http://localhost:4100/nhif-tz'); }
  private async headers() {
    const token = await this.tokens.get(`nhiftz:${env('NHIF_TZ_USERNAME')}`, async () => {
      const r: any = await this.http.request({ adapter: 'nhif-tz', operation: 'token', url: joinUrl(this.base(), '/claimsserver/Token'),
        body: new URLSearchParams({ grant_type: 'password', username: env('NHIF_TZ_USERNAME'), password: env('NHIF_TZ_PASSWORD') }), redact: () => ({ grant_type: 'password' }) });
      return { token: r.access_token, expiresIn: Number(r.expires_in ?? 3600) };
    });
    return { Authorization: `Bearer ${token}` };
  }
  async lookupClient(_idType: string, idNumber: string): Promise<ClientRegistryResult> {
    const r: any = await this.http.request({ adapter: 'nhif-tz', operation: 'card.verify', method: 'GET', url: `${joinUrl(this.base(), '/verification/AuthorizeCard')}?CardNo=${encodeURIComponent(idNumber)}&VisitTypeID=1`, headers: await this.headers() });
    if (!r || r.CardStatus !== 'Active') return { found: false };
    return { found: true, crId: r.CardNo, firstName: r.FirstName, lastName: r.LastName, sex: r.Gender, dateOfBirth: r.DateOfBirth, shaNumber: r.CardNo };
  }
  async checkEligibility(a: { crId?: string; idNumber?: string; visitType?: string }): Promise<EligibilityResult> {
    const card = a.crId ?? a.idNumber ?? '';
    const r: any = await this.http.request({ adapter: 'nhif-tz', operation: 'card.authorize', method: 'GET', url: `${joinUrl(this.base(), '/verification/AuthorizeCard')}?CardNo=${encodeURIComponent(card)}&VisitTypeID=${a.visitType === 'IPD' ? 2 : 1}`, headers: await this.headers() });
    return { eligible: r?.CardStatus === 'Active' && !!r?.AuthorizationNo, memberNumber: r?.CardNo, reference: r?.AuthorizationNo, message: r?.Remarks ?? r?.CardStatus, raw: r };
  }
  async requestPreAuth(a: { crId: string; interventionCode: string; amountMinor: number }): Promise<PreAuthResult> {
    const r: any = await this.http.request({ adapter: 'nhif-tz', operation: 'preapproval', url: joinUrl(this.base(), '/claimsserver/api/v1/PreApproval/RequestApproval'),
      headers: await this.headers(), body: { CardNo: a.crId, ItemCode: a.interventionCode, Amount: a.amountMinor / 100, FacilityCode: env('NHIF_TZ_FACILITY_CODE') } });
    return { status: r?.Status === 'Approved' ? 'APPROVED' : r?.Status === 'Rejected' ? 'REJECTED' : 'SUBMITTED', externalRef: r?.ApprovalRefNo, approvedMinor: r?.ApprovedAmount ? Math.round(r.ApprovedAmount * 100) : undefined, message: r?.Remarks, raw: r };
  }
  async submitClaim(bundle: unknown): Promise<ClaimSubmitResult> {
    const body = buildNhifFolio(bundle);
    const r: any = await this.http.request({ adapter: 'nhif-tz', operation: 'claim.submit', url: joinUrl(this.base(), '/claimsserver/api/v1/Claims/SubmitFolios'), headers: await this.headers(), body, idempotencyKey: `nhiftz:${body.entities[0].ClaimNumber}` });
    const ok = r?.StatusCode === 200 || r?.Status === 'Success';
    return { accepted: ok, externalRef: r?.SubmissionID ?? body.entities[0].SerialNo, status: ok ? 'SUBMITTED' : 'REJECTED', message: r?.Message, raw: r };
  }
  async claimStatus(ref: string): Promise<ClaimStatusResult> {
    const r: any = await this.http.request({ adapter: 'nhif-tz', operation: 'claim.status', method: 'GET', url: `${joinUrl(this.base(), '/claimsserver/api/v1/Claims/GetSubmittedClaims')}?SubmissionID=${encodeURIComponent(ref)}`, headers: await this.headers() });
    const map: Record<string, string> = { Submitted: 'IN_REVIEW', Verified: 'IN_REVIEW', Approved: 'APPROVED', Rejected: 'REJECTED', Paid: 'PAID', PartiallyApproved: 'PARTIALLY_APPROVED' };
    return { status: map[r?.ClaimStatus] ?? 'IN_REVIEW', approvedMinor: r?.AmountApproved != null ? Math.round(r.AmountApproved * 100) : undefined, paidMinor: r?.AmountPaid != null ? Math.round(r.AmountPaid * 100) : undefined, reason: r?.Remarks, raw: r };
  }
}
