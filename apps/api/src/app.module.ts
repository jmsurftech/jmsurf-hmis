import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { SequenceModule } from './common/sequence.service';
import { AuditModule } from './common/audit.service';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { Public } from './common/auth-user';
import { AuthModule } from './auth/auth.module';
import { BillingCoreModule } from './billing/billing-core.service';
import { ClinicalModule } from './clinical/clinical.module';
import { RevenueModule } from './revenue/revenue.module';
import { BackOfficeModule } from './backoffice/backoffice.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { PlatformModule } from './platform/platform.module';
import { SuperAdminGuard, TenantAccessGuard, TenantThrottlerGuard } from './platform/guards';
import { EngagementModule } from './engagement/engagement.module';
import { IntelligenceModule } from './intelligence.module';

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
    PrismaModule, SequenceModule, AuditModule, BillingCoreModule, AuthModule,
    RevenueModule, ClinicalModule, BackOfficeModule, IntelligenceModule, EngagementModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: Number(process.env.API_RATE_LIMIT_PER_MIN || 1200) }]),
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_GUARD, useClass: SuperAdminGuard },
    { provide: APP_GUARD, useClass: TenantAccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
