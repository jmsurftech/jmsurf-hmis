import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationHttpService } from '../integrations/http-client';
import { PatientAuthGuard } from './patient-auth';
import { PortalService } from './portal.service';
import { TelemedicineService } from './telemedicine.service';
import { MessagingService } from './messaging.service';
import { UssdService } from './ussd.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { MetaCloudWhatsAppAdapter, MockWhatsAppAdapter, WHATSAPP } from './whatsapp.port';
import { MessagingController, PortalAuthController, PortalController, PublicFacilityController, TelemedicineController, UssdController } from './engagement.controller';

/** Patient engagement: portal/app API, telemedicine, reminders & USSD/WhatsApp, offline-sync idempotency. */
@Module({
  imports: [JwtModule.register({})],
  controllers: [PortalAuthController, PortalController, PublicFacilityController, TelemedicineController, MessagingController, UssdController],
  providers: [
    PatientAuthGuard, PortalService, TelemedicineService, MessagingService, UssdService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    {
      provide: WHATSAPP,
      inject: [IntegrationHttpService, PrismaService],
      useFactory: (http: IntegrationHttpService, prisma: PrismaService) =>
        (process.env.WHATSAPP_PROVIDER ?? 'mock') === 'meta' ? new MetaCloudWhatsAppAdapter(http, prisma) : new MockWhatsAppAdapter(prisma),
    },
  ],
  exports: [MessagingService, TelemedicineService],
})
export class EngagementModule {}
