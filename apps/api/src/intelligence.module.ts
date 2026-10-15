import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { LabAnalyzersModule } from './integrations/lab-analyzers/lab-analyzers.module';
import { PacsController } from './integrations/pacs/pacs.controller';
import { AnalyzerService } from './integrations/lab-analyzers/analyzer.service';
import { FinancingModule } from './financing/financing.module';

// Aggregator: AI assistance, device interfacing (lab analysers, PACS worklist) and embedded finance (roadmap 4, 6, 9).
@Module({ imports: [AiModule, LabAnalyzersModule, FinancingModule], controllers: [PacsController], providers: [AnalyzerService] })
export class IntelligenceModule {}
