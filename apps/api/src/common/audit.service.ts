import { Global, Injectable, Module } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Tamper-evident audit log: each event's hash chains the previous event's hash for the tenant. */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(e: { tenantId?: string; userId?: string; action: string; entity: string; entityId?: string; data?: unknown; ip?: string }) {
    const prev = await this.prisma.auditEvent.findFirst({
      where: { tenantId: e.tenantId ?? null },
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });
    const prevHash = prev?.hash ?? 'GENESIS';
    const hash = createHash('sha256')
      .update(prevHash + JSON.stringify({ ...e, at: Date.now() }))
      .digest('hex');
    return this.prisma.auditEvent.create({
      data: { ...e, data: (e.data ?? undefined) as any, prevHash, hash },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
