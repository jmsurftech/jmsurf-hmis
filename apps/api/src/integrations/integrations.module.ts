import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationHttpService } from './http-client';
import { FISCAL_INVOICE, MOBILE_MONEY, NATIONAL_INSURANCE, SMS } from './ports';
import { ShaHieAdapter } from './ke/sha-hie/sha-hie.adapter';
import { MpesaDarajaAdapter } from './ke/mpesa/mpesa.adapter';
import { EtimsAdapter } from './ke/etims/etims.adapter';
import { FiscalInvoiceFactory } from './fiscal/fiscal.factory';
import { AfricasTalkingSmsAdapter, MockSmsAdapter } from './sms/sms.adapters';
import { CountryResolver } from './country-resolver';
import { MobileMoneyRouter, NationalInsuranceRouter } from './africa/routers';

/** Provides every integration port globally. Adapter choice is driven by env / tenant country pack. */
@Global()
@Module({
  providers: [
    IntegrationHttpService, ShaHieAdapter, MpesaDarajaAdapter, EtimsAdapter, FiscalInvoiceFactory, CountryResolver, NationalInsuranceRouter, MobileMoneyRouter,
    { provide: NATIONAL_INSURANCE, useExisting: NationalInsuranceRouter }, // by tenant.countryCode: KE SHA, TZ NHIF, GH NHIA
    { provide: MOBILE_MONEY, useExisting: MobileMoneyRouter }, // KE M-Pesa, UG/RW/GH/ZM MTN MoMo, TZ Airtel
    { provide: FISCAL_INVOICE, useExisting: FiscalInvoiceFactory },
    {
      provide: SMS,
      inject: [IntegrationHttpService, PrismaService],
      useFactory: (http: IntegrationHttpService, prisma: PrismaService) =>
        (process.env.SMS_PROVIDER ?? 'mock') === 'africastalking' ? new AfricasTalkingSmsAdapter(http, prisma) : new MockSmsAdapter(prisma),
    },
  ],
  exports: [NATIONAL_INSURANCE, MOBILE_MONEY, FISCAL_INVOICE, SMS, IntegrationHttpService, FiscalInvoiceFactory, ShaHieAdapter, CountryResolver],
})
export class IntegrationsModule {}
