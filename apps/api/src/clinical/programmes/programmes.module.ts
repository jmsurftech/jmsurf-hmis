import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { ProgrammesController } from './programmes.controller';
import { ProgrammesService } from './programmes.service';

@Module({ controllers: [ProgrammesController], providers: [ProgrammesService, SupportBillingService] })
export class ProgrammesModule {}
