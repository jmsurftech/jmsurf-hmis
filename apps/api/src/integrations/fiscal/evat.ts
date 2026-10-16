import { env, envInt, joinUrl } from '../config';
import { IntegrationHttpService } from '../http-client';
import { FiscalInvoicePort } from '../ports';
import { r2, SignArgs, SignResult } from './fiscal-common';

/** Ghana levy configuration (rates as fractions). Defaults reflect the post-2026 VAT reform; override via env. */
export interface GhLevies { nhil: number; getfund: number; covid: number; vat: number; vatOnLevies: boolean }
export const ghLevies = (): GhLevies => ({
  nhil: envInt('GRA_NHIL_RATE_BP', 250) / 10000, getfund: envInt('GRA_GETFUND_RATE_BP', 250) / 10000, covid: envInt('GRA_COVID_RATE_BP', 0) / 10000,
  vat: envInt('GRA_VAT_RATE_BP', 1500) / 10000, vatOnLevies: env('GRA_VAT_ON_LEVIES', 'false') === 'true',
});

/** Back-calculate levies and VAT from a tax-inclusive gross amount. Exempt lines (vatRate 0) carry no levies. */
export function ghBreakdown(gross: number, taxable: boolean, lv: GhLevies) {
  if (!taxable) return { base: r2(gross), nhil: 0, getfund: 0, covid: 0, vat: 0 };
  const levyRate = lv.nhil + lv.getfund + lv.covid;
  const factor = lv.vatOnLevies ? (1 + levyRate) * (1 + lv.vat) : 1 + levyRate + lv.vat;
  const base = gross / factor;
  const vatBase = lv.vatOnLevies ? base * (1 + levyRate) : base;
  return { base: r2(base), nhil: r2(base * lv.nhil), getfund: r2(base * lv.getfund), covid: r2(base * lv.covid), vat: r2(vatBase * lv.vat) };
}

/** GRA E-VAT invoice payload (INCLUSIVE calculation). Pure. */
export function buildEvatInvoice(a: SignArgs, now = new Date(), lv = ghLevies()) {
  const items = a.lines.map((l, i) => {
    const gross = (l.unitPriceMinor * l.quantity) / 100;
    const b = ghBreakdown(gross, l.vatRate > 0, lv);
    return {
      itemCode: l.code ?? `ITEM${i + 1}`, itemCategory: l.vatRate > 0 ? '' : 'EXM', expireDate: '', description: l.description, quantity: String(l.quantity),
      levyAmountA: b.nhil, levyAmountB: b.getfund, levyAmountC: b.covid, levyAmountD: 0, levyAmountE: 0, discountAmount: 0, batchCode: '',
      unitPrice: r2(l.unitPriceMinor / 100), vat: b.vat,
    };
  });
  const sum = (k: 'levyAmountA' | 'levyAmountB' | 'levyAmountC' | 'vat') => r2(items.reduce((t, i) => t + i[k], 0));
  return {
    currency: 'GHS', exchangeRate: '1.0', invoiceNumber: a.invoiceNumber, totalLevy: r2(sum('levyAmountA') + sum('levyAmountB') + sum('levyAmountC')),
    userName: env('GRA_USERNAME', 'hmis'), flag: 'INVOICE', calculationType: 'INCLUSIVE', totalVat: sum('vat'), transactionDate: now.toISOString().slice(0, 19),
    totalAmount: r2(a.totalMinor / 100), voucherAmount: 0, businessPartnerName: a.buyerPin ? '' : 'Cash Customer', businessPartnerTin: a.buyerPin ?? 'C0000000000',
    saleType: 'NORMAL', discountType: 'GENERAL', discountAmount: 0, reference: '', groupReferenceId: '', purchaseOrderReference: '',
    items: items.map(({ vat: _v, ...rest }) => rest),
  };
}

/** Ghana GRA E-VAT adapter (invoice signing via the GRA/VSDC API, security_key header). */
export class EVatAdapter implements FiscalInvoicePort {
  constructor(private http: IntegrationHttpService) {}
  async signInvoice(args: SignArgs): Promise<SignResult> {
    const r: any = await this.http.request({
      adapter: 'evat', operation: 'invoice', url: joinUrl(env('GRA_BASE_URL', 'http://localhost:4100/gra'), env('GRA_INVOICE_PATH', '/api/v1/taxpayer/invoice')),
      headers: { security_key: env('GRA_SECURITY_KEY') }, body: buildEvatInvoice(args), idempotencyKey: `evat:${args.invoiceNumber}`,
    });
    const m = r?.response?.mesaage ?? r?.response?.message;
    if (r?.response?.status !== 'SUCCESS' || !m) return { signed: false, raw: r };
    return { signed: true, receiptNo: `${m.ysdcid}/${m.ysdcrecnum}`, qr: m.qr_code, raw: r };
  }
}
