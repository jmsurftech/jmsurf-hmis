import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { SupportBillingService } from '../support-common/support-billing.service';
import { isSuppressed, NASCOP_COLUMNS, tbPhaseFor, toCsv, tracingCategory, vlCategory } from './programmes.rules';
import { AppointmentDto, DotDto, HivEnrolDto, HivQuery, HivUpdateDto, OutcomeDto, PhaseDto, RegimenDto, TbCaseDto, TbQuery, TracingDto, ViralLoadDto } from './programmes.dto';

const DAY = 86400000;

/** HIV & TB programme registers. Every read and write is audited (sensitive data). */
@Injectable()
export class ProgrammesService {
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}

  private async attachPatients<T extends { patientId: string }>(t: string, rows: T[]) {
    const ps = await this.prisma.patient.findMany({ where: { tenantId: t, id: { in: rows.map((r) => r.patientId) } }, select: { id: true, firstName: true, lastName: true, mrn: true, sex: true, dateOfBirth: true, phone: true } });
    return rows.map((r) => ({ ...r, patient: ps.find((p) => p.id === r.patientId) }));
  }

  // ── HIV ──
  async enrol(u: AuthUser, d: HivEnrolDto) {
    const t = u.tenantId;
    await this.sb.patient(t, d.patientId);
    if (await this.prisma.hivEnrolment.findFirst({ where: { tenantId: t, patientId: d.patientId } })) throw new ConflictException('Patient already enrolled');
    const cccNumber = d.cccNumber ?? (await this.sb.next(t, 'CCC', 'CCC'));
    const e = await this.prisma.hivEnrolment.create({ data: {
      tenantId: t, patientId: d.patientId, cccNumber, enrolledAt: d.enrolledAt ? new Date(d.enrolledAt) : undefined, entryPoint: d.entryPoint, whoStage: d.whoStage, pmtct: d.pmtct ?? false,
      currentRegimen: d.regimen, artStartDate: d.regimen ? (d.artStartDate ? new Date(d.artStartDate) : new Date()) : undefined,
      ...(d.regimen ? { regimens: { create: { tenantId: t, regimen: d.regimen, line: 'FIRST', startDate: d.artStartDate ? new Date(d.artStartDate) : new Date() } } } : {}),
    } });
    await this.sb.log(u, 'CREATE', 'HivEnrolment', e.id, { cccNumber });
    return e;
  }
  async listHiv(u: AuthUser, q: HivQuery) {
    const t = u.tenantId;
    const where: Prisma.HivEnrolmentWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.pmtct === 'true' ? { pmtct: true } : {}), ...(q.q ? { cccNumber: { contains: q.q, mode: 'insensitive' } } : {}) };
    await this.sb.log(u, 'READ_SENSITIVE', 'HivEnrolment', undefined, { list: true, q: q.q });
    return paginate(q, async (skip, take) => {
      const rows = await this.prisma.hivEnrolment.findMany({ where, skip, take, orderBy: { enrolledAt: 'desc' }, include: { viralLoads: { orderBy: { sampleDate: 'desc' }, take: 1 } } });
      return (await this.attachPatients(t, rows)).map(({ viralLoads, ...r }) => ({ ...r, lastVl: viralLoads[0] ?? null }));
    }, () => this.prisma.hivEnrolment.count({ where }));
  }
  async getHiv(u: AuthUser, id: string) {
    const e = await mustFind(this.prisma.hivEnrolment.findFirst({ where: { id, tenantId: u.tenantId }, include: { regimens: { orderBy: { startDate: 'desc' } }, viralLoads: { orderBy: { sampleDate: 'desc' } }, appointments: { orderBy: { scheduledAt: 'desc' } } } }), 'Enrolment');
    await this.sb.log(u, 'READ_SENSITIVE', 'HivEnrolment', id);
    const [withP] = await this.attachPatients(u.tenantId, [e]);
    return { ...withP, viralLoads: e.viralLoads.map((v) => ({ ...v, category: vlCategory(v.copiesPerMl, v.ldl) })) };
  }
  private enr(t: string, id: string) { return mustFind(this.prisma.hivEnrolment.findFirst({ where: { id, tenantId: t } }), 'Enrolment'); }
  async updateHiv(u: AuthUser, id: string, d: HivUpdateDto) {
    await this.enr(u.tenantId, id);
    await this.sb.log(u, 'UPDATE', 'HivEnrolment', id, d);
    return this.prisma.hivEnrolment.update({ where: { id }, data: d });
  }
  /** Regimen change: closes the current regimen and starts the new one. */
  async changeRegimen(u: AuthUser, id: string, d: RegimenDto) {
    const e = await this.enr(u.tenantId, id);
    const start = d.startDate ? new Date(d.startDate) : new Date();
    await this.prisma.artRegimen.updateMany({ where: { enrolmentId: id, endDate: null }, data: { endDate: start, changeReason: d.changeReason } });
    const r = await this.prisma.artRegimen.create({ data: { tenantId: u.tenantId, enrolmentId: id, regimen: d.regimen, line: d.line ?? 'FIRST', startDate: start } });
    await this.prisma.hivEnrolment.update({ where: { id }, data: { currentRegimen: d.regimen, artStartDate: e.artStartDate ?? start } });
    await this.sb.log(u, 'UPDATE', 'ArtRegimen', r.id, { enrolmentId: id, regimen: d.regimen });
    return r;
  }
  async addViralLoad(u: AuthUser, id: string, d: ViralLoadDto) {
    await this.enr(u.tenantId, id);
    let suppressed: boolean;
    try { suppressed = isSuppressed(d.copiesPerMl, d.ldl ?? false); } catch (e) { throw new BadRequestException(e.message); }
    const v = await this.prisma.viralLoad.create({ data: { tenantId: u.tenantId, enrolmentId: id, sampleDate: new Date(d.sampleDate), copiesPerMl: d.ldl ? null : d.copiesPerMl, ldl: d.ldl ?? false, suppressed } });
    await this.sb.log(u, 'CREATE', 'ViralLoad', v.id, { enrolmentId: id, suppressed });
    return { ...v, category: vlCategory(v.copiesPerMl, v.ldl) };
  }
  async addAppointment(u: AuthUser, id: string, d: AppointmentDto) {
    await this.enr(u.tenantId, id);
    return this.prisma.hivAppointment.create({ data: { tenantId: u.tenantId, enrolmentId: id, scheduledAt: new Date(d.scheduledAt), purpose: d.purpose ?? 'CLINICAL' } });
  }
  private async appt(t: string, id: string) { return mustFind(this.prisma.hivAppointment.findFirst({ where: { id, tenantId: t } }), 'Appointment'); }
  async attend(u: AuthUser, id: string) {
    await this.appt(u.tenantId, id);
    return this.prisma.hivAppointment.update({ where: { id }, data: { status: 'ATTENDED', attendedAt: new Date() } });
  }
  async trace(u: AuthUser, id: string, d: TracingDto) {
    const a = await this.appt(u.tenantId, id);
    await this.sb.log(u, 'UPDATE', 'HivAppointment', id, d);
    if (d.tracingOutcome === 'DEAD' || d.tracingOutcome === 'TRANSFERRED') await this.prisma.hivEnrolment.update({ where: { id: a.enrolmentId }, data: { status: d.tracingOutcome === 'DEAD' ? 'DEAD' : 'TRANSFERRED_OUT' } });
    return this.prisma.hivAppointment.update({ where: { id }, data: { ...d, status: d.tracingOutcome === 'CONTACTED_RETURNED' ? 'ATTENDED' : 'MISSED' } });
  }
  /** Defaulter tracing list: active clients with unattended appointments in the past. */
  async defaulters(u: AuthUser) {
    const t = u.tenantId; const now = Date.now();
    const appts = await this.prisma.hivAppointment.findMany({ where: { tenantId: t, attendedAt: null, scheduledAt: { lt: new Date(now - DAY) }, enrolment: { status: 'ACTIVE' }, OR: [{ tracingOutcome: null }, { tracingOutcome: { in: ['NOT_REACHED', 'CONTACTED_WILL_RETURN'] } }] }, include: { enrolment: true }, orderBy: { scheduledAt: 'asc' } });
    // Latest missed appointment per client only.
    const latest = new Map<string, (typeof appts)[number]>();
    for (const a of appts) latest.set(a.enrolmentId, a);
    await this.sb.log(u, 'READ_SENSITIVE', 'HivDefaulterList', undefined, { count: latest.size });
    const rows = [...latest.values()].map((a) => {
      const daysLate = Math.floor((now - a.scheduledAt.getTime()) / DAY);
      return { appointmentId: a.id, enrolmentId: a.enrolmentId, patientId: a.enrolment.patientId, cccNumber: a.enrolment.cccNumber, scheduledAt: a.scheduledAt, purpose: a.purpose, daysLate, category: tracingCategory(daysLate), tracingOutcome: a.tracingOutcome, tracingNotes: a.tracingNotes, pmtct: a.enrolment.pmtct };
    });
    return this.attachPatients(t, rows);
  }
  async cascade(u: AuthUser) {
    const t = u.tenantId;
    const active = await this.prisma.hivEnrolment.findMany({ where: { tenantId: t, status: 'ACTIVE' }, include: { viralLoads: { orderBy: { sampleDate: 'desc' }, take: 1 } } });
    const withVl = active.filter((e) => e.viralLoads.length);
    const suppressed = withVl.filter((e) => e.viralLoads[0].suppressed).length;
    return { active: active.length, onArt: active.filter((e) => e.currentRegimen).length, pmtct: active.filter((e) => e.pmtct).length, withVl: withVl.length, suppressed, suppressionRate: withVl.length ? Math.round((suppressed / withVl.length) * 100) : null };
  }
  /** NASCOP/KenyaEMR-compatible line list (columns indicative – see NASCOP_COLUMNS). */
  async exportLineList(u: AuthUser) {
    const t = u.tenantId;
    const rows = await this.prisma.hivEnrolment.findMany({ where: { tenantId: t }, include: { viralLoads: { orderBy: { sampleDate: 'desc' }, take: 1 }, regimens: { where: { endDate: null }, take: 1 }, appointments: { where: { attendedAt: null, scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 1 } }, orderBy: { cccNumber: 'asc' } });
    const ps = await this.prisma.patient.findMany({ where: { tenantId: t, id: { in: rows.map((r) => r.patientId) } } });
    await this.sb.log(u, 'READ_SENSITIVE', 'HivLineListExport', undefined, { rows: rows.length });
    const data = rows.map((r) => {
      const p = ps.find((x) => x.id === r.patientId); const vl = r.viralLoads[0];
      return {
        CCC_Number: r.cccNumber, Patient_MRN: p?.mrn, Sex: p?.sex === 'FEMALE' ? 'F' : p?.sex === 'MALE' ? 'M' : 'U', Date_of_Birth: p?.dateOfBirth, Enrollment_Date: r.enrolledAt,
        Entry_Point: r.entryPoint, WHO_Stage: r.whoStage, ART_Start_Date: r.artStartDate, Current_Regimen: r.currentRegimen, Regimen_Line: r.regimens[0]?.line,
        PMTCT: r.pmtct ? 'Yes' : 'No', Last_VL_Date: vl?.sampleDate, Last_VL_Result: vl ? (vl.ldl ? 'LDL' : vl.copiesPerMl) : '', VL_Suppressed: vl ? (vl.suppressed ? 'Yes' : 'No') : '',
        Next_Appointment: r.appointments[0]?.scheduledAt, Status: r.status,
      };
    });
    return toCsv(NASCOP_COLUMNS, data);
  }

  // ── TB ──
  async registerTb(u: AuthUser, d: TbCaseDto) {
    const t = u.tenantId;
    await this.sb.patient(t, d.patientId);
    const c = await this.prisma.tbCase.create({ data: { tenantId: t, ...d, tbNumber: d.tbNumber ?? (await this.sb.next(t, 'TB', 'TB')), intensiveStart: d.intensiveStart ? new Date(d.intensiveStart) : undefined } });
    await this.sb.log(u, 'CREATE', 'TbCase', c.id, { tbNumber: c.tbNumber });
    return c;
  }
  async listTb(u: AuthUser, q: TbQuery) {
    const t = u.tenantId;
    const where: Prisma.TbCaseWhereInput = { tenantId: t, ...(q.phase ? { phase: q.phase } : {}), ...(q.outcome ? { outcome: q.outcome } : {}), ...(q.q ? { tbNumber: { contains: q.q, mode: 'insensitive' } } : {}) };
    await this.sb.log(u, 'READ_SENSITIVE', 'TbCase', undefined, { list: true });
    return paginate(q, async (skip, take) => {
      const rows = await this.prisma.tbCase.findMany({ where, skip, take, orderBy: { registeredAt: 'desc' }, include: { _count: { select: { doses: true } } } });
      return (await this.attachPatients(t, rows)).map((r) => ({ ...r, expectedPhase: r.outcome ? null : tbPhaseFor(r.intensiveStart) }));
    }, () => this.prisma.tbCase.count({ where }));
  }
  async getTb(u: AuthUser, id: string) {
    const c = await mustFind(this.prisma.tbCase.findFirst({ where: { id, tenantId: u.tenantId }, include: { doses: { orderBy: { date: 'desc' } } } }), 'TB case');
    await this.sb.log(u, 'READ_SENSITIVE', 'TbCase', id);
    const observed = c.doses.filter((d) => d.observed).length;
    const [withP] = await this.attachPatients(u.tenantId, [c]);
    return { ...withP, adherence: c.doses.length ? Math.round((observed / c.doses.length) * 100) : null, expectedPhase: tbPhaseFor(c.intensiveStart) };
  }
  private tb(t: string, id: string) { return mustFind(this.prisma.tbCase.findFirst({ where: { id, tenantId: t } }), 'TB case'); }
  async dot(u: AuthUser, id: string, d: DotDto) {
    const c = await this.tb(u.tenantId, id);
    if (c.outcome) throw new BadRequestException('Case has an outcome');
    const date = new Date(`${(d.date ?? new Date().toISOString()).slice(0, 10)}T00:00:00.000Z`);
    return this.prisma.tbDot.upsert({ where: { caseId_date: { caseId: id, date } }, create: { tenantId: u.tenantId, caseId: id, date, observed: d.observed ?? true, observer: d.observer, notes: d.notes }, update: { observed: d.observed ?? true, observer: d.observer, notes: d.notes } });
  }
  async phase(u: AuthUser, id: string, d: PhaseDto) {
    const c = await this.tb(u.tenantId, id);
    if (c.phase !== 'INTENSIVE') throw new BadRequestException(`Case is in ${c.phase} phase`);
    return this.prisma.tbCase.update({ where: { id }, data: { phase: 'CONTINUATION', continuationStart: d.date ? new Date(d.date) : new Date() } });
  }
  async outcome(u: AuthUser, id: string, d: OutcomeDto) {
    await this.tb(u.tenantId, id);
    await this.sb.log(u, 'UPDATE', 'TbCase', id, d);
    return this.prisma.tbCase.update({ where: { id }, data: { outcome: d.outcome, outcomeDate: d.date ? new Date(d.date) : new Date(), phase: 'COMPLETED' } });
  }
}
