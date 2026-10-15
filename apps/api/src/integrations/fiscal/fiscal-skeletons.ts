import { FiscalInvoicePort } from '../ports';

/** No fiscal regime configured: return unsigned (invoice still valid internally). */
export class NoopFiscalAdapter implements FiscalInvoicePort {
  async signInvoice() { return { signed: false }; }
}
