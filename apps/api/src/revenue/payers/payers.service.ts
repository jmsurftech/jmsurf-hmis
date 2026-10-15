import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { NATIONAL_INSURANCE, NationalInsurancePort } from '../../integrations/ports';
import { withTenant } from '../../integrations/integration-context';
import { ListQuery, pageArgs, paged } from '../list-query';
import { ClientLookupDto, EligibilityDto, PayerDto, SchemeDto, UpdatePayerDto, UpdateSchemeDto } from './payers.dto';

export const SHA_PAYER_CODE = 'SHA';

@Injectable()
export class PayersService {
  constructor(private prisma: PrismaService, @Inject(NATIONAL_INSURANCE) private nhi: NationalInsurancePort) {}

  /** Every Kenyan tenant gets an SHA payer (with PHC/SHIF/ECCIF schemes) on first access. */
  async ensureShaPayer(tenantId: string) {
    const existing = await this.prisma.payer.findFirst({ where: { tenantId, type: 'SHA' }, include: { schemes: true } });
    if (existing) return existing;
    return this.prisma.payer.create({
      data: {
        tenantId, name: 'Social Health Authority', type: 'SHA', code: SHA_PAYER_CODE, integration: 'sha-hie',
        schemes: { create: ['PHC', 'SHIF', 'ECCIF'].map((f) => ({ tenantId, name: `SHA ${f}` })) },
      },
      include: { schemes: true },
    });
  }

  async listPayers(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (t?.countryCode === 'KE') await this.ensureShaPayer(tenantId);
    return this.prisma.payer.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, include: { schemes: true } });
  }
  async getPayer(tenantId: string, id: string) {
    const p = await this.prisma.payer.findFirst({ where: { id, tenantId }, include: { schemes: true } });
    if (!p) throw new NotFoundException('Payer not found');
    return p;
  }
  async createPayer(tenantId: string, dto: PayerDto) {
    if (dto.type === 'SHA' && (await this.prisma.payer.findFirst({ where: { tenantId, type: 'SHA' } }))) throw new BadRequestException('SHA payer already exists');
    return this.prisma.payer.create({ data: { ...dto, config: (dto.config ?? {}) as any, tenantId } });
  }
  async updatePayer(tenantId: string, id: string, dto: UpdatePayerDto) {
    await this.getPayer(tenantId, id);
    return this.prisma.payer.update({ where: { id }, data: { ...dto, config: dto.config as any } });
  }
  async deletePayer(tenantId: string, id: string) {
    const p = await this.getPayer(tenantId, id);
    if (p.type === 'SHA') throw new BadRequestException('The SHA payer cannot be deleted');
    if (await this.prisma.claim.count({ where: { tenantId, payerId: id } })) throw new BadRequestException('Payer has claims; cannot delete');
    await this.prisma.scheme.deleteMany({ where: { payerId: id, tenantId } });
    await this.prisma.payer.delete({ where: { id } });
    return { deleted: true };
  }

  listSchemes(tenantId: string, payerId?: string) {
    return this.prisma.scheme.findMany({ where: { tenantId, ...(payerId ? { payerId } : {}) }, include: { payer: true }, orderBy: { name: 'asc' } });
  }
  async createScheme(tenantId: string, dto: SchemeDto) {
    await this.getPayer(tenantId, dto.payerId);
    return this.prisma.scheme.create({ data: { ...dto, tenantId } });
  }
  async updateScheme(tenantId: string, id: string, dto: UpdateSchemeDto) {
    if (!(await this.prisma.scheme.findFirst({ where: { id, tenantId } }))) throw new NotFoundException('Scheme not found');
    return this.prisma.scheme.update({ where: { id }, data: dto });
  }
  async deleteScheme(tenantId: string, id: string) {
    if (!(await this.prisma.scheme.findFirst({ where: { id, tenantId } }))) throw new NotFoundException('Scheme not found');
    if (await this.prisma.memberCover.count({ where: { schemeId: id } })) throw new BadRequestException('Scheme has member covers; cannot delete');
    await this.prisma.scheme.delete({ where: { id } });
    return { deleted: true };
  }

  // ── SHA packages (global master data)
  async listShaPackages(q: ListQuery & { fund?: string }) {
    const where: any = { active: true };
    if (q.fund) where.fund = q.fund;
    if (q.q) where.OR = [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      this.prisma.shaPackage.findMany({ where, orderBy: { code: 'asc' }, ...pageArgs(q) }),
      this.prisma.shaPackage.count({ where }),
    ]);
    return paged(data, total, q);
  }

  static loadSampleFile(): { _notice: string; version: string; packages: any[] } {
    const candidates = [
      join(__dirname, 'data', 'sha-packages.SAMPLE.json'),
      join(process.cwd(), 'src/revenue/payers/data/sha-packages.SAMPLE.json'),
      join(process.cwd(), 'apps/api/src/revenue/payers/data/sha-packages.SAMPLE.json'),
    ];
    const file = candidates.find((f) => existsSync(f));
    if (!file) throw new NotFoundException('Sample SHA package file not found');
    return JSON.parse(readFileSync(file, 'utf8'));
  }

  /** Load the SAMPLE package/tariff table (idempotent upsert by code). Not the official schedule. */
  async seedSamplePackages() {
    const data = PayersService.loadSampleFile();
    for (const p of data.packages) {
      const { code, ...rest } = p;
      await this.prisma.shaPackage.upsert({ where: { code }, update: rest, create: { code, ...rest } });
    }
    return { loaded: data.packages.length, version: data.version, notice: data._notice };
  }

  // ── SHA Client Registry & eligibility
  async clientLookup(tenantId: string, dto: ClientLookupDto) {
    const r = await withTenant(tenantId, () => this.nhi.lookupClient(dto.idType, dto.idNumber));
    if (r.found && dto.patientId) {
      const p = await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId } });
      if (!p) throw new NotFoundException('Patient not found');
      await this.prisma.patient.update({ where: { id: p.id }, data: { crId: r.crId, shaNumber: r.shaNumber ?? p.shaNumber, idType: p.idType ?? dto.idType, idNumber: p.idNumber ?? dto.idNumber } });
    }
    return r;
  }

  async checkEligibility(tenantId: string, dto: EligibilityDto) {
    const patient = await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const visit = dto.visitId ? await this.prisma.visit.findFirst({ where: { id: dto.visitId, tenantId } }) : null;
    if (dto.visitId && !visit) throw new NotFoundException('Visit not found');
    const facility = visit ? await this.prisma.facility.findFirst({ where: { id: visit.facilityId, tenantId } }) : null;
    const req = { crId: patient.crId ?? undefined, idNumber: patient.idNumber ?? undefined, facilityCode: facility?.shaFacilityId ?? facility?.kmhflCode ?? undefined, visitType: visit?.type };
    const res = await withTenant(tenantId, () => this.nhi.checkEligibility(req));
    const check = await this.prisma.eligibilityCheck.create({
      data: { tenantId, patientId: patient.id, payer: 'SHA', request: req as any, response: (res.raw ?? res) as any, eligible: res.eligible, fund: res.fund, reference: res.reference },
    });
    if (visit && res.eligible) {
      const sha = await this.ensureShaPayer(tenantId);
      const scheme = sha.schemes.find((s) => s.name === `SHA ${res.fund}`) ?? sha.schemes[0];
      await this.prisma.visit.update({ where: { id: visit.id }, data: { payerType: 'SHA', schemeId: scheme?.id, shaFund: res.fund, eligibilityRef: res.reference } });
    }
    return { ...res, checkId: check.id };
  }
}
