import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { SequenceModule } from './common/sequence.service';
import { AuditModule } from './common/audit.service';
import { MailModule } from './common/mail.service';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { Public } from './common/auth-user';
import { AuthModule } from './auth/auth.module';
import { BillingCoreModule } from './billing/billing-core.service';
import { ClinicalModule } from './clinical/clinical.module';
import { RevenueModule } from './revenue/revenue.module';
import { BackOfficeModule } from './backoffice/backoffice.module';

@Controller('health')
class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public() @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'jmsurf-hmis-api', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule, SequenceModule, AuditModule, MailModule, BillingCoreModule, AuthModule,
    RevenueModule, ClinicalModule, BackOfficeModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
