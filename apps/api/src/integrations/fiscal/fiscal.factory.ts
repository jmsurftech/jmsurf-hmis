import { Injectable } from '@nestjs/common';
import { FiscalInvoicePort } from '../ports';
import { EtimsAdapter } from '../ke/etims/etims.adapter';
import { COUNTRY_PACKS } from '../country-packs';
import { currentCountry } from './current-country';
import { EbmAdapter, EfrisAdapter, EVatAdapter, FirsAdapter, NoopFiscalAdapter, VfdAdapter, ZraSmartInvoiceAdapter } from './fiscal-skeletons';

/**
 * Fiscal invoice router, provided as FISCAL_INVOICE. Picks the adapter by tenant.countryCode
 * (from the integration context set via withTenant(..., countryCode)), falling back to FISCAL_DEFAULT_COUNTRY / KE.
 */
@Injectable()
export class FiscalInvoiceFactory implements FiscalInvoicePort {
  private readonly adapters: Record<string, FiscalInvoicePort>;
  constructor(etims: EtimsAdapter) {
    this.adapters = {
      etims, efris: new EfrisAdapter(), vfd: new VfdAdapter(), ebm: new EbmAdapter(), evat: new EVatAdapter(),
      zra: new ZraSmartInvoiceAdapter(), firs: new FirsAdapter(), none: new NoopFiscalAdapter(),
    };
  }

  forCountry(countryCode?: string): FiscalInvoicePort {
    const cc = (countryCode ?? process.env.FISCAL_DEFAULT_COUNTRY ?? 'KE').toUpperCase();
    const key = COUNTRY_PACKS[cc]?.fiscalAdapter ?? 'none';
    return this.adapters[key] ?? this.adapters.none;
  }

  signInvoice(args: Parameters<FiscalInvoicePort['signInvoice']>[0]) {
    return this.forCountry(currentCountry()).signInvoice(args);
  }
}
