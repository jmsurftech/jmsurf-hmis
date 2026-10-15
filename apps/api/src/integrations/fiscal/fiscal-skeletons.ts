import { NotImplementedException } from '@nestjs/common';
import { FiscalInvoicePort } from '../ports';

/**
 * Skeleton fiscal adapters for other African e-invoicing regimes. Each implements FiscalInvoicePort and throws until built.
 * TODO markers carry the authority docs to implement against.
 */
abstract class FiscalSkeleton implements FiscalInvoicePort {
  abstract readonly regime: string;
  abstract readonly country: string;
  abstract readonly docs: string;
  async signInvoice(_args: Parameters<FiscalInvoicePort['signInvoice']>[0]): Promise<{ signed: boolean; receiptNo?: string; qr?: string; raw?: unknown }> {
    throw new NotImplementedException(`${this.regime} (${this.country}) fiscal adapter not implemented yet. TODO: implement per ${this.docs}`);
  }
}

/** TODO(UG): URA EFRIS — system-to-system API (T109 upload invoice), AES/RSA signed envelope. https://efris.ura.go.ug */
export class EfrisAdapter extends FiscalSkeleton { regime = 'URA EFRIS'; country = 'UG'; docs = 'https://efris.ura.go.ug (EFRIS System-to-System Interface Design)'; }
/** TODO(TZ): TRA VFD/EFD — virtual fiscal device registration + receipt posting (XML, signed). https://www.tra.go.tz */
export class VfdAdapter extends FiscalSkeleton { regime = 'TRA VFD'; country = 'TZ'; docs = 'https://www.tra.go.tz (VFD API specification)'; }
/** TODO(RW): RRA EBM v2 — VSDC/OSDC API, same family as KRA eTIMS. https://www.rra.gov.rw */
export class EbmAdapter extends FiscalSkeleton { regime = 'RRA EBM'; country = 'RW'; docs = 'https://www.rra.gov.rw (EBM 2.1 VSDC specification)'; }
/** TODO(GH): GRA E-VAT — invoice signing API via accredited provider. https://gra.gov.gh/e-vat/ */
export class EVatAdapter extends FiscalSkeleton { regime = 'GRA E-VAT'; country = 'GH'; docs = 'https://gra.gov.gh/e-vat/'; }
/** TODO(ZM): ZRA Smart Invoice — VSDC API (eTIMS family). https://www.zra.org.zm/smart-invoice/ */
export class ZraSmartInvoiceAdapter extends FiscalSkeleton { regime = 'ZRA Smart Invoice'; country = 'ZM'; docs = 'https://www.zra.org.zm (Smart Invoice VSDC API)'; }
/** TODO(NG): FIRS e-Invoicing (MBS) — invoice reference number + QR via access point provider. https://einvoice.firs.gov.ng */
export class FirsAdapter extends FiscalSkeleton { regime = 'FIRS e-Invoice'; country = 'NG'; docs = 'https://einvoice.firs.gov.ng'; }

/** No fiscal regime configured: return unsigned (invoice still valid internally). */
export class NoopFiscalAdapter implements FiscalInvoicePort {
  async signInvoice() { return { signed: false }; }
}
