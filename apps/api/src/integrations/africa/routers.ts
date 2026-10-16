import { Injectable } from '@nestjs/common';
import { IntegrationHttpService } from '../http-client';
import { MobileMoneyPort, NationalInsurancePort } from '../ports';
import { CountryResolver } from '../country-resolver';
import { ShaHieAdapter } from '../ke/sha-hie/sha-hie.adapter';
import { MpesaDarajaAdapter } from '../ke/mpesa/mpesa.adapter';
import { NhifTzAdapter } from './nhif-tz';
import { NhiaGhAdapter } from './nhia-gh';
import { AirtelMoneyAdapter, MtnMomoAdapter } from './mobile-money';

const def = () => (process.env.INTEGRATIONS_DEFAULT_COUNTRY ?? 'KE').toUpperCase();

/** NATIONAL_INSURANCE router: KE → SHA/HIE, TZ → NHIF, GH → NHIA; others fall back to SHA (sandbox) until an adapter exists. */
@Injectable()
export class NationalInsuranceRouter implements NationalInsurancePort {
  private readonly byCountry: Record<string, NationalInsurancePort>;
  constructor(private sha: ShaHieAdapter, http: IntegrationHttpService, private country: CountryResolver) {
    this.byCountry = { KE: sha, TZ: new NhifTzAdapter(http), GH: new NhiaGhAdapter(http) };
  }
  forCountry(cc?: string) { return this.byCountry[(cc ?? def()).toUpperCase()] ?? this.sha; }
  private async a() { return this.forCountry(await this.country.current()); }
  async lookupClient(t: string, n: string) { return (await this.a()).lookupClient(t, n); }
  async checkEligibility(x: Parameters<NationalInsurancePort['checkEligibility']>[0]) { return (await this.a()).checkEligibility(x); }
  async requestPreAuth(x: Parameters<NationalInsurancePort['requestPreAuth']>[0]) { return (await this.a()).requestPreAuth(x); }
  async submitClaim(b: unknown) { return (await this.a()).submitClaim(b); }
  async claimStatus(r: string) { return (await this.a()).claimStatus(r); }
}

/** MOBILE_MONEY router: KE → M-Pesa; UG/RW/GH/ZM → MTN MoMo; TZ → Airtel. Override per country with MOBILE_MONEY_PROVIDER_<CC>=mpesa|mtn|airtel. */
@Injectable()
export class MobileMoneyRouter implements MobileMoneyPort {
  private readonly providers: Record<string, MobileMoneyPort>;
  constructor(mpesa: MpesaDarajaAdapter, http: IntegrationHttpService, private country: CountryResolver) {
    const cc = async () => (await this.country.current()) ?? def();
    this.providers = { mpesa, mtn: new MtnMomoAdapter(http, cc), airtel: new AirtelMoneyAdapter(http, cc) };
  }
  static providerFor(cc: string) {
    const o = process.env[`MOBILE_MONEY_PROVIDER_${cc}`];
    if (o) return o;
    return cc === 'KE' ? 'mpesa' : cc === 'TZ' ? 'airtel' : ['UG', 'RW', 'GH', 'ZM'].includes(cc) ? 'mtn' : 'mpesa';
  }
  async stkPush(a: Parameters<MobileMoneyPort['stkPush']>[0]) {
    const cc = (await this.country.current()) ?? def();
    return (this.providers[MobileMoneyRouter.providerFor(cc)] ?? this.providers.mpesa).stkPush(a);
  }
}
