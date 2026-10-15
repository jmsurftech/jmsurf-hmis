/** Pure M-Pesa Daraja helpers (unit tested). */

/** Daraja timestamp: YYYYMMDDHHmmss in East Africa Time (UTC+3). */
export function darajaTimestamp(d = new Date()): string {
  const eat = new Date(d.getTime() + 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`;
}

/** STK push password = base64(shortcode + passkey + timestamp). */
export const stkPassword = (shortcode: string, passkey: string, timestamp: string) =>
  Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

/** Normalise Kenyan phone numbers to 2547XXXXXXXX / 2541XXXXXXXX. */
export function normalizeMsisdn(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('254')) return d;
  if (d.startsWith('0')) return `254${d.slice(1)}`;
  if (d.length === 9) return `254${d}`;
  return d;
}

export interface StkCallbackResult {
  merchantRequestId: string; checkoutRequestId: string; resultCode: number; resultDesc: string; success: boolean;
  amountMinor?: number; mpesaReceiptNumber?: string; phone?: string; transactionDate?: string;
}

/** Parse the STK push result callback: { Body: { stkCallback: { ..., CallbackMetadata: { Item: [{Name, Value}] } } } } */
export function parseStkCallback(payload: any): StkCallbackResult {
  const cb = payload?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) throw new Error('Invalid STK callback payload');
  const items: { Name: string; Value?: any }[] = cb.CallbackMetadata?.Item ?? [];
  const get = (n: string) => items.find((i) => i.Name === n)?.Value;
  const amount = get('Amount');
  const resultCode = Number(cb.ResultCode);
  return {
    merchantRequestId: cb.MerchantRequestID, checkoutRequestId: cb.CheckoutRequestID, resultCode, resultDesc: cb.ResultDesc,
    success: resultCode === 0,
    amountMinor: amount != null ? Math.round(Number(amount) * 100) : undefined,
    mpesaReceiptNumber: get('MpesaReceiptNumber'),
    phone: get('PhoneNumber') != null ? String(get('PhoneNumber')) : undefined,
    transactionDate: get('TransactionDate') != null ? String(get('TransactionDate')) : undefined,
  };
}

export interface C2BNotification {
  transactionType: string; transId: string; transTime: string; amountMinor: number; shortCode: string;
  billRef: string; invoiceNumber?: string; msisdn: string; name: string; orgBalance?: string;
}

/** Parse C2B validation/confirmation payloads (Paybill / Till). */
export function parseC2B(p: any): C2BNotification {
  if (!p?.TransID || p?.TransAmount == null) throw new Error('Invalid C2B payload');
  return {
    transactionType: p.TransactionType, transId: p.TransID, transTime: p.TransTime,
    amountMinor: Math.round(Number(p.TransAmount) * 100), shortCode: String(p.BusinessShortCode ?? ''),
    billRef: String(p.BillRefNumber ?? '').trim(), invoiceNumber: p.InvoiceNumber || undefined,
    msisdn: String(p.MSISDN ?? ''), name: [p.FirstName, p.MiddleName, p.LastName].filter(Boolean).join(' '),
    orgBalance: p.OrgAccountBalance,
  };
}

/** C2B validation response codes per Daraja: 0 accept, C2B00012 invalid account number, C2B00013 invalid amount. */
export const c2bAccept = () => ({ ResultCode: '0', ResultDesc: 'Accepted' });
export const c2bReject = (code: 'C2B00012' | 'C2B00013' | 'C2B00016' = 'C2B00012', desc = 'Rejected') => ({ ResultCode: code, ResultDesc: desc });
