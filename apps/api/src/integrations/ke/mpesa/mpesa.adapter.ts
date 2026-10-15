import { Injectable } from '@nestjs/common';
import { env, joinUrl } from '../../config';
import { IntegrationHttpService, TokenCache } from '../../http-client';
import { MobileMoneyPort } from '../../ports';
import { darajaTimestamp, normalizeMsisdn, stkPassword } from './mpesa.util';

/** Safaricom M-Pesa Daraja: OAuth + Lipa na M-Pesa Online (STK push). Callbacks are parsed by mpesa.util. */
@Injectable()
export class MpesaDarajaAdapter implements MobileMoneyPort {
  private tokens = new TokenCache();
  constructor(private http: IntegrationHttpService) {}
  private base() { return env('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke'); }

  async token(): Promise<string> {
    const key = env('MPESA_CONSUMER_KEY');
    return this.tokens.get(`mpesa:${key}`, async () => {
      const basic = Buffer.from(`${key}:${env('MPESA_CONSUMER_SECRET')}`).toString('base64');
      const r = await this.http.request<any>({
        adapter: 'mpesa', operation: 'oauth', method: 'GET',
        url: joinUrl(this.base(), 'oauth/v1/generate?grant_type=client_credentials'), headers: { Authorization: `Basic ${basic}` },
      });
      return { token: r.access_token, expiresIn: Number(r.expires_in ?? 3599) };
    });
  }

  async stkPush(args: { phone: string; amountMinor: number; accountRef: string; description: string }) {
    const shortcode = env('MPESA_SHORTCODE', '174379');
    const timestamp = darajaTimestamp();
    const phone = normalizeMsisdn(args.phone);
    const body = {
      BusinessShortCode: shortcode,
      Password: stkPassword(shortcode, env('MPESA_PASSKEY'), timestamp),
      Timestamp: timestamp,
      TransactionType: env('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
      Amount: Math.ceil(args.amountMinor / 100), // Daraja accepts whole shillings only
      PartyA: phone, PartyB: env('MPESA_PARTY_B', shortcode), PhoneNumber: phone,
      CallBackURL: env('MPESA_CALLBACK_URL'),
      AccountReference: args.accountRef.slice(0, 12),
      TransactionDesc: args.description.slice(0, 13),
    };
    const r = await this.http.request<any>({
      adapter: 'mpesa', operation: 'stkpush', url: joinUrl(this.base(), 'mpesa/stkpush/v1/processrequest'), body,
      headers: { Authorization: `Bearer ${await this.token()}` }, retries: 1,
      redact: (b: any) => ({ ...b, Password: '***' }),
    });
    if (r?.ResponseCode !== undefined && String(r.ResponseCode) !== '0') throw new Error(`STK push rejected: ${r.ResponseDescription ?? r.errorMessage}`);
    return { checkoutRequestId: r.CheckoutRequestID as string, raw: r };
  }
}
