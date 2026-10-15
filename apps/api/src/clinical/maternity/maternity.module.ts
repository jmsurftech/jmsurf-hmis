import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { MaternityController } from './maternity.controller';
import { MaternityService } from './maternity.service';

@Module({ imports: [PatientsModule], controllers: [MaternityController], providers: [MaternityService] })
export class MaternityModule {}
