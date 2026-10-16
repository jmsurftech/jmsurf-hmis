import { env, joinUrl } from '../config';
import { IntegrationHttpService } from '../http-client';
import { FiscalInvoicePort } from '../ports';
import { r2, splitLine, SignArgs, SignResult } from './fiscal-common';

/** FIRS Invoice Reference Number: {invoiceNo}-{serviceId}-{YYYYMMDD}. */
export const firsIrn = (invoiceNo: string, serviceId: string, d: Date) => `${invoiceNo.replace(/[^A-Za-z0-9]/g, '')}-${serviceId}-${d.toISOString().slice(0, 10).replace(/-/g, '')}`;

/** FIRS e-Invoicing (MBS) invoice, UBL-aligned JSON. Pure. */
export function buildFirsInvoice(a: SignArgs, now = new Date()) {
  const lines = a.lines.map((l) => ({ l, s: splitLine(l) }));
  const tax = r2(lines.reduce((t, x) => t + x.s.tax, 0));
  const gross = r2(a.totalMinor / 100);
  const subtotals = new Map<string, { taxable: number; tax: number; percent: number }>();
  for (const { l, s } of lines) {
    const id = l.vatRate > 0 ? 'STANDARD_VAT' : 'EXEMPTED';
    const e = subtotals.get(id) ?? { taxable: 0, tax: 0, percent: r2(l.vatRate * 100) };
    e.taxable += s.net; e.tax += s.tax; subtotals.set(id, e);
  }
  return {
    business_id: env('FIRS_BUSINESS_ID'), irn: firsIrn(a.invoiceNumber, env('FIRS_SERVICE_ID', 'SRV00001'), now),
    issue_date: now.toISOString().slice(0, 10), issue_time: now.toISOString().slice(11, 19), invoice_type_code: '380',
    document_currency_code: 'NGN', tax_currency_code: 'NGN', payment_status: 'PAID',
    accounting_supplier_party: { party_name: env('FIRS_PARTY_NAME', 'JMSURF Facility'), tin: env('FIRS_TIN'), email: env('FIRS_EMAIL', 'billing@example.com'),
      postal_address: { street_name: env('FIRS_STREET', ''), city_name: env('FIRS_CITY', 'Lagos'), postal_zone: '', country: 'NG' } },
    ...(a.buyerPin ? { accounting_customer_party: { tin: a.buyerPin } } : {}),
    legal_monetary_total: { line_extension_amount: r2(gross - tax), tax_exclusive_amount: r2(gross - tax), tax_inclusive_amount: gross, payable_amount: gross },
    tax_total: [{ tax_amount: tax, tax_subtotal: [...subtotals.entries()].map(([id, e]) => ({ taxable_amount: r2(e.taxable), tax_amount: r2(e.tax), tax_category: { id, percent: e.percent } })) }],
    invoice_line: lines.map(({ l, s }, i) => ({
      hsn_code: l.code ?? `ITEM${i + 1}`, product_category: env('FIRS_PRODUCT_CATEGORY', 'Healthcare services'), invoiced_quantity: l.quantity,
      line_extension_amount: s.net, item: { name: l.description, description: l.description },
      price: { price_amount: s.unit, base_quantity: 1, price_unit: 'NGN per 1' },
    })),
  };
}

/** Nigeria FIRS e-Invoicing via MBS / access-point provider: validate then sign (returns QR). */
export class FirsAdapter implements FiscalInvoicePort {
  constructor(private http: IntegrationHttpService) {}
  async signInvoice(args: SignArgs): Promise<SignResult> {
    const base = env('FIRS_BASE_URL', 'http://localhost:4100/firs');
    const headers = { 'x-api-key': env('FIRS_API_KEY'), 'x-api-secret': env('FIRS_API_SECRET') };
    const body = buildFirsInvoice(args);
    const v: any = await this.http.request({ adapter: 'firs', operation: 'validate', url: joinUrl(base, '/api/v1/invoice/validate'), headers, body });
    if (v?.code && Number(v.code) >= 400) return { signed: false, raw: v };
    const r: any = await this.http.request({ adapter: 'firs', operation: 'sign', url: joinUrl(base, '/api/v1/invoice/sign'), headers, body, idempotencyKey: `firs:${body.irn}` });
    if (!r?.data?.qr_code && Number(r?.code ?? 500) >= 300) return { signed: false, raw: r };
    return { signed: true, receiptNo: body.irn, qr: r.data?.qr_code, raw: r };
  }
}
