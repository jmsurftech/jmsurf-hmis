import { Module } from '@nestjs/common';
import { VisitsModule } from '../visits/visits.module';
import { PatientsModule } from '../patients/patients.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';

@Module({ imports: [VisitsModule, PatientsModule, InventoryModule], controllers: [PharmacyController], providers: [PharmacyService], exports: [PharmacyService] })
export class PharmacyModule {}
