import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({ controllers: [ClinicsController], providers: [ClinicsService, SupportBillingService] })
export class ClinicsModule {}
