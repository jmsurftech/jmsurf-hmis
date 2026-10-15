import { Module } from '@nestjs/common';
import { PayersController } from './payers.controller';
import { PayersService } from './payers.service';

@Module({ controllers: [PayersController], providers: [PayersService], exports: [PayersService] })
export class PayersModule {}
