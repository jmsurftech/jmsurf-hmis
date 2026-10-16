import { FiscalInvoiceFactory } from './fiscal.factory';
import { withTenant } from '../integration-context';
import { buildEtimsSale, etimsTaxType } from '../ke/etims/etims.adapter';
import { buildEfrisInvoice, efrisEnvelope, EfrisAdapter } from './efris';
import { buildVfdReceipt, VfdAdapter, vfdTaxCode } from './vfd';
import { buildVsdcSale, EBM_CONFIG, VsdcAdapter, ZRA_CONFIG } from './vsdc';
import { buildEvatInvoice, EVatAdapter, ghBreakdown } from './evat';
import { buildFirsInvoice, FirsAdapter, firsIrn } from './firs';
import { CountryResolver } from '../country-resolver';

const now = new Date('2026-10-15T09:30:00Z');
// 118.00 VAT-inclusive drug @18% + 2 x 25.00 exempt consultation
const args = { invoiceNumber: 'INV-0042', totalMinor: 11800 + 5000, lines: [
  { code: 'DRG1', description: 'Amoxicillin 500mg', quantity: 1, unitPriceMinor: 11800, vatRate: 0.18 },
  { code: 'CON1', description: 'Consultation', quantity: 2, unitPriceMinor: 2500, vatRate: 0 },
] };

describe('FiscalInvoiceFactory routing', () => {
  const etims = { signInvoice: jest.fn().mockResolvedValue({ signed: true, receiptNo: 'X/1' }) } as any;
  const f = new FiscalInvoiceFactory(etims, {} as any, new CountryResolver());
  it('routes KE to eTIMS', async () => {
    await expect(withTenant('t', () => f.signInvoice({ ...args, lines: [], totalMinor: 0 }), 'KE')).resolves.toMatchObject({ signed: true });
  });
  it.each([['UG', EfrisAdapter], ['TZ', VfdAdapter], ['RW', VsdcAdapter], ['GH', EVatAdapter], ['ZM', VsdcAdapter], ['NG', FirsAdapter]])('%s has a real adapter', (cc, cls) => {
    expect(f.forCountry(cc)).toBeInstanceOf(cls);
  });
  it('ZA has no fiscal regime → unsigned', async () => {
    await expect(f.forCountry('ZA').signInvoice(args)).resolves.toEqual({ signed: false });
  });
});

describe('eTIMS payload', () => {
  it('computes inclusive VAT per line and tax type', () => {
    const p = buildEtimsSale({ invoiceNumber: 'INV-9', totalMinor: 11600 + 5000, lines: [
      { description: 'Drug', quantity: 1, unitPriceMinor: 11600, vatRate: 0.16 },
      { description: 'Consult', quantity: 2, unitPriceMinor: 2500, vatRate: 0 },
    ] });
    expect(p.itemList[0]).toMatchObject({ taxTyCd: 'B', taxAmt: 16, taxblAmt: 100, totAmt: 116 });
    expect(p.itemList[1]).toMatchObject({ taxTyCd: 'A', taxAmt: 0, totAmt: 50 });
    expect(p.totTaxAmt).toBe(16);
    expect(etimsTaxType(0.08)).toBe('E');
  });
});

describe('URA EFRIS (UG)', () => {
  it('builds T109 content with tax categories and summary', () => {
    const c = buildEfrisInvoice(args, now);
    expect(c.basicInformation).toMatchObject({ currency: 'UGX', invoiceType: '1', issuedDate: '2026-10-15 09:30:00' });
    expect(c.goodsDetails[0]).toMatchObject({ itemCode: 'DRG1', total: '118.00', tax: '18.00', taxRate: '0.18' });
    expect(c.taxDetails).toEqual([
      { taxCategoryCode: '01', netAmount: '100.00', taxRate: '0.18', taxAmount: '18.00', grossAmount: '118.00' },
      { taxCategoryCode: '03', netAmount: '50.00', taxRate: '0.00', taxAmount: '0.00', grossAmount: '50.00' },
    ]);
    expect(c.summary).toMatchObject({ netAmount: '150.00', taxAmount: '18.00', grossAmount: '168.00', itemCount: '2' });
  });
  it('wraps content in a base64 envelope with interface code', () => {
    const e = efrisEnvelope({ a: 1 }, 'T109', now, 'abc-def');
    expect(JSON.parse(Buffer.from(e.data.content, 'base64').toString())).toEqual({ a: 1 });
    expect(e.globalInfo).toMatchObject({ interfaceCode: 'T109', appId: 'AP04', dataExchangeId: 'abcdef' });
    expect(e.data.signature).toBeTruthy();
  });
});

