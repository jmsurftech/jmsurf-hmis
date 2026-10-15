import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { PatientsService } from '../patients/patients.service';
import { eddFromLmp, gestationWeeks, immunizationSchedule } from './kepi';
import { AncVisitDto, DeliveryDto, GiveImmunizationDto, PregnancyDto, PregnancyQuery, UpdatePregnancyDto } from './maternity.dto';

@Injectable()
export class MaternityService {
  constructor(private prisma: PrismaService, private audit: AuditService, private patients: PatientsService) {}

  async createPregnancy(user: AuthUser, dto: PregnancyDto) {
    const p = await this.patients.mustExist(user.tenantId, dto.patientId);
    if (p.sex !== 'FEMALE') throw new BadRequestException('Pregnancy can only be registered for a female patient');
    if (await this.prisma.pregnancy.findFirst({ where: { tenantId: user.tenantId, patientId: p.id, status: 'ACTIVE' } })) throw new BadRequestException('Patient already has an active pregnancy');
    const lmp = dto.lmp ? new Date(dto.lmp) : undefined;
    const edd = dto.edd ? new Date(dto.edd) : lmp ? eddFromLmp(lmp) : undefined;
    const riskFlags = [...(dto.riskFlags ?? [])];
    if (dto.gravida && dto.gravida >= 5) riskFlags.push('GRAND_MULTIPARA');
    if (p.dateOfBirth) {
      const age = (Date.now() - p.dateOfBirth.getTime()) / (365.25 * 86400000);
      if (age < 18) riskFlags.push('ADOLESCENT');
      if (age >= 35) riskFlags.push('ADVANCED_MATERNAL_AGE');
    }
    return this.prisma.pregnancy.create({ data: { tenantId: user.tenantId, patientId: p.id, lmp, edd, gravida: dto.gravida, parity: dto.parity, riskFlags: [...new Set(riskFlags)] } });
  }

