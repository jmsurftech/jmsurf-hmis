import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { FinanceModule } from './finance/finance.module';
import { HrModule } from './hr/hr.module';
import { AssetsModule } from './assets/assets.module';
import { ReportsModule } from './reports/reports.module';
import { QualityModule } from './quality/quality.module';

// Aggregator module: import every backoffice sub-module here.
@Module({ imports: [AdminModule, FinanceModule, HrModule, AssetsModule, ReportsModule, QualityModule] })
export class BackOfficeModule {}
