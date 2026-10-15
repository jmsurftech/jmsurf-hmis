import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { OncologyController } from './oncology.controller';
import { OncologyService } from './oncology.service';

@Module({ controllers: [OncologyController], providers: [OncologyService, SupportBillingService] })
export class OncologyModule {}
