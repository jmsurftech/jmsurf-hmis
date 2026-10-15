import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantScopeMiddleware } from './tenant-scope';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    if (process.env.NODE_ENV !== 'production' && process.env.TENANT_SCOPE_CHECK !== 'off') this.$use(tenantScopeMiddleware());
    await this.$connect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
