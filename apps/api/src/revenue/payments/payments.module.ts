import { Module } from '@nestjs/common';
import { CashierShiftsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ controllers: [PaymentsController, CashierShiftsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
