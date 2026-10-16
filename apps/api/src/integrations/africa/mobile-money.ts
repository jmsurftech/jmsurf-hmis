import { randomUUID } from 'crypto';
import { env, joinUrl } from '../config';
import { IntegrationHttpService, TokenCache } from '../http-client';
import { MobileMoneyPort } from '../ports';
import { getCountryPack } from '../country-packs';

type StkArgs = Parameters<MobileMoneyPort['stkPush']>[0];

/** Normalise to E.164 digits without '+', using the country's dialling prefix. */
export function toMsisdn(phone: string, countryCode: string) {
  const prefix = getCountryPack(countryCode).phonePrefix.replace('+', '');
  const d = phone.replace(/\D/g, '');
  if (d.startsWith(prefix)) return d;
  return `${prefix}${d.replace(/^0+/, '')}`;
}

/** MTN MoMo Collection "RequestToPay" body. Pure. */
export function buildMomoRequestToPay(a: StkArgs, countryCode: string, currency = getCountryPack(countryCode).currency) {
  return {
    amount: String(Math.ceil(a.amountMinor / 100)), currency, externalId: a.accountRef,
    payer: { partyIdType: 'MSISDN', partyId: toMsisdn(a.phone, countryCode) }, payerMessage: a.description.slice(0, 160), payeeNote: a.accountRef,
  };
}

/** Airtel Money (Africa) collection payment body. Pure. MSISDN is sent without the country code. */
export function buildAirtelPayment(a: StkArgs, countryCode: string, id: string) {
  const pack = getCountryPack(countryCode);
  const msisdn = toMsisdn(a.phone, countryCode).slice(pack.phonePrefix.length - 1);
  return {
    reference: a.description.slice(0, 64), subscriber: { country: pack.code, currency: pack.currency, msisdn },
    transaction: { amount: Math.ceil(a.amountMinor / 100), country: pack.code, currency: pack.currency, id },
  };
}

export class MtnMomoAdapter implements MobileMoneyPort {
  private tokens = new TokenCache();
  constructor(private http: IntegrationHttpService, private countryCode: () => Promise<string>) {}
  private base() { return env('MTN_MOMO_BASE_URL', 'http://localhost:4100/momo'); }
  private async token() {
    return this.tokens.get(`momo:${env('MTN_MOMO_API_USER')}`, async () => {
      const basic = Buffer.from(`${env('MTN_MOMO_API_USER')}:${env('MTN_MOMO_API_KEY')}`).toString('base64');
      const r: any = await this.http.request({ adapter: 'mtn-momo', operation: 'token', url: joinUrl(this.base(), '/collection/token/'),
        headers: { Authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': env('MTN_MOMO_SUBSCRIPTION_KEY') } });
      return { token: r.access_token, expiresIn: Number(r.expires_in ?? 3600) };
    });
  }
  async stkPush(a: StkArgs) {
    const cc = await this.countryCode();
    const ref = randomUUID();
    const body = buildMomoRequestToPay(a, cc, env('MTN_MOMO_CURRENCY') || undefined);
    const r = await this.http.request({ adapter: 'mtn-momo', operation: 'requesttopay', url: joinUrl(this.base(), '/collection/v1_0/requesttopay'), body, retries: 1,
      headers: { Authorization: `Bearer ${await this.token()}`, 'X-Reference-Id': ref, 'X-Target-Environment': env('MTN_MOMO_TARGET_ENV', 'sandbox'),
        'Ocp-Apim-Subscription-Key': env('MTN_MOMO_SUBSCRIPTION_KEY'), ...(env('MTN_MOMO_CALLBACK_URL') ? { 'X-Callback-Url': env('MTN_MOMO_CALLBACK_URL') } : {}) } });
    return { checkoutRequestId: ref, raw: r };
  }
}

export class AirtelMoneyAdapter implements MobileMoneyPort {
  private tokens = new TokenCache();
  constructor(private http: IntegrationHttpService, private countryCode: () => Promise<string>) {}
  private base() { return env('AIRTEL_BASE_URL', 'http://localhost:4100/airtel'); }
  private async token() {
    return this.tokens.get(`airtel:${env('AIRTEL_CLIENT_ID')}`, async () => {
      const r: any = await this.http.request({ adapter: 'airtel', operation: 'token', url: joinUrl(this.base(), '/auth/oauth2/token'),
        body: { client_id: env('AIRTEL_CLIENT_ID'), client_secret: env('AIRTEL_CLIENT_SECRET'), grant_type: 'client_credentials' }, redact: () => ({ grant_type: 'client_credentials' }) });
      return { token: r.access_token, expiresIn: Number(r.expires_in ?? 3600) };
    });
  }
  async stkPush(a: StkArgs) {
    const cc = await this.countryCode();
    const pack = getCountryPack(cc);
    const id = `${a.accountRef}-${Date.now()}`.slice(0, 40);
    const r: any = await this.http.request({ adapter: 'airtel', operation: 'payment', url: joinUrl(this.base(), '/merchant/v1/payments/'), body: buildAirtelPayment(a, cc, id), retries: 1,
      headers: { Authorization: `Bearer ${await this.token()}`, 'X-Country': pack.code, 'X-Currency': pack.currency } });
    if (r?.status && r.status.success === false) throw new Error(`Airtel Money rejected: ${r.status.message ?? r.status.code}`);
    return { checkoutRequestId: r?.data?.transaction?.id ?? id, raw: r };
  }
}
