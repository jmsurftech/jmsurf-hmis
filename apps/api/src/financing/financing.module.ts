import { Module } from '@nestjs/common';
import { FinancingController, PartnerApiController } from './financing.controller';
import { FinancingService } from './financing.service';

@Module({ controllers: [FinancingController, PartnerApiController], providers: [FinancingService] })
export class FinancingModule {}
