import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { RehabController } from './rehab.controller';
import { RehabService } from './rehab.service';

@Module({ controllers: [RehabController], providers: [RehabService, SupportBillingService] })
export class RehabModule {}
