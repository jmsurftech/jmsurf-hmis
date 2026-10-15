import { Module } from '@nestjs/common';
import { DieteticsController } from './dietetics.controller';
import { DieteticsService } from './dietetics.service';

@Module({ controllers: [DieteticsController], providers: [DieteticsService] })
export class DieteticsModule {}
