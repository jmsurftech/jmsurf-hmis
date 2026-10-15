import { darajaTimestamp, normalizeMsisdn, parseC2B, parseStkCallback, stkPassword } from './mpesa.util';

describe('M-Pesa utils', () => {
  it('builds STK password as base64(shortcode+passkey+timestamp)', () => {
    const pw = stkPassword('174379', 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919', '20160216165627');
    expect(pw).toBe(Buffer.from('174379bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c91920160216165627').toString('base64'));
    expect(Buffer.from(pw, 'base64').toString()).toMatch(/^174379.*20160216165627$/);
  });
  it('formats timestamp in EAT', () => {
    expect(darajaTimestamp(new Date('2026-01-31T22:05:09Z'))).toBe('20260201010509');
  });
  it('normalises phone numbers', () => {
    expect(normalizeMsisdn('0712 345 678')).toBe('254712345678');
    expect(normalizeMsisdn('+254712345678')).toBe('254712345678');
    expect(normalizeMsisdn('712345678')).toBe('254712345678');
  });
  it('parses a successful STK callback', () => {
    const r = parseStkCallback({ Body: { stkCallback: {
      MerchantRequestID: 'm1', CheckoutRequestID: 'ws_CO_1', ResultCode: 0, ResultDesc: 'ok',
      CallbackMetadata: { Item: [{ Name: 'Amount', Value: 150.5 }, { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' }, { Name: 'TransactionDate', Value: 20191219102115 }, { Name: 'PhoneNumber', Value: 254708374149 }] },
    } } });
    expect(r).toMatchObject({ success: true, checkoutRequestId: 'ws_CO_1', amountMinor: 15050, mpesaReceiptNumber: 'NLJ7RT61SV', phone: '254708374149' });
  });
  it('parses a cancelled STK callback', () => {
    const r = parseStkCallback({ Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'c', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } });
    expect(r.success).toBe(false);
    expect(r.amountMinor).toBeUndefined();
  });
  it('rejects malformed callbacks', () => {
    expect(() => parseStkCallback({})).toThrow();
  });
  it('parses C2B confirmation', () => {
    const r = parseC2B({ TransactionType: 'Pay Bill', TransID: 'RKTQDM7W6S', TransTime: '20191122063845', TransAmount: '10', BusinessShortCode: '600638', BillRefNumber: ' INV-2026-000001 ', MSISDN: '2547...', FirstName: 'John', LastName: 'Doe' });
    expect(r).toMatchObject({ transId: 'RKTQDM7W6S', amountMinor: 1000, billRef: 'INV-2026-000001', shortCode: '600638', name: 'John Doe' });
  });
});
