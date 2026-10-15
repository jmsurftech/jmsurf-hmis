import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { escrowReleasable, haversineMetres } from './homecare-rules';
import { CheckInDto, CheckOutDto, HomeVisitDto, HomeVisitQuery } from './homecare.dto';

const MAX_CHECKOUT_DRIFT_M = 500;

@Injectable()
export class HomecareService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async book(user: AuthUser, dto: HomeVisitDto) {
    const t = user.tenantId;
    if (!(await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId: t } }))) throw new NotFoundException('Patient not found');
    if (!(await this.prisma.user.findFirst({ where: { id: dto.providerId, tenantId: t, active: true } }))) throw new NotFoundException('Provider not found');
    const at = new Date(dto.scheduledAt);
    const clash = await this.prisma.homeCareVisit.findFirst({ where: { tenantId: t, providerId: dto.providerId, status: { in: ['BOOKED', 'IN_PROGRESS'] }, scheduledAt: { gt: new Date(at.getTime() - 3600000), lt: new Date(at.getTime() + 3600000) } } });
    if (clash) throw new BadRequestException('Provider already has a visit within an hour of that time');
    return this.prisma.homeCareVisit.create({ data: { ...dto, scheduledAt: at, tenantId: t } });
  }

  list(user: AuthUser, q: HomeVisitQuery) {
    const isProviderOnly = !user.roles.some((r) => ['ADMIN', 'MANAGER', 'RECEPTION', 'ACCOUNTANT'].includes(r)) && !user.isSuperAdmin;
    const where: Prisma.HomeCareVisitWhereInput = {
      tenantId: user.tenantId, ...(isProviderOnly ? { providerId: user.sub } : q.providerId ? { providerId: q.providerId } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { scheduledAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    return this.prisma.homeCareVisit.findMany({ where, orderBy: { scheduledAt: 'asc' }, take: 500 });
  }

  private async visit(user: AuthUser, id: string, providerOnly = false) {
    const v = await this.prisma.homeCareVisit.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!v) throw new NotFoundException('Home care visit not found');
    if (providerOnly && v.providerId !== user.sub && !user.roles.includes('ADMIN')) throw new ForbiddenException('Only the assigned provider can do this');
    return v;
  }

  async checkIn(user: AuthUser, id: string, dto: CheckInDto) {
    const v = await this.visit(user, id, true);
    if (v.status !== 'BOOKED') throw new BadRequestException(`Visit is ${v.status}`);
    return this.prisma.homeCareVisit.update({ where: { id }, data: { status: 'IN_PROGRESS', checkInAt: new Date(), checkInLat: dto.lat, checkInLng: dto.lng } });
  }

  async checkOut(user: AuthUser, id: string, dto: CheckOutDto) {
    const v = await this.visit(user, id, true);
    if (v.status !== 'IN_PROGRESS') throw new BadRequestException(`Visit is ${v.status}`);
    let drift: number | undefined;
    if (dto.lat != null && dto.lng != null && v.checkInLat != null && v.checkInLng != null) drift = haversineMetres(v.checkInLat, v.checkInLng, dto.lat, dto.lng);
    const flagged = drift != null && drift > MAX_CHECKOUT_DRIFT_M;
    const notes = [dto.notes, flagged ? `[FLAG] Check-out ${drift} m from check-in location` : null].filter(Boolean).join('\n') || v.notes;
    const r = await this.prisma.homeCareVisit.update({ where: { id }, data: { status: 'COMPLETED', checkOutAt: new Date(), notes } });
    return { ...r, checkoutDriftMetres: drift, flagged };
  }

  async releaseEscrow(user: AuthUser, id: string) {
    const v = await this.visit(user, id);
    const ok = escrowReleasable(v);
    if (!ok.ok) throw new BadRequestException(ok.reason);
    if (v.notes?.includes('[FLAG]') && !user.roles.some((r) => ['ADMIN', 'MANAGER'].includes(r))) throw new ForbiddenException('Flagged visit: manager must release escrow');
    const r = await this.prisma.homeCareVisit.update({ where: { id }, data: { escrowStatus: 'RELEASED' } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'ESCROW_RELEASE', entity: 'HomeCareVisit', entityId: id, data: { feeMinor: v.feeMinor } });
    return r;
  }

  async dispute(user: AuthUser, id: string, reason: string) {
    const v = await this.visit(user, id);
    if (v.escrowStatus !== 'HELD') throw new BadRequestException(`Escrow is ${v.escrowStatus}`);
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'ESCROW_DISPUTE', entity: 'HomeCareVisit', entityId: id, data: { reason } });
    return this.prisma.homeCareVisit.update({ where: { id }, data: { escrowStatus: 'DISPUTED', notes: `${v.notes ?? ''}\n[DISPUTE] ${reason}`.trim() } });
  }

  async refund(user: AuthUser, id: string, reason: string) {
    const v = await this.visit(user, id);
    if (!['HELD', 'DISPUTED'].includes(v.escrowStatus)) throw new BadRequestException(`Escrow is ${v.escrowStatus}`);
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'ESCROW_REFUND', entity: 'HomeCareVisit', entityId: id, data: { reason } });
    return this.prisma.homeCareVisit.update({ where: { id }, data: { escrowStatus: 'REFUNDED', status: v.status === 'COMPLETED' ? v.status : 'CANCELLED' } });
  }

  async cancel(user: AuthUser, id: string) {
    const v = await this.visit(user, id);
    if (v.status !== 'BOOKED') throw new BadRequestException(`Visit is ${v.status}`);
    return this.prisma.homeCareVisit.update({ where: { id }, data: { status: 'CANCELLED', escrowStatus: 'REFUNDED' } });
  }
}
