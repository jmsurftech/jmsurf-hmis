import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { NATIONAL_INSURANCE, NationalInsurancePort } from '../../integrations/ports';
import { paginate } from '../shared/pagination';
import { AllergyDto, ClientRegistryLookupDto, ConsentDto, CoverDto, CreatePatientDto, MergePatientsDto, SearchPatientsDto, UpdateCoverDto, UpdatePatientDto } from './patients.dto';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private seq: SequenceService,
    private audit: AuditService,
    @Inject(NATIONAL_INSURANCE) private nationalInsurance: NationalInsurancePort,
  ) {}

  private toData(dto: UpdatePatientDto) {
    const { nextOfKin, dateOfBirth, ...rest } = dto as UpdatePatientDto & { force?: boolean };
    delete (rest as any).force;
    return {
      ...rest,
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
      ...(nextOfKin !== undefined ? { nextOfKin: nextOfKin as unknown as Prisma.InputJsonValue } : {}),
    };
  }

  async findDuplicates(tenantId: string, dto: Partial<CreatePatientDto>) {
    const or: Prisma.PatientWhereInput[] = [];
    if (dto.idNumber) or.push({ idNumber: dto.idNumber });
    if (dto.crId) or.push({ crId: dto.crId });
    if (dto.phone && dto.firstName) or.push({ phone: dto.phone, firstName: { equals: dto.firstName, mode: 'insensitive' } });
    if (dto.firstName && dto.lastName && dto.dateOfBirth)
      or.push({ firstName: { equals: dto.firstName, mode: 'insensitive' }, lastName: { equals: dto.lastName, mode: 'insensitive' }, dateOfBirth: new Date(dto.dateOfBirth) });
    if (!or.length) return [];
    return this.prisma.patient.findMany({ where: { tenantId, mergedIntoId: null, OR: or }, take: 10 });
  }

  async register(user: AuthUser, dto: CreatePatientDto) {
    if (!dto.force) {
      const dups = await this.findDuplicates(user.tenantId, dto);
      if (dups.length) throw new ConflictException({ message: 'Possible duplicate patient(s) found; resend with force=true to register anyway', duplicates: dups });
    }
    const mrn = await this.seq.next(user.tenantId, 'MRN', 'MRN');
    const patient = await this.prisma.patient.create({ data: { ...(this.toData(dto) as any), tenantId: user.tenantId, mrn } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CREATE', entity: 'Patient', entityId: patient.id });
    return patient;
  }

  /** Quick anonymous/walk-in registration (OTC sales, newborns). */
  async registerMinimal(tenantId: string, data: Prisma.PatientUncheckedCreateInput | Omit<Prisma.PatientUncheckedCreateInput, 'tenantId' | 'mrn'>) {
    const mrn = await this.seq.next(tenantId, 'MRN', 'MRN');
    return this.prisma.patient.create({ data: { ...(data as any), tenantId, mrn } });
  }

  async search(tenantId: string, q: SearchPatientsDto) {
    const where: Prisma.PatientWhereInput = { tenantId, mergedIntoId: null };
    const and: Prisma.PatientWhereInput[] = [];
    if (q.phone) and.push({ phone: { contains: q.phone } });
    if (q.idNumber) and.push({ idNumber: q.idNumber });
    if (q.mrn) and.push({ mrn: { equals: q.mrn, mode: 'insensitive' } });
    if (q.q) {
      const terms = q.q.trim().split(/\s+/).filter(Boolean);
      for (const t of terms) {
        and.push({
          OR: [
            { firstName: { contains: t, mode: 'insensitive' } },
            { middleName: { contains: t, mode: 'insensitive' } },
            { lastName: { contains: t, mode: 'insensitive' } },
            { phone: { contains: t } },
            { idNumber: { equals: t } },
            { mrn: { contains: t, mode: 'insensitive' } },
            { crId: { equals: t } },
            { shaNumber: { equals: t } },
          ],
        });
      }
    }
    if (and.length) where.AND = and;
    return paginate(
      q,
      (skip, take) => this.prisma.patient.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      () => this.prisma.patient.count({ where }),
    );
  }

  async get(tenantId: string, id: string) {
    const p = await this.prisma.patient.findFirst({
      where: { id, tenantId },
      include: {
        allergies: true,
        consents: { orderBy: { createdAt: 'desc' } },
        covers: { include: { scheme: { include: { payer: true } } } },
        visits: { orderBy: { startedAt: 'desc' }, take: 50, include: { diagnoses: true, admission: true } },
      },
    });
    if (!p) throw new NotFoundException('Patient not found');
    if (p.mergedIntoId) return { ...p, mergedNotice: `Merged into ${p.mergedIntoId}` };
    return p;
  }

  async mustExist(tenantId: string, id: string) {
    const p = await this.prisma.patient.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  async update(user: AuthUser, id: string, dto: UpdatePatientDto) {
    await this.mustExist(user.tenantId, id);
    const p = await this.prisma.patient.update({ where: { id }, data: this.toData(dto) as any });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'UPDATE', entity: 'Patient', entityId: id, data: Object.keys(dto) });
    return p;
  }

  /** Merge duplicate into survivor: re-point all clinical records, fill blank demographics, mark duplicate merged. */
  async merge(user: AuthUser, dto: MergePatientsDto) {
    if (dto.survivorId === dto.duplicateId) throw new BadRequestException('Cannot merge a patient into itself');
    const t = user.tenantId;
    const survivor = await this.mustExist(t, dto.survivorId);
    const dup = await this.mustExist(t, dto.duplicateId);
    if (survivor.mergedIntoId || dup.mergedIntoId) throw new BadRequestException('One of the patients is already merged');
    const fill: Prisma.PatientUpdateInput = {};
    for (const k of ['crId', 'shaNumber', 'idType', 'idNumber', 'middleName', 'dateOfBirth', 'phone', 'email', 'county', 'subCounty', 'village', 'bloodGroup', 'photoUrl'] as const) {
      if (survivor[k] == null && dup[k] != null) (fill as any)[k] = dup[k];
    }
    const where = { tenantId: t, patientId: dup.id };
    const data = { patientId: survivor.id };
    await this.prisma.$transaction([
      this.prisma.visit.updateMany({ where, data }),
      this.prisma.allergy.updateMany({ where, data }),
      this.prisma.consent.updateMany({ where, data }),
      this.prisma.memberCover.updateMany({ where, data }),
      this.prisma.appointment.updateMany({ where, data }),
      this.prisma.pregnancy.updateMany({ where, data }),
      this.prisma.immunization.updateMany({ where, data }),
      this.prisma.dialysisSession.updateMany({ where, data }),
      this.prisma.homeCareVisit.updateMany({ where, data }),
      this.prisma.eligibilityCheck.updateMany({ where, data }),
      this.prisma.patient.update({ where: { id: survivor.id }, data: fill }),
      this.prisma.patient.update({ where: { id: dup.id }, data: { mergedIntoId: survivor.id, crId: null, idNumber: null } }),
    ]);
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'MERGE', entity: 'Patient', entityId: survivor.id, data: { merged: dup.id } });
    return this.get(t, survivor.id);
  }

  async addAllergy(user: AuthUser, patientId: string, dto: AllergyDto) {
    await this.mustExist(user.tenantId, patientId);
    return this.prisma.allergy.create({ data: { ...dto, tenantId: user.tenantId, patientId } });
  }
  async listAllergies(tenantId: string, patientId: string) {
    return this.prisma.allergy.findMany({ where: { tenantId, patientId } });
  }
  async removeAllergy(user: AuthUser, patientId: string, id: string) {
    const r = await this.prisma.allergy.deleteMany({ where: { id, patientId, tenantId: user.tenantId } });
    if (!r.count) throw new NotFoundException('Allergy not found');
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'DELETE', entity: 'Allergy', entityId: id });
    return { deleted: true };
  }

  async addConsent(user: AuthUser, patientId: string, dto: ConsentDto) {
    await this.mustExist(user.tenantId, patientId);
    const c = await this.prisma.consent.create({
      data: { ...dto, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined, tenantId: user.tenantId, patientId },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CONSENT', entity: 'Consent', entityId: c.id, data: dto });
    return c;
  }
  async listConsents(tenantId: string, patientId: string) {
    return this.prisma.consent.findMany({ where: { tenantId, patientId }, orderBy: { createdAt: 'desc' } });
  }

  async addCover(user: AuthUser, patientId: string, dto: CoverDto) {
    await this.mustExist(user.tenantId, patientId);
    const scheme = await this.prisma.scheme.findFirst({ where: { id: dto.schemeId, tenantId: user.tenantId } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    return this.prisma.memberCover.create({
      data: {
        ...dto, tenantId: user.tenantId, patientId,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      },
      include: { scheme: true },
    });
  }
  async listCovers(tenantId: string, patientId: string) {
    return this.prisma.memberCover.findMany({ where: { tenantId, patientId }, include: { scheme: { include: { payer: true } } } });
  }
  async updateCover(user: AuthUser, patientId: string, id: string, dto: UpdateCoverDto) {
    const c = await this.prisma.memberCover.findFirst({ where: { id, patientId, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException('Cover not found');
    return this.prisma.memberCover.update({
      where: { id },
      data: { ...dto, validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, validTo: dto.validTo ? new Date(dto.validTo) : undefined },
    });
  }

  /** Look up the national Client Registry; returns registry data plus any matching local patient. */
  async clientRegistryLookup(user: AuthUser, dto: ClientRegistryLookupDto) {
    const result = await this.nationalInsurance.lookupClient(dto.idType, dto.idNumber);
    const local = await this.prisma.patient.findFirst({
      where: { tenantId: user.tenantId, mergedIntoId: null, OR: [{ idNumber: dto.idNumber }, ...(result.crId ? [{ crId: result.crId }] : [])] },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CR_LOOKUP', entity: 'Patient', entityId: local?.id, data: { idType: dto.idType, found: result.found } });
    return { registry: result, localPatient: local };
  }

  /** Link an existing patient to their Client Registry record (fills crId / shaNumber). */
  async syncFromRegistry(user: AuthUser, id: string) {
    const p = await this.mustExist(user.tenantId, id);
    if (!p.idType || !p.idNumber) throw new BadRequestException('Patient has no identification document on file');
    const r = await this.nationalInsurance.lookupClient(p.idType, p.idNumber);
    if (!r.found) return { linked: false, registry: r };
    const updated = await this.prisma.patient.update({ where: { id }, data: { crId: r.crId ?? p.crId, shaNumber: r.shaNumber ?? p.shaNumber } });
    return { linked: true, patient: updated, registry: r };
  }
}
