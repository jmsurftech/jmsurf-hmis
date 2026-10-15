import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { MortuaryController } from './mortuary.controller';
import { MortuaryService } from './mortuary.service';

@Module({ controllers: [MortuaryController], providers: [MortuaryService, SupportBillingService] })
export class MortuaryModule {}
