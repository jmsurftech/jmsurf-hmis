import { Module } from '@nestjs/common';
import { PatientsModule } from './patients/patients.module';
import { VisitsModule } from './visits/visits.module';
import { EmrModule } from './emr/emr.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { InpatientModule } from './inpatient/inpatient.module';
import { MaternityModule } from './maternity/maternity.module';
import { TheatreModule } from './theatre/theatre.module';
import { DialysisModule } from './dialysis/dialysis.module';
import { HomecareModule } from './homecare/homecare.module';
import { RegistersModule } from './registers/registers.module';

// Aggregator module: import every clinical sub-module here.
@Module({
  imports: [
    PatientsModule, VisitsModule, EmrModule, OrdersModule, InventoryModule, PharmacyModule,
    InpatientModule, MaternityModule, TheatreModule, DialysisModule, HomecareModule, RegistersModule,
  ],
})
export class ClinicalModule {}
