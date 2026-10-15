import { Global, Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../backoffice/finance/finance.module';
import { BreakGlassController, BreakGlassService } from './break-glass';
import { DataSubjectController, DataSubjectService } from './data-subject';
import { SubscriptionController, SubscriptionService } from './subscription.service';
import { SuperAdminController, SuperAdminService } from './superadmin';
import { CsvImportController, CsvImportService } from './csv-import';

/** Platform concerns: security (break-glass, data-subject requests), SaaS console, subscriptions, CSV migration. */
@Global()
@Module({
  imports: [IntegrationsModule, AuthModule, FinanceModule],
  providers: [BreakGlassService, DataSubjectService, SubscriptionService, SuperAdminService, CsvImportService],
  controllers: [BreakGlassController, DataSubjectController, SubscriptionController, SuperAdminController, CsvImportController],
  exports: [BreakGlassService, SubscriptionService],
})
export class PlatformModule {}
