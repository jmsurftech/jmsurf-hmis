import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { ageInDays, paginate, PageQueryDto } from '../shared/pagination';
import { flagResult, pickRange, RefRange } from './lab-flags';
import { CollectSpecimenDto, EnterResultsDto, LabTestDto, UpdateLabTestDto, WorklistQueryDto } from './orders.dto';

@Injectable()
export class LabService {
  constructor(private prisma: PrismaService, private seq: SequenceService, private audit: AuditService) {}

  // ── Catalogue ──
  async createTest(user: AuthUser, dto: LabTestDto) {
    const exists = await this.prisma.labTest.findFirst({ where: { tenantId: user.tenantId, code: dto.code } });
    if (exists) throw new ConflictException('Test code already exists');
    return this.prisma.labTest.create({ data: { ...dto, refRanges: dto.refRanges as any, tenantId: user.tenantId } });
  }
  listTests(tenantId: string, q: PageQueryDto) {
    const where: Prisma.LabTestWhereInput = { tenantId, ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { loinc: q.q }] } : {}) };
    return paginate(q, (skip, take) => this.prisma.labTest.findMany({ where, skip, take, orderBy: { name: 'asc' } }), () => this.prisma.labTest.count({ where }));
  }
  async getTest(tenantId: string, id: string) {
    const t = await this.prisma.labTest.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Lab test not found');
    return t;
  }
  async updateTest(user: AuthUser, id: string, dto: UpdateLabTestDto) {
    await this.getTest(user.tenantId, id);
    return this.prisma.labTest.update({ where: { id }, data: { ...dto, refRanges: dto.refRanges as any } });
  }
  async deleteTest(user: AuthUser, id: string) {
    await this.getTest(user.tenantId, id);
    await this.prisma.labTest.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Workflow ──
  private async labOrder(tenantId: string, id: string) {
    const o = await this.prisma.order.findFirst({ where: { id, tenantId, type: 'LAB' }, include: { labSpecimen: true, labResults: true, visit: { include: { patient: true } } } });
    if (!o) throw new NotFoundException('Lab order not found');
    return o;
  }

  async worklist(tenantId: string, q: WorklistQueryDto) {
    const where: Prisma.OrderWhereInput = {
      tenantId, type: 'LAB',
      status: q.status ? { in: q.status.split(',') as any } : { in: ['REQUESTED', 'PAID', 'IN_PROGRESS', 'COMPLETED'] },
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.q ? { OR: [{ description: { contains: q.q, mode: 'insensitive' } }, { labSpecimen: { accession: q.q } }, { visit: { patient: { mrn: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const res = await paginate(
      q,
      (skip, take) => this.prisma.order.findMany({
        where, skip, take, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: { labSpecimen: true, labResults: true, visit: { select: { visitNumber: true, patient: { select: { id: true, mrn: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } } } } },
      }),
      () => this.prisma.order.count({ where }),
    );
    // STAT > URGENT > ROUTINE ordering (string sort is not semantic)
    const rank: Record<string, number> = { STAT: 0, URGENT: 1, ROUTINE: 2 };
    res.data.sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || a.createdAt.getTime() - b.createdAt.getTime());
    return res;
  }

  async collect(user: AuthUser, orderId: string, dto: CollectSpecimenDto) {
    const o = await this.labOrder(user.tenantId, orderId);
    if (o.status === 'CANCELLED') throw new BadRequestException('Order cancelled');
    if (o.labSpecimen && !o.labSpecimen.rejectedReason) throw new BadRequestException(`Specimen already collected (${o.labSpecimen.accession})`);
    const accession = await this.seq.next(user.tenantId, 'ACCESSION', 'LAB');
    let specimenType = dto.specimenType;
    if (!specimenType) {
      const code = o.description.split(':')[0];
      specimenType = (await this.prisma.labTest.findFirst({ where: { tenantId: user.tenantId, code } }))?.specimenType ?? undefined;
    }
    const data = { accession, specimenType, collectedAt: new Date(), collectedBy: user.sub, receivedAt: null, rejectedReason: null };
    const specimen = o.labSpecimen
      ? await this.prisma.labSpecimen.update({ where: { id: o.labSpecimen.id }, data })
      : await this.prisma.labSpecimen.create({ data: { ...data, tenantId: user.tenantId, orderId: o.id } });
    await this.prisma.order.update({ where: { id: o.id }, data: { status: 'IN_PROGRESS' } });
    return { ...specimen, label: { accession, patient: `${o.visit.patient.lastName}, ${o.visit.patient.firstName}`, mrn: o.visit.patient.mrn, test: o.description, collectedAt: specimen.collectedAt } };
  }

  async receive(user: AuthUser, orderId: string) {
    const o = await this.labOrder(user.tenantId, orderId);
    if (!o.labSpecimen) throw new BadRequestException('No specimen collected');
    return this.prisma.labSpecimen.update({ where: { id: o.labSpecimen.id }, data: { receivedAt: new Date() } });
  }

  async reject(user: AuthUser, orderId: string, reason: string) {
    const o = await this.labOrder(user.tenantId, orderId);
    if (!o.labSpecimen) throw new BadRequestException('No specimen collected');
    await this.prisma.order.update({ where: { id: o.id }, data: { status: 'REQUESTED' } });
    return this.prisma.labSpecimen.update({ where: { id: o.labSpecimen.id }, data: { rejectedReason: reason } });
  }

  async enterResults(user: AuthUser, orderId: string, dto: EnterResultsDto) {
    const t = user.tenantId;
    const o = await this.labOrder(t, orderId);
    if (['CANCELLED', 'VERIFIED'].includes(o.status)) throw new BadRequestException(`Order is ${o.status}`);
    if (!o.labSpecimen || o.labSpecimen.rejectedReason) throw new BadRequestException('Collect a valid specimen before entering results');
    const p = o.visit.patient;
    const age = ageInDays(p.dateOfBirth);
    const tests = await this.prisma.labTest.findMany({ where: { tenantId: t, code: { in: dto.results.map((r) => r.testCode) } } });
    const tm = new Map(tests.map((x) => [x.code, x]));
    const created = [];
    for (const r of dto.results) {
      const test = tm.get(r.testCode);
      const range = pickRange((test?.refRanges as RefRange[] | null) ?? undefined, p.sex, age);
      const { flag, isCritical } = flagResult(r.value, range);
      // replace any unverified prior result for the same analyte
      await this.prisma.labResult.deleteMany({ where: { tenantId: t, orderId: o.id, testCode: r.testCode, verifiedAt: null } });
      created.push(await this.prisma.labResult.create({
        data: { tenantId: t, orderId: o.id, testCode: r.testCode, value: r.value, unit: r.unit ?? test?.unit, flag, isCritical, enteredBy: user.sub, source: dto.source ?? 'MANUAL' },
      }));
    }
    await this.prisma.order.update({ where: { id: o.id }, data: { status: 'COMPLETED' } });
    const critical = created.filter((c) => c.isCritical);
    if (critical.length) {
      await this.audit.log({ tenantId: t, userId: user.sub, action: 'CRITICAL_RESULT', entity: 'Order', entityId: o.id, data: critical.map((c) => ({ test: c.testCode, value: c.value, flag: c.flag })) });
      await this.prisma.notification.create({ data: { tenantId: t, channel: 'IN_APP', to: o.orderedById ?? 'CLINICIAN', body: `CRITICAL: ${p.firstName} ${p.lastName} (${p.mrn}) ${critical.map((c) => `${c.testCode}=${c.value} ${c.flag}`).join(', ')}` } });
    }
    return { results: created, critical: critical.length > 0 };
  }

  /** Second-level validation and release. Verifier must differ from the person who entered results. */
  async verify(user: AuthUser, orderId: string) {
    const o = await this.labOrder(user.tenantId, orderId);
    if (o.status !== 'COMPLETED') throw new BadRequestException(`Order must be COMPLETED to verify (is ${o.status})`);
    if (!o.labResults.length) throw new BadRequestException('No results to verify');
    if (o.labResults.every((r) => r.enteredBy === user.sub) && !user.roles.includes('ADMIN')) throw new BadRequestException('Results must be verified by a different person');
    const now = new Date();
    await this.prisma.labResult.updateMany({ where: { tenantId: user.tenantId, orderId: o.id, verifiedAt: null }, data: { verifiedBy: user.sub, verifiedAt: now } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'VERIFY', entity: 'Order', entityId: o.id });
    return this.prisma.order.update({ where: { id: o.id }, data: { status: 'VERIFIED' }, include: { labResults: true } });
  }

  /** Cumulative results for a patient (trend view). */
  async patientResults(tenantId: string, patientId: string, testCode?: string) {
    return this.prisma.labResult.findMany({
      where: { tenantId, ...(testCode ? { testCode } : {}), order: { visit: { patientId } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
