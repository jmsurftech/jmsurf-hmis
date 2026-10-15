import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { BillingCoreService } from '../../billing/billing-core.service';
import { VisitsService } from '../visits/visits.service';
import { QueueService } from '../visits/queue.service';
import { paginate } from '../shared/pagination';
import { CreateOrderDto, OrderQueryDto } from './orders.dto';

const SERVICE_POINT: Record<string, string> = { LAB: 'LAB', IMAGING: 'RADIOLOGY', PROCEDURE: 'PROCEDURE' };

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private billing: BillingCoreService,
    private visits: VisitsService,
    private queue: QueueService,
  ) {}

  async create(user: AuthUser, dto: CreateOrderDto) {
    const t = user.tenantId;
    const visit = await this.visits.mustBeActive(t, dto.visitId);
    let serviceId = dto.serviceId;
    let description = dto.description;
    if (dto.type === 'LAB') {
      if (!dto.labTestId && !serviceId) throw new BadRequestException('Lab orders need labTestId or serviceId');
      if (dto.labTestId) {
        const test = await this.prisma.labTest.findFirst({ where: { id: dto.labTestId, tenantId: t } });
        if (!test) throw new NotFoundException('Lab test not found');
        serviceId ??= test.serviceItemId ?? undefined;
        description ??= `${test.code}: ${test.name}`;
      } else if (!description) {
        // Ordered by service item: keep the "CODE: name" description the lab worklist relies on.
        const test = await this.prisma.labTest.findFirst({ where: { tenantId: t, serviceItemId: serviceId } });
        if (test) description = `${test.code}: ${test.name}`;
      }
    }
    if (!serviceId) throw new BadRequestException('serviceId is required so the order can be billed');
    const service = await this.prisma.serviceItem.findFirst({ where: { id: serviceId, tenantId: t, active: true } });
    if (!service) throw new NotFoundException('Service item not found');
    description ??= service.name;
    if (dto.type === 'IMAGING' && dto.modality) description = `[${dto.modality}] ${description}`;
    const order = await this.prisma.order.create({
      data: { tenantId: t, visitId: visit.id, type: dto.type, serviceId, description, priority: dto.priority ?? 'ROUTINE', notes: dto.notes, orderedById: user.sub },
    });
    const charge = await this.billing.charge({ tenantId: t, visitId: visit.id, sourceType: dto.type === 'PROCEDURE' ? 'PROCEDURE' : 'ORDER', sourceId: order.id, serviceItemId: serviceId, quantity: dto.quantity ?? 1 });
    await this.queue.create(user, { visitId: visit.id, servicePoint: SERVICE_POINT[dto.type], priority: dto.priority === 'STAT' ? 1 : dto.priority === 'URGENT' ? 2 : 3 });
    if (visit.status === 'OPEN') await this.prisma.visit.update({ where: { id: visit.id }, data: { status: 'IN_PROGRESS' } });
    return { ...order, charge };
  }

  async list(tenantId: string, q: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      tenantId, ...(q.visitId ? { visitId: q.visitId } : {}), ...(q.type ? { type: q.type as any } : {}), ...(q.status ? { status: q.status as any } : {}),
      ...(q.q ? { description: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    return paginate(q, (skip, take) => this.prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { labResults: true, imagingReport: true, labSpecimen: true } }), () => this.prisma.order.count({ where }));
  }

  async get(tenantId: string, id: string) {
    const o = await this.prisma.order.findFirst({ where: { id, tenantId }, include: { labResults: true, imagingReport: true, labSpecimen: true, visit: { include: { patient: true } } } });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  /** Cancel an order not yet processed; voids its bill line(s). */
  async cancel(user: AuthUser, id: string, reason?: string) {
    const o = await this.get(user.tenantId, id);
    if (!['REQUESTED', 'PAID'].includes(o.status)) throw new BadRequestException(`Cannot cancel an order that is ${o.status}`);
    const lines = await this.prisma.billLine.findMany({ where: { tenantId: user.tenantId, sourceId: o.id, voided: false } });
    for (const l of lines) await this.billing.voidLine(user.tenantId, l.id);
    const r = await this.prisma.order.update({ where: { id }, data: { status: 'CANCELLED', notes: reason ? `${o.notes ?? ''}\nCancelled: ${reason}`.trim() : o.notes } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CANCEL', entity: 'Order', entityId: id, data: { reason, voidedLines: lines.length } });
    return r;
  }

  async completeProcedure(user: AuthUser, id: string, notes?: string) {
    const o = await this.get(user.tenantId, id);
    if (o.type !== 'PROCEDURE') throw new BadRequestException('Not a procedure order');
    if (['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(o.status)) throw new BadRequestException(`Order is ${o.status}`);
    return this.prisma.order.update({ where: { id }, data: { status: 'COMPLETED', notes: notes ?? o.notes } });
  }
}
