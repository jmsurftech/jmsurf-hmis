import { Module } from '@nestjs/common';
import { SupportBillingService } from '../support-common/support-billing.service';
import { CssdController } from './cssd.controller';
import { CssdService } from './cssd.service';

@Module({ controllers: [CssdController], providers: [CssdService, SupportBillingService] })
export class CssdModule {}
