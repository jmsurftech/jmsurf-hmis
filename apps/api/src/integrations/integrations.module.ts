import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationHttpService } from './http-client';
import { FISCAL_INVOICE, MOBILE_MONEY, NATIONAL_INSURANCE, SMS } from './ports';
import { ShaHieAdapter } from './ke/sha-hie/sha-hie.adapter';
import { MpesaDarajaAdapter } from './ke/mpesa/mpesa.adapter';
import { EtimsAdapter } from './ke/etims/etims.adapter';
import { FiscalInvoiceFactory } from './fiscal/fiscal.factory';
import { AfricasTalkingSmsAdapter, MockSmsAdapter } from './sms/sms.adapters';

/** Provides every integration port globally. Adapter choice is driven by env / tenant country pack. */
@Global()
@Module({
  providers: [
    IntegrationHttpService, ShaHieAdapter, MpesaDarajaAdapter, EtimsAdapter, FiscalInvoiceFactory,
    { provide: NATIONAL_INSURANCE, useExisting: ShaHieAdapter },
    { provide: MOBILE_MONEY, useExisting: MpesaDarajaAdapter },
    { provide: FISCAL_INVOICE, useExisting: FiscalInvoiceFactory },
    {
      provide: SMS,
      inject: [IntegrationHttpService, PrismaService],
      useFactory: (http: IntegrationHttpService, prisma: PrismaService) =>
        (process.env.SMS_PROVIDER ?? 'mock') === 'africastalking' ? new AfricasTalkingSmsAdapter(http, prisma) : new MockSmsAdapter(prisma),
    },
  ],
  exports: [NATIONAL_INSURANCE, MOBILE_MONEY, FISCAL_INVOICE, SMS, IntegrationHttpService, FiscalInvoiceFactory, ShaHieAdapter],
})
export class IntegrationsModule {}