describe('TRA VFD (TZ)', () => {
  it('builds signed RCT XML with tax codes, totals and VAT totals', () => {
    const r = buildVfdReceipt(args, { gc: 7, dc: 3, rctNum: 3 }, now);
    expect(vfdTaxCode(0.18)).toBe(1);
    expect(vfdTaxCode(0)).toBe(5);
    expect(r.xml).toContain('<ITEM><ID>DRG1</ID><DESC>Amoxicillin 500mg</DESC><QTY>1</QTY><TAXCODE>1</TAXCODE><AMT>118.00</AMT></ITEM>');
    expect(r.xml).toContain('<TOTALS><TOTALTAXEXCL>150.00</TOTALTAXEXCL><TOTALTAXINCL>168.00</TOTALTAXINCL>');
    expect(r.xml).toContain('<VATRATE>A</VATRATE><NETTAMOUNT>100.00</NETTAMOUNT><TAXAMOUNT>18.00</TAXAMOUNT>');
    expect(r.xml).toContain('<GC>7</GC>');
    expect(r.xml).toMatch(/<EFDMSSIGNATURE>.+<\/EFDMSSIGNATURE><\/EFDMS>$/);
    expect(r.verifyUrl).toMatch(/_093000$/);
  });
});

describe('VSDC family: RRA EBM (RW) and ZRA Smart Invoice (ZM)', () => {
  it('EBM uses B for 18% and A for exempt, RWF currency', () => {
    const p = buildVsdcSale(args, EBM_CONFIG, now);
    expect(p.currencyTyCd).toBe('RWF');
    expect(p.itemList.map((i) => i.taxTyCd)).toEqual(['B', 'A']);
    expect(p).toMatchObject({ totAmt: 168, totTaxAmt: 18, totTaxblAmt: 150, salesDt: '20261015' });
    expect(p.taxSummary).toEqual([{ taxTyCd: 'B', taxblAmt: 100, taxAmt: 18 }, { taxTyCd: 'A', taxblAmt: 50, taxAmt: 0 }]);
  });
  it('ZRA uses A for standard and D for exempt', () => {
    const p = buildVsdcSale(args, ZRA_CONFIG, now);
    expect(p.currencyTyCd).toBe('ZMW');
    expect(p.itemList.map((i) => i.taxTyCd)).toEqual(['A', 'D']);
  });
});

describe('GRA E-VAT (GH)', () => {
  const lv = { nhil: 0.025, getfund: 0.025, covid: 0.01, vat: 0.15, vatOnLevies: true };
  it('back-calculates levies and VAT (compound, pre-reform)', () => {
    const b = ghBreakdown(121.9, true, lv); // 100 base → levies 6 → VAT 15.9
    expect(b).toEqual({ base: 100, nhil: 2.5, getfund: 2.5, covid: 1, vat: 15.9 });
    expect(ghBreakdown(50, false, lv)).toEqual({ base: 50, nhil: 0, getfund: 0, covid: 0, vat: 0 });
  });
  it('builds an INCLUSIVE invoice (post-reform defaults: no COVID levy, VAT not on levies)', () => {
    const p = buildEvatInvoice({ ...args, totalMinor: 12000 + 5000, lines: [{ ...args.lines[0], unitPriceMinor: 12000, vatRate: 0.15 }, args.lines[1]] }, now,
      { nhil: 0.025, getfund: 0.025, covid: 0, vat: 0.15, vatOnLevies: false });
    expect(p).toMatchObject({ currency: 'GHS', calculationType: 'INCLUSIVE', totalAmount: 170, totalVat: 15, totalLevy: 5, flag: 'INVOICE' });
    expect(p.items[0]).toMatchObject({ levyAmountA: 2.5, levyAmountB: 2.5, levyAmountC: 0, unitPrice: 120 });
    expect(p.items[1]).toMatchObject({ itemCategory: 'EXM', levyAmountA: 0 });
  });
});

describe('FIRS e-Invoicing (NG)', () => {
  it('builds IRN and UBL-style totals', () => {
    expect(firsIrn('INV-0042', 'SRV1', now)).toBe('INV0042-SRV1-20261015');
    const p = buildFirsInvoice({ ...args, totalMinor: 10750 + 5000, lines: [{ ...args.lines[0], unitPriceMinor: 10750, vatRate: 0.075 }, args.lines[1]] }, now);
    expect(p.invoice_type_code).toBe('380');
    expect(p.legal_monetary_total).toEqual({ line_extension_amount: 150, tax_exclusive_amount: 150, tax_inclusive_amount: 157.5, payable_amount: 157.5 });
    expect(p.tax_total[0].tax_subtotal).toEqual([
      { taxable_amount: 100, tax_amount: 7.5, tax_category: { id: 'STANDARD_VAT', percent: 7.5 } },
      { taxable_amount: 50, tax_amount: 0, tax_category: { id: 'EXEMPTED', percent: 0 } },
    ]);
    expect(p.invoice_line[1]).toMatchObject({ invoiced_quantity: 2, line_extension_amount: 50, price: { price_amount: 25 } });
  });
});
