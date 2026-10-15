import { Module } from '@nestjs/common';
import { PayersModule } from '../payers/payers.module';
import { ClaimsController, PreAuthController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { PreAuthService } from './preauth.service';

@Module({ imports: [PayersModule], controllers: [ClaimsController, PreAuthController], providers: [ClaimsService, PreAuthService], exports: [ClaimsService] })
export class ClaimsModule {}
