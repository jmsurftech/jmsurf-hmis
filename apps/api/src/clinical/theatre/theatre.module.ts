import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { TheatreController } from './theatre.controller';
import { TheatreService } from './theatre.service';

@Module({ imports: [InventoryModule], controllers: [TheatreController], providers: [TheatreService] })
export class TheatreModule {}
