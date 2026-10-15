import { Module } from '@nestjs/common';
import { VisitsModule } from '../visits/visits.module';
import { EmrController } from './emr.controller';
import { EmrService } from './emr.service';

@Module({ imports: [VisitsModule], controllers: [EmrController], providers: [EmrService], exports: [EmrService] })
export class EmrModule {}
