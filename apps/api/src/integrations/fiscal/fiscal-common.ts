import { createHmac } from 'crypto';
import { FiscalInvoicePort } from '../ports';

export type SignArgs = Parameters<FiscalInvoicePort['signInvoice']>[0];
export type SignResult = Awaited<ReturnType<FiscalInvoicePort['signInvoice']>>;

export const r2 = (n: number) => Math.round(n * 100) / 100;
/** Split a VAT-inclusive line into net / tax / gross (major units). */
export function splitLine(l: SignArgs['lines'][number]) {
  const gross = (l.unitPriceMinor * l.quantity) / 100;
  const tax = l.vatRate > 0 ? (gross * l.vatRate) / (1 + l.vatRate) : 0;
  return { gross: r2(gross), tax: r2(tax), net: r2(gross - tax), unit: r2(l.unitPriceMinor / 100) };
}
export const ymdhms = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
export const isoLocal = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
/** HMAC placeholder signature: production must use the authority-issued key/cert (see docs/integrations/ASSUMPTIONS.md). */
export const hmacSign = (data: string, key: string) => createHmac('sha256', key || 'sandbox').update(data).digest('base64');
