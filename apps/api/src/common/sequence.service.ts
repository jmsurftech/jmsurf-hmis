import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Atomic per-tenant document numbering, e.g. next(tenantId, 'BILL', 'INV') => INV-2026-000123 */
@Injectable()
export class SequenceService {
  constructor(private prisma: PrismaService) {}

  async next(tenantId: string, name: string, prefix = name): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO "Sequence" ("tenantId", "name", "value") VALUES (${tenantId}, ${name}, 1)
      ON CONFLICT ("tenantId", "name") DO UPDATE SET "value" = "Sequence"."value" + 1
      RETURNING "value"`;
    const n = rows[0].value;
    return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
  }
}

@Global()
@Module({ providers: [SequenceService], exports: [SequenceService] })
export class SequenceModule {}
