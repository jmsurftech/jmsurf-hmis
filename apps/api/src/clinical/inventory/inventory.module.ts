import { Module } from '@nestjs/common';
import { InventoryController, ProcurementController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ProcurementService } from './procurement.service';

@Module({ controllers: [InventoryController, ProcurementController], providers: [InventoryService, ProcurementService], exports: [InventoryService] })
export class InventoryModule {}
