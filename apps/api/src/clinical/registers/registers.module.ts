import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { SequenceService } from '../../common/sequence.service';
import { AuthUser, CurrentUser } from '../../common/auth-user';
import { BillingCoreService } from '../../billing/billing-core.service';
import { ListQuery, pageArgs, paged } from '../../revenue/list-query';
import { REGISTERS } from './registers.catalog';

class RecordQuery extends ListQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
class RecordDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() visitId?: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}
class ChargeDto {
  @IsString() serviceItemId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
}

@Injectable()
export class RegistersService {
  constructor(private prisma: PrismaService, private audit: AuditService, private seq: SequenceService, private billing: BillingCoreService) {}

  private def(u: AuthUser, module: string) {
    const d = REGISTERS[module];
    if (!d) throw new NotFoundException(`Unknown register '${module}'`);
    if (!u.isSuperAdmin && !u.roles.includes('ADMIN') && !u.roles.some((r) => d.roles.includes(r))) throw new ForbiddenException('Your role cannot use this register');
    return d;
  }

  async summary(u: AuthUser, module: string) {
    this.def(u, module);
    const rows = await this.prisma.moduleRecord.groupBy({ by: ['status'], where: { tenantId: u.tenantId, module }, _count: true });
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const thisMonth = await this.prisma.moduleRecord.count({ where: { tenantId: u.tenantId, module, createdAt: { gte: monthStart } } });
    return { byStatus: Object.fromEntries(rows.map((r) => [r.status, r._count])), total: rows.reduce((s, r) => s + r._count, 0), thisMonth };
  }

