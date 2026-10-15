import { Module } from '@nestjs/common';
import { VisitsModule } from '../visits/visits.module';
import { InpatientController } from './inpatient.controller';
import { InpatientService } from './inpatient.service';

@Module({ imports: [VisitsModule], controllers: [InpatientController], providers: [InpatientService], exports: [InpatientService] })
export class InpatientModule {}
