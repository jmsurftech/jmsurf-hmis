import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PricingModule } from './pricing/pricing.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { PayersModule } from './payers/payers.module';
import { ClaimsModule } from './claims/claims.module';

// Aggregator module: import every revenue sub-module here.
@Module({ imports: [IntegrationsModule, PricingModule, BillingModule, PaymentsModule, PayersModule, ClaimsModule] })
export class RevenueModule {}
