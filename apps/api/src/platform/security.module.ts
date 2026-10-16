import { Global, Module } from '@nestjs/common';
import { FinanceModule } from '../backoffice/finance/finance.module';
import { BreakGlassController, BreakGlassService } from './break-glass';
import { DataSubjectController, DataSubjectService } from './data-subject';
import { CsvImportController, CsvImportService } from './csv-import';

/** Security and data-governance: break-glass access, data-subject requests (Kenya DPA), CSV migration wizard. */
@Global()
@Module({
  imports: [FinanceModule],
  providers: [BreakGlassService, DataSubjectService, CsvImportService],
  controllers: [BreakGlassController, DataSubjectController, CsvImportController],
  exports: [BreakGlassService],
})
export class SecurityModule {}
