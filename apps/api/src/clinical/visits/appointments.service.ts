import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { resolveFacilityId } from '../shared/facility';
import { CalendarQueryDto, CheckInDto, CreateAppointmentDto, UpdateAppointmentDto } from './visits.dto';
import { VisitsService } from './visits.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService, private visits: VisitsService) {}

  private async assertFree(tenantId: string, practitionerId: string | undefined | null, start: Date, end: Date, excludeId?: string) {
    if (end <= start) throw new BadRequestException('endAt must be after startAt');
    if (!practitionerId) return;
    const clash = await this.prisma.appointment.findFirst({
      where: { tenantId, practitionerId, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, startAt: { lt: end }, endAt: { gt: start }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (clash) throw new ConflictException({ message: 'Practitioner already has an appointment in this slot', clash });
  }

  async create(user: AuthUser, dto: CreateAppointmentDto) {
    const t = user.tenantId;
    const p = await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId: t } });
    if (!p) throw new NotFoundException('Patient not found');
    const startAt = new Date(dto.startAt), endAt = new Date(dto.endAt);
    await this.assertFree(t, dto.practitionerId, startAt, endAt);
    const facilityId = await resolveFacilityId(this.prisma, user, dto.facilityId);
    return this.prisma.appointment.create({ data: { ...dto, facilityId, startAt, endAt, tenantId: t } });
  }

  async get(tenantId: string, id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Appointment not found');
    return a;
  }

  async update(user: AuthUser, id: string, dto: UpdateAppointmentDto) {
    const a = await this.get(user.tenantId, id);
    const startAt = dto.startAt ? new Date(dto.startAt) : a.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : a.endAt;
    if (dto.startAt || dto.endAt || dto.practitionerId) await this.assertFree(user.tenantId, dto.practitionerId ?? a.practitionerId, startAt, endAt, id);
    const { patientId, ...rest } = dto;
    return this.prisma.appointment.update({ where: { id }, data: { ...rest, startAt, endAt } });
  }

  async cancel(user: AuthUser, id: string) {
    await this.get(user.tenantId, id);
    return this.prisma.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async calendar(user: AuthUser, q: CalendarQueryDto) {
    const where: Prisma.AppointmentWhereInput = {
      tenantId: user.tenantId, startAt: { gte: new Date(q.from), lt: new Date(q.to) },
      ...(q.practitionerId ? { practitionerId: q.practitionerId } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.facilityId ? { facilityId: q.facilityId } : {}),
      ...(q.status ? { status: { in: q.status.split(',') } } : {}),
    };
    const appts = await this.prisma.appointment.findMany({ where, orderBy: { startAt: 'asc' } });
    const patients = await this.prisma.patient.findMany({ where: { id: { in: [...new Set(appts.map((a) => a.patientId))] } }, select: { id: true, mrn: true, firstName: true, lastName: true, phone: true } });
    const pm = new Map(patients.map((p) => [p.id, p]));
    const data = appts.map((a) => ({ ...a, patient: pm.get(a.patientId) }));
    const byDay: Record<string, typeof data> = {};
    for (const a of data) (byDay[a.startAt.toISOString().slice(0, 10)] ??= []).push(a);
    return { data, byDay, total: data.length };
  }

  /** Mark arrived and open a visit for the appointment. */
  async checkIn(user: AuthUser, id: string, dto: CheckInDto) {
    const a = await this.get(user.tenantId, id);
    if (['CANCELLED', 'DONE', 'ARRIVED'].includes(a.status)) throw new BadRequestException(`Appointment is ${a.status}`);
    const visit = await this.visits.open(user, {
      patientId: a.patientId, facilityId: a.facilityId, practitionerId: a.practitionerId ?? undefined, departmentId: a.departmentId ?? undefined,
      type: a.mode === 'TELEMEDICINE' ? ('TELEMEDICINE' as any) : ('OPD' as any), ...dto,
    });
    await this.prisma.appointment.update({ where: { id }, data: { status: 'ARRIVED' } });
    return visit;
  }

  /** Mark past BOOKED/CONFIRMED appointments as NO_SHOW. */
  async markNoShows(user: AuthUser) {
    const r = await this.prisma.appointment.updateMany({ where: { tenantId: user.tenantId, status: { in: ['BOOKED', 'CONFIRMED'] }, endAt: { lt: new Date() } }, data: { status: 'NO_SHOW' } });
    return { updated: r.count };
  }
}
