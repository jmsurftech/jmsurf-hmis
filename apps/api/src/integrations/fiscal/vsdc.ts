import { env, joinUrl } from '../config';
import { IntegrationHttpService } from '../http-client';
import { FiscalInvoicePort } from '../ports';
import { r2, splitLine, SignArgs, SignResult, ymdhms } from './fiscal-common';

/**
 * VSDC/OSCU family (same data model as KRA eTIMS): RRA EBM v2 (Rwanda) and ZRA Smart Invoice (Zambia).
 * Tax type codes differ per authority, so they are passed in via config.
 */
export interface VsdcConfig { adapter: 'ebm' | 'zra'; envPrefix: 'EBM' | 'ZRA'; taxType: (rate: number) => string; defaultBase: string; currency: string }

/** RRA EBM: A=exempt, B=18% standard, C=zero-rated (export), D=non-VAT. */
export const ebmTaxType = (rate: number) => (rate > 0 ? 'B' : 'A');
/** ZRA Smart Invoice: A=16% standard, C2=zero-rated local, D=exempt. */
export const zraTaxType = (rate: number) => (rate > 0 ? 'A' : 'D');

export const EBM_CONFIG: VsdcConfig = { adapter: 'ebm', envPrefix: 'EBM', taxType: ebmTaxType, defaultBase: 'http://localhost:4100/ebm', currency: 'RWF' };
export const ZRA_CONFIG: VsdcConfig = { adapter: 'zra', envPrefix: 'ZRA', taxType: zraTaxType, defaultBase: 'http://localhost:4100/zra', currency: 'ZMW' };

/** Pure VSDC sales payload (trnsSales/saveSales). */
export function buildVsdcSale(a: SignArgs, cfg: VsdcConfig, now = new Date()) {
  const dt = ymdhms(now);
  const p = cfg.envPrefix;
  const itemList = a.lines.map((l, i) => {
    const s = splitLine(l);
    return {
      itemSeq: i + 1, itemCd: l.code ?? `ITEM${i + 1}`, itemClsCd: env(`${p}_DEFAULT_ITEM_CLASS`, '85121800'), itemNm: l.description,
      qtyUnitCd: 'U', pkgUnitCd: 'NT', qty: l.quantity, prc: s.unit, splyAmt: s.gross, dcRt: 0, dcAmt: 0,
      taxTyCd: cfg.taxType(l.vatRate), taxblAmt: s.net, taxAmt: s.tax, totAmt: s.gross,
    };
  });
  const totTaxAmt = r2(itemList.reduce((t, i) => t + i.taxAmt, 0));
  const totAmt = r2(a.totalMinor / 100);
  const byType = (k: 'taxblAmt' | 'taxAmt', code: string) => r2(itemList.filter((i) => i.taxTyCd === code).reduce((t, i) => t + i[k], 0));
  const codes = [...new Set(itemList.map((i) => i.taxTyCd))];
  return {
    tin: env(`${p}_TIN`), bhfId: env(`${p}_BRANCH_ID`, '00'), invcNo: a.invoiceNumber, orgInvcNo: 0, custTin: a.buyerPin ?? null,
    salesTyCd: 'N', rcptTyCd: 'S', pmtTyCd: '01', salesSttsCd: '02', cfmDt: dt, salesDt: dt.slice(0, 8), currencyTyCd: cfg.currency,
    totItemCnt: itemList.length, totTaxblAmt: r2(totAmt - totTaxAmt), totTaxAmt, totAmt,
    taxSummary: codes.map((c) => ({ taxTyCd: c, taxblAmt: byType('taxblAmt', c), taxAmt: byType('taxAmt', c) })),
    receipt: { rptNo: 1, trdeNm: env(`${p}_TRADE_NAME`, ''), adrs: '', topMsg: '', btmMsg: 'Thank you', prchrAcptcYn: 'N' },
    itemList,
  };
}

export class VsdcAdapter implements FiscalInvoicePort {
  constructor(private http: IntegrationHttpService, private cfg: VsdcConfig) {}
  async signInvoice(args: SignArgs): Promise<SignResult> {
    const p = this.cfg.envPrefix;
    const body = buildVsdcSale(args, this.cfg);
    const r: any = await this.http.request({
      adapter: this.cfg.adapter, operation: 'saveSales', url: joinUrl(env(`${p}_BASE_URL`, this.cfg.defaultBase), env(`${p}_SALES_PATH`, '/trnsSales/saveSales')),
      headers: { tin: body.tin, bhfId: body.bhfId, cmcKey: env(`${p}_CMC_KEY`) }, body, idempotencyKey: `${this.cfg.adapter}:${args.invoiceNumber}`,
    });
    if (r?.resultCd !== '000') return { signed: false, raw: r };
    const d = r.data ?? {};
    return { signed: true, receiptNo: `${d.sdcId ?? ''}/${d.rcptNo}`, qr: d.qrUrl ?? (d.rcptSign ? `${body.tin}${body.bhfId}${d.rcptSign}` : undefined), raw: r };
  }
}
