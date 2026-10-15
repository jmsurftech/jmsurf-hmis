import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { EmsController } from './ems.controller';
import { EmsService } from './ems.service';

@Module({ controllers: [EmsController], providers: [EmsService, SupportBillingService] })
export class EmsModule {}