  async list(u: AuthUser, module: string, q: RecordQuery) {
    this.def(u, module);
    const where: Prisma.ModuleRecordWhereInput = {
      tenantId: u.tenantId, module,
      ...(q.status ? { status: { in: q.status.split(',') } } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    if (q.q) {
      const term = q.q.trim();
      const pts = await this.prisma.patient.findMany({
        where: { tenantId: u.tenantId, OR: [{ firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { mrn: { contains: term, mode: 'insensitive' } }] },
        select: { id: true }, take: 200,
      });
      where.OR = [{ number: { contains: term, mode: 'insensitive' } }, { title: { contains: term, mode: 'insensitive' } }, ...(pts.length ? [{ patientId: { in: pts.map((p) => p.id) } }] : [])];
    }
    const [rows, total] = await Promise.all([
      this.prisma.moduleRecord.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.moduleRecord.count({ where }),
    ]);
    return paged(await this.withPatients(u.tenantId, rows), total, q);
  }

  private async withPatients<T extends { patientId: string | null }>(tenantId: string, rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.patientId).filter(Boolean))] as string[];
    if (!ids.length) return rows.map((r) => ({ ...r, patient: null }));
    const pts = await this.prisma.patient.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, mrn: true, firstName: true, middleName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } });
    const m = new Map(pts.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, patient: r.patientId ? m.get(r.patientId) ?? null : null }));
  }

  async get(u: AuthUser, module: string, id: string) {
    this.def(u, module);
    const r = await this.prisma.moduleRecord.findFirst({ where: { id, tenantId: u.tenantId, module } });
    if (!r) throw new NotFoundException('Record not found');
    const [withP] = await this.withPatients(u.tenantId, [r]);
    const history = await this.prisma.auditEvent.findMany({ where: { tenantId: u.tenantId, entity: 'ModuleRecord', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(history.map((h) => h.userId).filter(Boolean))] as string[] } }, select: { id: true, firstName: true, lastName: true } });
    const um = new Map(users.map((x) => [x.id, `${x.firstName} ${x.lastName}`]));
    return { ...withP, history: history.map((h) => ({ id: h.id, action: h.action, at: h.createdAt, by: h.userId ? um.get(h.userId) ?? null : null, data: h.data })) };
  }

  private async checkLinks(u: AuthUser, dto: RecordDto) {
    if (dto.patientId && !(await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId: u.tenantId }, select: { id: true } }))) throw new BadRequestException('Patient not found');
    if (dto.visitId && !(await this.prisma.visit.findFirst({ where: { id: dto.visitId, tenantId: u.tenantId }, select: { id: true } }))) throw new BadRequestException('Visit not found');
  }

  async create(u: AuthUser, module: string, dto: RecordDto) {
    const d = this.def(u, module);
    if (d.patient && !dto.patientId) throw new BadRequestException('Choose the patient');
    if (dto.status && !d.statuses.includes(dto.status)) throw new BadRequestException(`Status must be one of ${d.statuses.join(', ')}`);
    await this.checkLinks(u, dto);
    const number = await this.seq.next(u.tenantId, `REG-${module}`, d.prefix);
    const r = await this.prisma.moduleRecord.create({
      data: {
        tenantId: u.tenantId, facilityId: u.facilityIds?.[0], module, number, title: dto.title?.trim() || null, status: dto.status ?? d.statuses[0],
        patientId: dto.patientId || null, visitId: dto.visitId || null, data: (dto.data ?? {}) as Prisma.InputJsonValue, createdById: u.sub, updatedById: u.sub,
      },
    });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'ModuleRecord', entityId: r.id, data: { module, number, status: r.status } });
    return r;
  }

  async update(u: AuthUser, module: string, id: string, dto: RecordDto) {
    const d = this.def(u, module);
    const cur = await this.prisma.moduleRecord.findFirst({ where: { id, tenantId: u.tenantId, module } });
    if (!cur) throw new NotFoundException('Record not found');
    if (dto.status && !d.statuses.includes(dto.status)) throw new BadRequestException(`Status must be one of ${d.statuses.join(', ')}`);
    await this.checkLinks(u, dto);
    const data = dto.data ? ({ ...(cur.data as object), ...dto.data } as Prisma.InputJsonValue) : undefined;
    const r = await this.prisma.moduleRecord.update({
      where: { id },
      data: { title: dto.title !== undefined ? dto.title.trim() || null : undefined, status: dto.status, patientId: dto.patientId, visitId: dto.visitId, data, updatedById: u.sub },
    });
    const changed = dto.status && dto.status !== cur.status ? { from: cur.status, to: dto.status } : undefined;
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: changed ? 'STATUS' : 'UPDATE', entity: 'ModuleRecord', entityId: id, data: { module, ...(changed ?? {}), fields: dto.data ? Object.keys(dto.data) : [] } });
    return r;
  }

  /** Post a priced service to the record's visit bill through the pricing engine. */
  async charge(u: AuthUser, module: string, id: string, dto: ChargeDto) {
    this.def(u, module);
    const r = await this.prisma.moduleRecord.findFirst({ where: { id, tenantId: u.tenantId, module } });
    if (!r) throw new NotFoundException('Record not found');
    if (!r.visitId) throw new BadRequestException('Link this record to a visit before charging');
    const line = await this.billing.charge({ tenantId: u.tenantId, visitId: r.visitId, serviceItemId: dto.serviceItemId, quantity: dto.quantity ?? 1, sourceType: `REGISTER:${module}`, sourceId: r.id } as any);
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CHARGE', entity: 'ModuleRecord', entityId: id, data: { serviceItemId: dto.serviceItemId, quantity: dto.quantity ?? 1 } });
    return line;
  }
}

@Controller('records')
export class RegistersController {
  constructor(private svc: RegistersService) {}
  @Get(':module/summary') summary(@CurrentUser() u: AuthUser, @Param('module') m: string) { return this.svc.summary(u, m); }
  @Get(':module') list(@CurrentUser() u: AuthUser, @Param('module') m: string, @Query() q: RecordQuery) { return this.svc.list(u, m, q); }
  @Get(':module/:id') get(@CurrentUser() u: AuthUser, @Param('module') m: string, @Param('id') id: string) { return this.svc.get(u, m, id); }
  @Post(':module') create(@CurrentUser() u: AuthUser, @Param('module') m: string, @Body() dto: RecordDto) { return this.svc.create(u, m, dto); }
  @Patch(':module/:id') update(@CurrentUser() u: AuthUser, @Param('module') m: string, @Param('id') id: string, @Body() dto: RecordDto) { return this.svc.update(u, m, id, dto); }
  @Post(':module/:id/charge') charge(@CurrentUser() u: AuthUser, @Param('module') m: string, @Param('id') id: string, @Body() dto: ChargeDto) { return this.svc.charge(u, m, id, dto); }
}

@Module({ providers: [RegistersService], controllers: [RegistersController] })
export class RegistersModule {}
