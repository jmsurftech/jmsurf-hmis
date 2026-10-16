import { randomUUID } from 'crypto';
import { env, joinUrl } from '../config';
import { IntegrationHttpService } from '../http-client';
import { FiscalInvoicePort } from '../ports';
import { hmacSign, isoLocal, splitLine, r2, SignArgs, SignResult } from './fiscal-common';

/** EFRIS tax category codes: 01 standard (18%), 02 zero-rated, 03 exempt. */
export const efrisTaxCategory = (rate: number) => (rate > 0 ? '01' : rate === 0 ? '03' : '02');

/** T109 "Billing upload" invoice content (before encoding). Pure. */
export function buildEfrisInvoice(a: SignArgs, now = new Date()) {
  const lines = a.lines.map((l, i) => ({ l, s: splitLine(l), i }));
  const byCat = new Map<string, { net: number; tax: number; gross: number; rate: number }>();
  for (const { l, s } of lines) {
    const k = efrisTaxCategory(l.vatRate);
    const e = byCat.get(k) ?? { net: 0, tax: 0, gross: 0, rate: l.vatRate };
    e.net += s.net; e.tax += s.tax; e.gross += s.gross; byCat.set(k, e);
  }
  const tax = r2(lines.reduce((t, x) => t + x.s.tax, 0));
  const gross = r2(a.totalMinor / 100);
  return {
    sellerDetails: { tin: env('EFRIS_TIN'), ninBrn: env('EFRIS_BRN'), legalName: env('EFRIS_LEGAL_NAME', 'JMSURF Facility'), referenceNo: a.invoiceNumber },
    basicInformation: {
      invoiceNo: '', antifakeCode: '', deviceNo: env('EFRIS_DEVICE_NO'), issuedDate: isoLocal(now), operator: env('EFRIS_OPERATOR', 'HMIS'),
      currency: 'UGX', oriInvoiceId: '', invoiceType: '1', invoiceKind: '1', dataSource: '103', invoiceIndustryCode: '102', isBatch: '0',
    },
    buyerDetails: { buyerTin: a.buyerPin ?? '', buyerType: a.buyerPin ? '0' : '1', buyerLegalName: '' },
    goodsDetails: lines.map(({ l, s, i }) => ({
      item: l.description, itemCode: l.code ?? `ITEM${i + 1}`, qty: String(l.quantity), unitOfMeasure: env('EFRIS_DEFAULT_UOM', '101'),
      unitPrice: s.unit.toFixed(2), total: s.gross.toFixed(2), taxRate: l.vatRate.toFixed(2), tax: s.tax.toFixed(2), orderNumber: String(i),
      discountFlag: '2', deemedFlag: '2', exciseFlag: '2', goodsCategoryId: env('EFRIS_DEFAULT_COMMODITY', '85121800'),
    })),
    taxDetails: [...byCat.entries()].map(([taxCategoryCode, e]) => ({
      taxCategoryCode, netAmount: r2(e.net).toFixed(2), taxRate: e.rate.toFixed(2), taxAmount: r2(e.tax).toFixed(2), grossAmount: r2(e.gross).toFixed(2),
    })),
    summary: { netAmount: r2(gross - tax).toFixed(2), taxAmount: tax.toFixed(2), grossAmount: gross.toFixed(2), itemCount: String(lines.length), modeCode: '1', remarks: '' },
    payWay: [{ paymentMode: '102', paymentAmount: gross.toFixed(2), orderNumber: 'a' }],
  };
}

/** Wrap content in the EFRIS interface envelope (base64 content + signature + globalInfo). Pure given `now`/`id`. */
export function efrisEnvelope(content: unknown, interfaceCode: string, now = new Date(), id: string = randomUUID()) {
  const b64 = Buffer.from(JSON.stringify(content)).toString('base64');
  return {
    data: { content: b64, signature: hmacSign(b64, env('EFRIS_PRIVATE_KEY')), dataDescription: { codeType: '0', encryptCode: '1', zipCode: '0' } },
    globalInfo: {
      appId: 'AP04', version: '1.1.20191201', dataExchangeId: id.replace(/-/g, ''), interfaceCode, requestCode: 'TP', requestTime: isoLocal(now),
      responseCode: 'TA', userName: env('EFRIS_USERNAME', 'admin'), deviceMAC: env('EFRIS_DEVICE_MAC', 'FFFFFFFFFFFF'), deviceNo: env('EFRIS_DEVICE_NO'),
      tin: env('EFRIS_TIN'), brn: env('EFRIS_BRN'), taxpayerID: env('EFRIS_TAXPAYER_ID', '1'), longitude: '32.5825', latitude: '0.3476', extendField: null,
    },
    returnStateInfo: { returnCode: '', returnMessage: '' },
  };
}

/** Uganda URA EFRIS system-to-system adapter (T109 invoice upload). */
export class EfrisAdapter implements FiscalInvoicePort {
  constructor(private http: IntegrationHttpService) {}
  async signInvoice(args: SignArgs): Promise<SignResult> {
    const body = efrisEnvelope(buildEfrisInvoice(args), 'T109');
    const r: any = await this.http.request({
      adapter: 'efris', operation: 'T109', url: joinUrl(env('EFRIS_BASE_URL', 'http://localhost:4100/efris'), env('EFRIS_PATH', '/efrisws/ws/taapp/getInformation')),
      body, idempotencyKey: `efris:${args.invoiceNumber}`, redact: (b: any) => ({ ...b, data: { ...b.data, signature: '***' } }),
    });
    if (r?.returnStateInfo?.returnCode !== '00') return { signed: false, raw: r };
    const c = r.data?.content ? JSON.parse(Buffer.from(r.data.content, 'base64').toString()) : {};
    return { signed: true, receiptNo: c.basicInformation?.invoiceNo, qr: c.summary?.qrCode, raw: { ...r, decoded: c } };
  }
}
