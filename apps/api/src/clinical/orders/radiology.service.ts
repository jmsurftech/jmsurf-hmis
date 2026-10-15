import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../shared/pagination';
import { ImagingReportDto, WorklistQueryDto } from './orders.dto';

@Injectable()
export class RadiologyService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async imagingOrder(tenantId: string, id: string) {
    const o = await this.prisma.order.findFirst({ where: { id, tenantId, type: 'IMAGING' }, include: { imagingReport: true } });
    if (!o) throw new NotFoundException('Imaging order not found');
    return o;
  }

  worklist(tenantId: string, q: WorklistQueryDto) {
    const where: Prisma.OrderWhereInput = {
      tenantId, type: 'IMAGING', status: q.status ? (q.status as any) : { in: ['REQUESTED', 'PAID', 'IN_PROGRESS', 'COMPLETED'] },
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.q ? { OR: [{ description: { contains: q.q, mode: 'insensitive' } }, { visit: { patient: { mrn: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    return paginate(q, (skip, take) => this.prisma.order.findMany({
      where, skip, take, orderBy: { createdAt: 'asc' },
      include: { imagingReport: true, visit: { select: { visitNumber: true, patient: { select: { id: true, mrn: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } } } } },
    }), () => this.prisma.order.count({ where }));
  }

  async start(user: AuthUser, id: string) {
    const o = await this.imagingOrder(user.tenantId, id);
    if (!['REQUESTED', 'PAID'].includes(o.status)) throw new BadRequestException(`Order is ${o.status}`);
    return this.prisma.order.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  }

  async report(user: AuthUser, id: string, dto: ImagingReportDto) {
    const o = await this.imagingOrder(user.tenantId, id);
    if (['CANCELLED', 'VERIFIED'].includes(o.status)) throw new BadRequestException(`Order is ${o.status}`);
    const data = { ...dto, reportedBy: user.sub };
    const rep = o.imagingReport
      ? await this.prisma.imagingReport.update({ where: { id: o.imagingReport.id }, data })
      : await this.prisma.imagingReport.create({ data: { ...data, tenantId: user.tenantId, orderId: o.id } });
    await this.prisma.order.update({ where: { id }, data: { status: 'COMPLETED' } });
    return rep;
  }

  async verify(user: AuthUser, id: string) {
    const o = await this.imagingOrder(user.tenantId, id);
    if (!o.imagingReport || o.status !== 'COMPLETED') throw new BadRequestException('Report must be written before verification');
    const rep = await this.prisma.imagingReport.update({ where: { id: o.imagingReport.id }, data: { verifiedBy: user.sub, verifiedAt: new Date() } });
    await this.prisma.order.update({ where: { id }, data: { status: 'VERIFIED' } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'VERIFY', entity: 'ImagingReport', entityId: rep.id });
    return rep;
  }
}
