import { Body, ConflictException, Controller, Get, Injectable, NotFoundException, Param, Post } from '@nestjs/common';
import { Equals, IsString, MinLength } from 'class-validator';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth-user';
import { decryptNoteFields } from '../common/field-crypto';

class AnonymiseDto {
  @IsString() @MinLength(10) reason: string;
  @IsString() @Equals('ANONYMISE') confirm: string;
}

/** Kenya Data Protection Act data-subject requests: access/portability (export) and erasure (anonymisation). */
@Injectable()
export class DataSubjectService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async patient(tenantId: string, id: string) {
    const p = await this.prisma.patient.findFirst({
      where: { id, tenantId },
      include: { allergies: true, consents: true, covers: true },
    });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  /** Full record as a FHIR-flavoured R4 collection Bundle (plus the native rows under `extension`). */
  async export(u: AuthUser, id: string) {
    const p = await this.patient(u.tenantId, id);
    const visits = await this.prisma.visit.findMany({
      where: { tenantId: u.tenantId, patientId: id },
      include: { triage: true, vitals: true, notes: true, diagnoses: true, orders: true, prescriptions: true, bills: { include: { lines: true, payments: true } } },
      orderBy: { startedAt: 'asc' },
    }) as any[];
    const entry: any[] = [];
    const ref = (t: string, i: string) => ({ reference: `${t}/${i}` });
    entry.push({ resource: {
      resourceType: 'Patient', id: p.id,
      identifier: [{ system: 'urn:jmsurf:mrn', value: p.mrn }, p.idNumber && { system: `urn:id:${p.idType ?? 'NATIONAL_ID'}`, value: p.idNumber }, p.shaNumber && { system: 'urn:sha', value: p.shaNumber }, p.crId && { system: 'urn:ke:cr', value: p.crId }].filter(Boolean),
      name: [{ family: p.lastName, given: [p.firstName, p.middleName].filter(Boolean) }],
      gender: { MALE: 'male', FEMALE: 'female', INTERSEX: 'other', UNKNOWN: 'unknown' }[p.sex],
      birthDate: p.dateOfBirth?.toISOString().slice(0, 10),
      telecom: [p.phone && { system: 'phone', value: p.phone }, p.email && { system: 'email', value: p.email }].filter(Boolean),
      address: [{ district: p.subCounty, state: p.county, city: p.village }],
      deceasedDateTime: p.deceasedAt ?? undefined,
      contact: p.nextOfKin ?? undefined,
    } });
    for (const a of p.allergies) entry.push({ resource: { resourceType: 'AllergyIntolerance', id: a.id, patient: ref('Patient', p.id), code: { text: a.substance }, reaction: [{ description: a.reaction, severity: a.severity?.toLowerCase() }] } });
    for (const c of p.consents) entry.push({ resource: { resourceType: 'Consent', id: c.id, patient: ref('Patient', p.id), status: c.granted ? 'active' : 'rejected', scope: { text: c.scope }, extension: c } });
    for (const c of p.covers) entry.push({ resource: { resourceType: 'Coverage', id: (c as any).id, beneficiary: ref('Patient', p.id), extension: c } });
    for (const v of visits) {
      entry.push({ resource: { resourceType: 'Encounter', id: v.id, subject: ref('Patient', p.id), class: { code: v.type }, status: v.status, period: { start: v.startedAt, end: v.endedAt }, identifier: [{ value: v.visitNumber }] } });
      for (const o of [...v.vitals, ...v.triage]) entry.push({ resource: { resourceType: 'Observation', id: o.id, encounter: ref('Encounter', v.id), subject: ref('Patient', p.id), category: [{ text: 'vital-signs' }], extension: o } });
      for (const d of v.diagnoses) entry.push({ resource: { resourceType: 'Condition', id: d.id, encounter: ref('Encounter', v.id), subject: ref('Patient', p.id), code: { coding: [{ system: 'http://id.who.int/icd/release/11/mms', code: d.code, display: d.display }] }, extension: d } });
      for (const n of v.notes) entry.push({ resource: { resourceType: 'DocumentReference', id: n.id, context: { encounter: [ref('Encounter', v.id)] }, subject: ref('Patient', p.id), type: { text: n.type }, securityLabel: n.sensitive ? [{ code: 'R' }] : [], extension: decryptNoteFields(n) } });
      for (const o of v.orders) entry.push({ resource: { resourceType: 'ServiceRequest', id: o.id, encounter: ref('Encounter', v.id), subject: ref('Patient', p.id), extension: o } });
      for (const rx of v.prescriptions) entry.push({ resource: { resourceType: 'MedicationRequest', id: rx.id, encounter: ref('Encounter', v.id), subject: ref('Patient', p.id), extension: rx } });
      for (const b of v.bills) entry.push({ resource: { resourceType: 'Invoice', id: b.id, subject: ref('Patient', p.id), extension: b } });
    }
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'DSR_EXPORT', entity: 'Patient', entityId: id, data: { resources: entry.length } });
    return { resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), meta: { source: 'JMSURF HMIS', tenantId: u.tenantId }, total: entry.length, entry };
  }

  /**
   * Erasure by anonymisation: direct identifiers are wiped, clinical/financial rows are kept for the statutory retention
   * period (they no longer identify the person). Refused while the patient is under legal hold
   * (tenant.settings.legalHoldPatientIds) or still has an open visit.
   */
  async anonymise(u: AuthUser, id: string, dto: AnonymiseDto) {
    const p = await this.patient(u.tenantId, id);
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { settings: true } });
    const settings = (t.settings ?? {}) as any;
    if ((settings.legalHoldPatientIds ?? []).includes(id)) throw new ConflictException('Patient record is under legal hold / retention flag; anonymisation refused');
    if (p.firstName === 'ANONYMISED') throw new ConflictException('Already anonymised');
    const open = await this.prisma.visit.count({ where: { tenantId: u.tenantId, patientId: id, status: { in: ['OPEN', 'IN_PROGRESS', 'ADMITTED'] } } });
    if (open) throw new ConflictException('Close the patient\'s open visits first');
    const token = createHash('sha256').update(`${u.tenantId}:${id}`).digest('hex').slice(0, 10).toUpperCase();
    await this.prisma.patient.update({
      where: { id },
      data: {
        firstName: 'ANONYMISED', middleName: null, lastName: `PATIENT-${token}`, crId: null, shaNumber: null, idType: null, idNumber: null,
        phone: null, email: null, village: null, subCounty: null, occupation: null, photoUrl: null, nextOfKin: undefined as any,
        dateOfBirth: p.dateOfBirth ? new Date(Date.UTC(p.dateOfBirth.getUTCFullYear(), 0, 1)) : null,
      },
    });
    await this.prisma.$executeRaw`UPDATE "Patient" SET "nextOfKin" = NULL WHERE id = ${id} AND "tenantId" = ${u.tenantId}`;
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'DSR_ANONYMISE', entity: 'Patient', entityId: id, data: { reason: dto.reason, retentionYears: settings.retentionYears ?? 10 } });
    return { id, anonymised: true, pseudonym: `PATIENT-${token}` };
  }
}

@Controller('privacy/patients')
export class DataSubjectController {
  constructor(private svc: DataSubjectService) {}
  @Get(':id/export') @Roles('ADMIN') export(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.export(u, id); }
  @Post(':id/anonymise') @Roles('ADMIN') anonymise(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AnonymiseDto) { return this.svc.anonymise(u, id, dto); }
}
