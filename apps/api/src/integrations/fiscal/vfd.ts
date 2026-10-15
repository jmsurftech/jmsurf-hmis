import { env, joinUrl } from '../config';
import { IntegrationHttpService, TokenCache } from '../http-client';
import { FiscalInvoicePort } from '../ports';
import { hmacSign, r2, splitLine, SignArgs, SignResult } from './fiscal-common';

/** TRA VFD tax codes: 1=A standard 18%, 2=B special rate, 3=C zero-rated, 4=D special relief, 5=E exempt. */
export const vfdTaxCode = (rate: number) => (rate >= 0.15 ? 1 : rate > 0 ? 2 : 5);
const VAT_LETTER: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };
const xml = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface VfdCounters { gc: number; dc: number; rctNum: number }

/** Build the <RCT> receipt XML. Pure given counters and `now`. */
export function buildVfdReceipt(a: SignArgs, c: VfdCounters, now = new Date()) {
  const date = now.toISOString().slice(0, 10), time = now.toISOString().slice(11, 19);
  const lines = a.lines.map((l, i) => ({ l, s: splitLine(l), i, code: vfdTaxCode(l.vatRate) }));
  const vat = new Map<number, { net: number; tax: number }>();
  for (const x of lines) { const v = vat.get(x.code) ?? { net: 0, tax: 0 }; v.net += x.s.net; v.tax += x.s.tax; vat.set(x.code, v); }
  const totalIncl = r2(a.totalMinor / 100);
  const totalExcl = r2(totalIncl - lines.reduce((t, x) => t + x.s.tax, 0));
  const rctvNum = `${env('VFD_RECEIPT_CODE', 'ABC123')}${c.gc}`;
  const rct = [
    '<RCT>',
    `<DATE>${date}</DATE><TIME>${time}</TIME><TIN>${xml(env('VFD_TIN'))}</TIN><REGID>${xml(env('VFD_REGID'))}</REGID><EFDSERIAL>${xml(env('VFD_SERIAL'))}</EFDSERIAL>`,
    `<CUSTIDTYPE>${a.buyerPin ? 1 : 6}</CUSTIDTYPE><CUSTID>${xml(a.buyerPin ?? '')}</CUSTID><CUSTNAME></CUSTNAME><MOBILENUM></MOBILENUM>`,
    `<RCTNUM>${c.rctNum}</RCTNUM><DC>${c.dc}</DC><GC>${c.gc}</GC><ZNUM>${date.replace(/-/g, '')}</ZNUM><RCTVNUM>${rctvNum}</RCTVNUM>`,
    '<ITEMS>',
    ...lines.map(({ l, s, i, code }) => `<ITEM><ID>${xml(l.code ?? `ITEM${i + 1}`)}</ID><DESC>${xml(l.description)}</DESC><QTY>${l.quantity}</QTY><TAXCODE>${code}</TAXCODE><AMT>${s.gross.toFixed(2)}</AMT></ITEM>`),
    '</ITEMS>',
    `<TOTALS><TOTALTAXEXCL>${totalExcl.toFixed(2)}</TOTALTAXEXCL><TOTALTAXINCL>${totalIncl.toFixed(2)}</TOTALTAXINCL><DISCOUNT>0.00</DISCOUNT></TOTALS>`,
    `<PAYMENTS><PMTTYPE>CASH</PMTTYPE><PMTAMOUNT>${totalIncl.toFixed(2)}</PMTAMOUNT></PAYMENTS>`,
    '<VATTOTALS>', ...[...vat.entries()].map(([k, v]) => `<VATRATE>${VAT_LETTER[k]}</VATRATE><NETTAMOUNT>${r2(v.net).toFixed(2)}</NETTAMOUNT><TAXAMOUNT>${r2(v.tax).toFixed(2)}</TAXAMOUNT>`), '</VATTOTALS>',
    '</RCT>',
  ].join('');
  const verifyUrl = `${env('VFD_VERIFY_BASE', 'https://verify.tra.go.tz')}/${rctvNum}_${time.replace(/:/g, '')}`;
  return { xml: `<?xml version="1.0" encoding="UTF-8"?><EFDMS>${rct}<EFDMSSIGNATURE>${hmacSign(rct, env('VFD_PRIVATE_KEY'))}</EFDMSSIGNATURE></EFDMS>`, rctvNum, verifyUrl };
}

/** Tanzania TRA VFD adapter: token (password grant) + receipt posting (Routing-Key: vfdrct). */
export class VfdAdapter implements FiscalInvoicePort {
  private tokens = new TokenCache();
  private counters: VfdCounters = { gc: Number(env('VFD_GC_START', '1')), dc: 0, rctNum: 0 };
  constructor(private http: IntegrationHttpService) {}
  private base() { return env('VFD_BASE_URL', 'http://localhost:4100/vfd'); }
  private token() {
    return this.tokens.get(`vfd:${env('VFD_USERNAME')}`, async () => {
      const r: any = await this.http.request({ adapter: 'vfd', operation: 'token', url: joinUrl(this.base(), '/vfdtoken'),
        body: new URLSearchParams({ username: env('VFD_USERNAME'), password: env('VFD_PASSWORD'), grant_type: 'password' }), redact: () => ({ grant_type: 'password' }) });
      return { token: r.access_token, expiresIn: Number(r.expires_in ?? 3600) };
    });
  }
  async signInvoice(args: SignArgs): Promise<SignResult> {
    this.counters = { gc: this.counters.gc + 1, dc: this.counters.dc + 1, rctNum: this.counters.rctNum + 1 };
    const rec = buildVfdReceipt(args, this.counters);
    const r: any = await this.http.request({
      adapter: 'vfd', operation: 'receipt', url: joinUrl(this.base(), '/api/efdmsRctInfo'), body: rec.xml, idempotencyKey: `vfd:${args.invoiceNumber}`,
      headers: { 'Content-Type': 'application/xml', 'Routing-Key': 'vfdrct', 'Cert-Serial': Buffer.from(env('VFD_CERT_SERIAL')).toString('base64'), Authorization: `bearer ${await this.token()}` },
    });
    const text = typeof r === 'string' ? r : JSON.stringify(r);
    const ackCode = /<ACKCODE>(\d+)<\/ACKCODE>/.exec(text)?.[1];
    if (ackCode !== '0') return { signed: false, raw: r };
    return { signed: true, receiptNo: rec.rctvNum, qr: rec.verifyUrl, raw: r };
  }
}
