import { Module } from '@nestjs/common';
import { AppointmentsController, QueueController, VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { QueueService } from './queue.service';
import { AppointmentsService } from './appointments.service';

@Module({
  controllers: [VisitsController, QueueController, AppointmentsController],
  providers: [VisitsService, QueueService, AppointmentsService],
  exports: [VisitsService, QueueService],
})
export class VisitsModule {}
