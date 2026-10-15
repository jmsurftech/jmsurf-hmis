import { Module } from '@nestjs/common';
import { VisitsModule } from '../visits/visits.module';
import { LabController, OrdersController, RadiologyController } from './orders.controller';
import { OrdersService } from './orders.service';
import { LabService } from './lab.service';
import { RadiologyService } from './radiology.service';

@Module({
  imports: [VisitsModule],
  controllers: [OrdersController, LabController, RadiologyController],
  providers: [OrdersService, LabService, RadiologyService],
  exports: [OrdersService],
})
export class OrdersModule {}
