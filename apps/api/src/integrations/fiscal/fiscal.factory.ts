import { Injectable } from '@nestjs/common';
import { FiscalInvoicePort } from '../ports';
import { EtimsAdapter } from '../ke/etims/etims.adapter';
import { COUNTRY_PACKS } from '../country-packs';
import { IntegrationHttpService } from '../http-client';
import { CountryResolver } from '../country-resolver';
import { NoopFiscalAdapter } from './fiscal-skeletons';
import { EfrisAdapter } from './efris';
import { VfdAdapter } from './vfd';
import { EBM_CONFIG, VsdcAdapter, ZRA_CONFIG } from './vsdc';
import { EVatAdapter } from './evat';
import { FirsAdapter } from './firs';

/**
 * Fiscal invoice router, provided as FISCAL_INVOICE. Picks the adapter by tenant.countryCode
 * (from the integration context set via withTenant(..., countryCode)), falling back to FISCAL_DEFAULT_COUNTRY / KE.
 */
@Injectable()
export class FiscalInvoiceFactory implements FiscalInvoicePort {
  private readonly adapters: Record<string, FiscalInvoicePort>;
  constructor(etims: EtimsAdapter, http: IntegrationHttpService, private country: CountryResolver = new CountryResolver()) {
    this.adapters = {
      etims, efris: new EfrisAdapter(http), vfd: new VfdAdapter(http), ebm: new VsdcAdapter(http, EBM_CONFIG), evat: new EVatAdapter(http),
      zra: new VsdcAdapter(http, ZRA_CONFIG), firs: new FirsAdapter(http), none: new NoopFiscalAdapter(),
    };
  }

  forCountry(countryCode?: string): FiscalInvoicePort {
    const cc = (countryCode ?? process.env.FISCAL_DEFAULT_COUNTRY ?? 'KE').toUpperCase();
    const key = COUNTRY_PACKS[cc]?.fiscalAdapter ?? 'none';
    return this.adapters[key] ?? this.adapters.none;
  }

  async signInvoice(args: Parameters<FiscalInvoicePort['signInvoice']>[0]) {
    return this.forCountry(await this.country.current()).signInvoice(args);
  }
}
