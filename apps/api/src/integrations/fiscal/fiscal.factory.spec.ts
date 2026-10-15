import { NotImplementedException } from '@nestjs/common';
import { FiscalInvoiceFactory } from './fiscal.factory';
import { withTenant } from '../integration-context';
import { buildEtimsSale, etimsTaxType } from '../ke/etims/etims.adapter';

describe('FiscalInvoiceFactory', () => {
  const etims = { signInvoice: jest.fn().mockResolvedValue({ signed: true, receiptNo: 'X/1' }) } as any;
  const f = new FiscalInvoiceFactory(etims);
  const args = { invoiceNumber: 'INV-1', lines: [], totalMinor: 0 };

  it('routes KE to eTIMS', async () => {
    await expect(withTenant('t', () => f.signInvoice(args), 'KE')).resolves.toMatchObject({ signed: true });
  });
  it('UG skeleton throws NotImplemented', async () => {
    await expect(withTenant('t', () => f.signInvoice(args), 'UG')).rejects.toBeInstanceOf(NotImplementedException);
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