  list(tenantId: string, q: PregnancyQuery) {
    return this.prisma.pregnancy.findMany({ where: { tenantId, ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.status ? { status: { in: q.status.split(',') } } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async get(tenantId: string, id: string) {
    const p = await this.prisma.pregnancy.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Pregnancy not found');
    const deliveries = await this.prisma.delivery.findMany({ where: { tenantId, pregnancyId: id } });
    return { ...p, gestationWeeks: p.lmp && p.status === 'ACTIVE' ? gestationWeeks(p.lmp) : null, deliveries };
  }

  async update(user: AuthUser, id: string, dto: UpdatePregnancyDto) {
    await this.get(user.tenantId, id);
    return this.prisma.pregnancy.update({
      where: { id },
      data: { ...dto, lmp: dto.lmp ? new Date(dto.lmp) : undefined, edd: dto.edd ? new Date(dto.edd) : dto.lmp ? eddFromLmp(new Date(dto.lmp)) : undefined },
    });
  }

  async addAncVisit(user: AuthUser, id: string, dto: AncVisitDto) {
    const p = await this.get(user.tenantId, id);
    if (p.status !== 'ACTIVE') throw new BadRequestException('Pregnancy is not active');
    const date = dto.date ? new Date(dto.date) : new Date();
    const flags: string[] = [];
    if ((dto.systolic ?? 0) >= 140 || (dto.diastolic ?? 0) >= 90) flags.push('HYPERTENSION');
    if (((dto.systolic ?? 0) >= 140 || (dto.diastolic ?? 0) >= 90) && dto.urineProtein && dto.urineProtein !== 'NEG') flags.push('PRE_ECLAMPSIA_SUSPECT');
    if (dto.hb != null && dto.hb < 11) flags.push('ANAEMIA');
    if (dto.fetalHeartRate != null && (dto.fetalHeartRate < 110 || dto.fetalHeartRate > 160)) flags.push('ABNORMAL_FHR');
    const ancVisits = (p.ancVisits as any[]) ?? [];
    const entry = { ...dto, date, contact: ancVisits.length + 1, gestationWeeks: p.lmp ? gestationWeeks(p.lmp, date) : null, flags, by: user.sub };
    return this.prisma.pregnancy.update({ where: { id }, data: { ancVisits: [...ancVisits, entry] as any, riskFlags: [...new Set([...p.riskFlags, ...flags])] } });
  }

  /** Record delivery; registers each live-born baby as a linked Patient and generates the KEPI schedule. */
  async recordDelivery(user: AuthUser, id: string, dto: DeliveryDto) {
    const t = user.tenantId;
    const preg = await this.get(t, id);
    if (preg.status !== 'ACTIVE') throw new BadRequestException('Pregnancy is not active');
    const mother = await this.patients.mustExist(t, preg.patientId);
    const visit = await this.prisma.visit.findFirst({ where: { id: dto.visitId, tenantId: t, patientId: mother.id } });
    if (!visit) throw new NotFoundException('Visit not found for the mother');
    const deliveredAt = new Date(dto.deliveredAt);
    const babies = [];
    for (const [i, b] of dto.babies.entries()) {
      const flags: string[] = [];
      if (b.weightKg != null && b.weightKg < 2.5) flags.push('LOW_BIRTH_WEIGHT');
      if (b.apgar5 != null && b.apgar5 < 7) flags.push('LOW_APGAR');
      if (b.alive === false) { babies.push({ ...b, flags, newbornPatientId: null }); continue; }
      const baby = await this.patients.registerMinimal(t, {
        firstName: b.firstName ?? `Baby ${dto.babies.length > 1 ? String.fromCharCode(65 + i) + ' ' : ''}of ${mother.firstName}`,
        lastName: mother.lastName, sex: b.sex as any, dateOfBirth: deliveredAt, county: mother.county, subCounty: mother.subCounty, village: mother.village, phone: mother.phone,
        nextOfKin: [{ name: `${mother.firstName} ${mother.lastName}`, relationship: 'MOTHER', phone: mother.phone, patientId: mother.id }] as any,
      });
      await this.prisma.immunization.createMany({ data: immunizationSchedule(deliveredAt).map((s) => ({ tenantId: t, patientId: baby.id, vaccine: s.vaccine, dose: s.dose, dueDate: s.dueDate })) });
      babies.push({ ...b, flags, newbornPatientId: baby.id, mrn: baby.mrn });
    }
    const delivery = await this.prisma.delivery.create({
      data: { tenantId: t, pregnancyId: id, visitId: visit.id, deliveredAt, mode: dto.mode, outcome: dto.outcome, partograph: dto.partograph as any, babies: babies as any },
    });
    await this.prisma.pregnancy.update({ where: { id }, data: { status: 'DELIVERED', parity: (preg.parity ?? 0) + 1 } });
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'DELIVERY', entity: 'Delivery', entityId: delivery.id, data: { babies: babies.map((b) => b.newbornPatientId) } });
    return delivery;
  }

  async generateSchedule(user: AuthUser, patientId: string) {
    const t = user.tenantId;
    const p = await this.patients.mustExist(t, patientId);
    if (!p.dateOfBirth) throw new BadRequestException('Patient date of birth is required');
    const existing = await this.prisma.immunization.findMany({ where: { tenantId: t, patientId } });
    const have = new Set(existing.map((e) => `${e.vaccine}#${e.dose}`));
    const toAdd = immunizationSchedule(p.dateOfBirth).filter((s) => !have.has(`${s.vaccine}#${s.dose}`));
    if (toAdd.length) await this.prisma.immunization.createMany({ data: toAdd.map((s) => ({ tenantId: t, patientId, vaccine: s.vaccine, dose: s.dose, dueDate: s.dueDate })) });
    return this.listImmunizations(t, patientId);
  }

  async listImmunizations(tenantId: string, patientId: string) {
    const rows = await this.prisma.immunization.findMany({ where: { tenantId, patientId }, orderBy: [{ dueDate: 'asc' }, { vaccine: 'asc' }] });
    const now = Date.now();
    return rows.map((r) => ({ ...r, overdue: r.status === 'DUE' && !!r.dueDate && r.dueDate.getTime() < now - 14 * 86400000 }));
  }

  async give(user: AuthUser, id: string, dto: GiveImmunizationDto) {
    const r = await this.prisma.immunization.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!r) throw new NotFoundException('Immunization not found');
    if (r.status === 'GIVEN') throw new BadRequestException('Already given');
    return this.prisma.immunization.update({ where: { id }, data: { status: 'GIVEN', givenAt: dto.givenAt ? new Date(dto.givenAt) : new Date(), batch: dto.batch } });
  }

  /** Defaulter tracing list: doses more than 14 days overdue. */
  async defaulters(tenantId: string) {
    const rows = await this.prisma.immunization.findMany({ where: { tenantId, status: 'DUE', dueDate: { lt: new Date(Date.now() - 14 * 86400000) } }, orderBy: { dueDate: 'asc' }, take: 1000 });
    const patients = await this.prisma.patient.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.patientId))] } }, select: { id: true, mrn: true, firstName: true, lastName: true, phone: true, village: true } });
    const pm = new Map(patients.map((p) => [p.id, p]));
    const grouped = new Map<string, { patient: unknown; missed: typeof rows }>();
    for (const r of rows) {
      const g = grouped.get(r.patientId) ?? { patient: pm.get(r.patientId), missed: [] };
      g.missed.push(r);
      grouped.set(r.patientId, g);
    }
    return [...grouped.values()];
  }
}
