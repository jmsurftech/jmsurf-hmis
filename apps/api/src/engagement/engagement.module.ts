import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationHttpService } from '../integrations/http-client';
import { MessagingService } from './messaging.service';
import { UssdService } from './ussd.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { MetaCloudWhatsAppAdapter, MockWhatsAppAdapter, WHATSAPP } from './whatsapp.port';
import { MessagingController, UssdController } from './engagement.controller';

/** Patient engagement extras: reminders (SMS/WhatsApp, EN/SW), USSD, and offline-sync idempotency. */
@Module({
  controllers: [MessagingController, UssdController],
  providers: [
    MessagingService, UssdService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    {
      provide: WHATSAPP,
      inject: [IntegrationHttpService, PrismaService],
      useFactory: (http: IntegrationHttpService, prisma: PrismaService) =>
        (process.env.WHATSAPP_PROVIDER ?? 'mock') === 'meta' ? new MetaCloudWhatsAppAdapter(http, prisma) : new MockWhatsAppAdapter(prisma),
    },
  ],
  exports: [MessagingService],
})
export class EngagementModule {}
