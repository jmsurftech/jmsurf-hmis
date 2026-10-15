import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { env, joinUrl } from '../../config';
import { IntegrationHttpService, TokenCache } from '../../http-client';
import {
  ClaimStatusResult, ClaimSubmitResult, ClientRegistryResult, EligibilityResult, NationalInsurancePort, PreAuthResult,
} from '../../ports';

/**
 * Kenya SHA via the national HIE (Afya Yangu / e-Claims). OAuth2 client credentials.
 * Every path is env-configurable because the official spec is issued only to DHA-certified vendors.
 * See docs/integrations/SHA_HIE.md for the assumed contract.
 */
@Injectable()
export class ShaHieAdapter implements NationalInsurancePort {
  private tokens = new TokenCache();
  constructor(private http: IntegrationHttpService) {}

  private url(pathEnv: string, def: string, params: Record<string, string> = {}) {
    let p = env(pathEnv, def);
    for (const [k, v] of Object.entries(params)) p = p.replace(`{${k}}`, encodeURIComponent(v));
    return joinUrl(env('SHA_BASE_URL', 'http://localhost:4100/sha'), p);
  }

  async token(): Promise<string> {
    const clientId = env('SHA_CLIENT_ID');
    return this.tokens.get(`sha:${clientId}`, async () => {
      const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: env('SHA_CLIENT_SECRET') });
      const scope = env('SHA_SCOPE');
      if (scope) body.set('scope', scope);
      const r = await this.http.request<any>({
        adapter: 'sha', operation: 'token', url: this.url('SHA_TOKEN_PATH', '/oauth2/token'), body,
        redact: () => ({ grant_type: 'client_credentials', client_id: clientId }),
      });
      return { token: r.access_token, expiresIn: Number(r.expires_in ?? 3600) };
    });
  }

  private async call<T>(operation: string, method: 'GET' | 'POST', url: string, body?: unknown, idempotencyKey?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.token()}` };
    const fid = env('SHA_FACILITY_ID');
    if (fid) headers['X-Facility-Id'] = fid;
    return this.http.request<T>({ adapter: 'sha', operation, method, url, body, headers, idempotencyKey });
  }

  async lookupClient(idType: string, idNumber: string): Promise<ClientRegistryResult> {
    const q = new URLSearchParams({ idType, idNumber }).toString();
    const r: any = await this.call('client-registry.lookup', 'GET', `${this.url('SHA_CR_PATH', '/v1/client-registry/search')}?${q}`);
    const c = r?.client ?? r?.data ?? r;
    if (!c || r?.found === false || !c.crId) return { found: false };
    return {
      found: true, crId: c.crId, firstName: c.firstName, middleName: c.middleName, lastName: c.lastName,
      sex: c.gender ?? c.sex, dateOfBirth: c.dateOfBirth, phone: c.phone, shaNumber: c.shaNumber,
    };
  }

  async checkEligibility(args: { crId?: string; idNumber?: string; facilityCode?: string; visitType?: string }): Promise<EligibilityResult> {
    const r: any = await this.call('eligibility', 'POST', this.url('SHA_ELIGIBILITY_PATH', '/v1/eligibility'), {
      crId: args.crId, idNumber: args.idNumber, facilityCode: args.facilityCode ?? env('SHA_FACILITY_ID'), visitType: args.visitType,
    });
    return {
      eligible: !!r?.eligible, fund: r?.fund, memberNumber: r?.memberNumber, reference: r?.reference ?? r?.eligibilityRef,
      message: r?.message ?? r?.reason, raw: r,
    };
  }

  async requestPreAuth(args: { crId: string; facilityCode: string; interventionCode: string; amountMinor: number; diagnosis?: string[]; notes?: string }): Promise<PreAuthResult> {
    const r: any = await this.call('preauth.submit', 'POST', this.url('SHA_PREAUTH_PATH', '/v1/preauthorizations'), {
      crId: args.crId, facilityCode: args.facilityCode, interventionCode: args.interventionCode,
      amount: args.amountMinor / 100, diagnosis: args.diagnosis ?? [], notes: args.notes,
    }, `preauth:${args.crId}:${args.interventionCode}:${args.amountMinor}:${args.notes ?? ''}`);
    const status = String(r?.status ?? 'SUBMITTED').toUpperCase();
    return {
      status: (['APPROVED', 'REJECTED'].includes(status) ? status : 'SUBMITTED') as PreAuthResult['status'],
      externalRef: r?.preauthRef ?? r?.reference ?? r?.id,
      approvedMinor: r?.approvedAmount != null ? Math.round(Number(r.approvedAmount) * 100) : undefined,
      message: r?.message, raw: r,
    };
  }

  async submitClaim(fhirBundle: any): Promise<ClaimSubmitResult> {
    const claimNo = fhirBundle?.identifier?.value ?? randomUUID();
    const r: any = await this.call('claim.submit', 'POST', this.url('SHA_CLAIM_PATH', '/v1/claims'), fhirBundle, `claim:${claimNo}:${fhirBundle?.timestamp ?? ''}`);
    // Response may be a FHIR ClaimResponse or a simple JSON envelope.
    const outcome = String(r?.outcome ?? r?.status ?? 'queued').toLowerCase();
    const accepted = !['error', 'rejected'].includes(outcome);
    return {
      accepted, externalRef: r?.claimRef ?? r?.id ?? r?.identifier?.[0]?.value, status: accepted ? (outcome === 'complete' ? 'IN_REVIEW' : 'SUBMITTED') : 'REJECTED',
      message: r?.disposition ?? r?.message, raw: r,
    };
  }

  async claimStatus(externalRef: string): Promise<ClaimStatusResult> {
    const r: any = await this.call('claim.status', 'GET', this.url('SHA_CLAIM_STATUS_PATH', '/v1/claims/{ref}', { ref: externalRef }));
    const toMinor = (v: any) => (v == null ? undefined : Math.round(Number(v) * 100));
    return { status: String(r?.status ?? 'IN_REVIEW').toUpperCase(), approvedMinor: toMinor(r?.approvedAmount), paidMinor: toMinor(r?.paidAmount), reason: r?.reason, raw: r };
  }
}
