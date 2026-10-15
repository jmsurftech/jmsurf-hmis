import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { BloodBankController } from './bloodbank.controller';
import { BloodBankService } from './bloodbank.service';

@Module({ controllers: [BloodBankController], providers: [BloodBankService, SupportBillingService] })
export class BloodBankModule {}
