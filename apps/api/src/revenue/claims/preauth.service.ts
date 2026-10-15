import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NATIONAL_INSURANCE, NationalInsurancePort } from '../../integrations/ports';
import { withTenant } from '../../integrations/integration-context';
import { PayersService } from '../payers/payers.service';
import { pageArgs, paged } from '../list-query';
import { PreAuthDto, PreAuthListQuery, UpdatePreAuthDto } from './claims.dto';

@Injectable()
export class PreAuthService {
  constructor(private prisma: PrismaService, private audit: AuditService, private payers: PayersService, @Inject(NATIONAL_INSURANCE) private nhi: NationalInsurancePort) {}

  async list(tenantId: string, q: PreAuthListQuery) {
    const where: any = { tenantId };
    if (q.visitId) where.visitId = q.visitId;
    if (q.status) where.status = q.status;
    if (q.q) where.OR = [{ description: { contains: q.q, mode: 'insensitive' } }, { interventionCode: { contains: q.q, mode: 'insensitive' } }, { externalRef: q.q }];
    const [data, total] = await Promise.all([this.prisma.preAuth.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }), this.prisma.preAuth.count({ where })]);
    return paged(data, total, q);
  }
  async get(tenantId: string, id: string) {
    const p = await this.prisma.preAuth.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Pre-authorisation not found');
    return p;
  }
  async create(tenantId: string, userId: string, dto: PreAuthDto) {
    const visit = await this.prisma.visit.findFirst({ where: { id: dto.visitId, tenantId } });
    if (!visit) throw new NotFoundException('Visit not found');
    let payerId = dto.payerId;
    if (payerId) await this.payers.getPayer(tenantId, payerId);
    else if (visit.schemeId) payerId = (await this.prisma.scheme.findFirst({ where: { id: visit.schemeId, tenantId } }))?.payerId;
    if (!payerId) payerId = (await this.payers.ensureShaPayer(tenantId)).id;
    const p = await this.prisma.preAuth.create({ data: { tenantId, visitId: visit.id, payerId, interventionCode: dto.interventionCode, description: dto.description, amountMinor: dto.amountMinor } });
    await this.audit.log({ tenantId, userId, action: 'CREATE', entity: 'PreAuth', entityId: p.id });
    return p;
  }
  async update(tenantId: string, userId: string, id: string, dto: UpdatePreAuthDto) {
    const p = await this.get(tenantId, id);
    if (dto.status === undefined && p.status !== 'DRAFT') throw new BadRequestException('Only draft pre-auths can be edited');
    const res = await this.prisma.preAuth.update({ where: { id }, data: dto });
    await this.audit.log({ tenantId, userId, action: 'UPDATE', entity: 'PreAuth', entityId: id, data: dto });
    return res;
  }
  async remove(tenantId: string, id: string) {
    const p = await this.get(tenantId, id);
    if (p.status !== 'DRAFT') throw new BadRequestException('Only draft pre-auths can be deleted');
    await this.prisma.preAuth.delete({ where: { id } });
    return { deleted: true };
  }
  async submit(tenantId: string, userId: string, id: string) {
    const p = await this.get(tenantId, id);
    if (!['DRAFT', 'REJECTED'].includes(p.status)) throw new BadRequestException(`Pre-auth is ${p.status}`);
    if (!p.interventionCode) throw new BadRequestException('interventionCode is required');
    const visit = await this.prisma.visit.findFirstOrThrow({ where: { id: p.visitId, tenantId }, include: { patient: true, diagnoses: true } });
    if (!visit.patient.crId) throw new BadRequestException('Patient has no Client Registry ID; verify the patient first');
    const facility = await this.prisma.facility.findFirstOrThrow({ where: { id: visit.facilityId, tenantId } });
    const res = await withTenant(tenantId, () => this.nhi.requestPreAuth({
      crId: visit.patient.crId!, facilityCode: facility.shaFacilityId ?? facility.kmhflCode ?? facility.code,
      interventionCode: p.interventionCode!, amountMinor: p.amountMinor, diagnosis: visit.diagnoses.map((d) => d.code), notes: p.description,
    }));
    const updated = await this.prisma.preAuth.update({
      where: { id }, data: { status: res.status, externalRef: res.externalRef, approvedMinor: res.approvedMinor, response: (res.raw ?? res) as any },
    });
    await this.audit.log({ tenantId, userId, action: 'SUBMIT', entity: 'PreAuth', entityId: id, data: { status: res.status } });
    return updated;
  }
}
