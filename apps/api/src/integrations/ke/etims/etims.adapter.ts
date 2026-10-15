import { Injectable } from '@nestjs/common';
import { env, joinUrl } from '../../config';
import { IntegrationHttpService } from '../../http-client';
import { FiscalInvoicePort } from '../../ports';

/** KRA tax type codes used by eTIMS: A=exempt, B=16% standard, C=0% zero-rated, D=non-VAT, E=8%. */
export const etimsTaxType = (vatRate: number) => (vatRate >= 0.15 ? 'B' : vatRate >= 0.07 ? 'E' : vatRate > 0 ? 'B' : 'A');

/** Build the OSCU-style sales transaction payload (trnsSales/saveSales). Pure; exported for tests. */
export function buildEtimsSale(args: Parameters<FiscalInvoicePort['signInvoice']>[0], now = new Date()) {
  const dt = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const itemList = args.lines.map((l, i) => {
    const tot = (l.unitPriceMinor * l.quantity) / 100;
    const tax = l.vatRate > 0 ? (tot * l.vatRate) / (1 + l.vatRate) : 0;
    return {
      itemSeq: i + 1, itemCd: l.code ?? `ITEM${i + 1}`, itemClsCd: env('ETIMS_DEFAULT_ITEM_CLASS', '85121800'), itemNm: l.description,
      qty: l.quantity, prc: r2(l.unitPriceMinor / 100), splyAmt: r2(tot), dcRt: 0, dcAmt: 0,
      taxTyCd: etimsTaxType(l.vatRate), taxblAmt: r2(tot - tax), taxAmt: r2(tax), totAmt: r2(tot),
    };
  });
  const taxAmt = r2(itemList.reduce((a, i) => a + i.taxAmt, 0));
  return {
    tin: env('ETIMS_PIN'), bhfId: env('ETIMS_BRANCH_ID', '00'), invcNo: args.invoiceNumber, orgInvcNo: 0,
    custTin: args.buyerPin ?? null, salesTyCd: 'N', rcptTyCd: 'S', pmtTyCd: '01', salesSttsCd: '02',
    cfmDt: dt, salesDt: dt.slice(0, 8), totItemCnt: itemList.length,
    totTaxAmt: taxAmt, totAmt: r2(args.totalMinor / 100), totTaxblAmt: r2(args.totalMinor / 100 - taxAmt),
    itemList,
  };
}

/** KRA eTIMS OSCU (online sales control unit) adapter. */
@Injectable()
export class EtimsAdapter implements FiscalInvoicePort {
  constructor(private http: IntegrationHttpService) {}

  async signInvoice(args: Parameters<FiscalInvoicePort['signInvoice']>[0]) {
    const body = buildEtimsSale(args);
    const r: any = await this.http.request({
      adapter: 'etims', operation: 'saveSales',
      url: joinUrl(env('ETIMS_BASE_URL', 'http://localhost:4100/etims'), env('ETIMS_SALES_PATH', '/trnsSales/saveSales')),
      headers: { tin: body.tin, bhfId: body.bhfId, cmcKey: env('ETIMS_CMC_KEY', env('ETIMS_DEVICE_SERIAL')) },
      body, idempotencyKey: `etims:${args.invoiceNumber}`,
    });
    if (r?.resultCd && r.resultCd !== '000') return { signed: false, raw: r };
    const d = r?.data ?? {};
    const receiptNo = d.rcptNo != null ? `${d.sdcId ?? ''}/${d.rcptNo}` : undefined;
    const qr = d.qrUrl ?? (d.rcptSign ? `${env('ETIMS_QR_BASE', 'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=')}${body.tin}${body.bhfId}${d.rcptSign}` : undefined);
    return { signed: !!receiptNo, receiptNo, qr, raw: r };
  }
}
