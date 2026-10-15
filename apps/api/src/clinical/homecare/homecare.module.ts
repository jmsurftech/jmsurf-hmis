import { Module } from '@nestjs/common';
import { HomecareController } from './homecare.controller';
import { HomecareService } from './homecare.service';

@Module({ controllers: [HomecareController], providers: [HomecareService] })
export class HomecareModule {}
