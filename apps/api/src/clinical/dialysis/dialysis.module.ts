import { Module } from '@nestjs/common';
import { VisitsModule } from '../visits/visits.module';
import { DialysisController } from './dialysis.controller';
import { DialysisService } from './dialysis.service';

@Module({ imports: [VisitsModule], controllers: [DialysisController], providers: [DialysisService] })
export class DialysisModule {}
