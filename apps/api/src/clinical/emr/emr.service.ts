import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { VisitsService } from '../visits/visits.service';
import { QueueService } from '../visits/queue.service';
import { news2Score } from './news2';
import { satsPriority, tewsToCategory } from './sats';
import { searchIcd11, ICD11_CODES } from './icd11-codes';
import { processSpecialtyForm } from './specialty-forms';
import { decryptNoteFields, encryptNoteFields } from '../../common/field-crypto';
import { BreakGlassService } from '../../platform/break-glass';
import { DiagnosisDto, NoteDto, SENSITIVE_SPECIALTIES, TriageDto, UpdateNoteDto, VitalsDto } from './emr.dto';

const SENSITIVE_ROLES = ['DOCTOR', 'CLINICAL_OFFICER'];

@Injectable()
export class EmrService {
  constructor(private prisma: PrismaService, private audit: AuditService, private visits: VisitsService, private queue: QueueService, private breakGlass: BreakGlassService) {}

  canSeeSensitive(user: AuthUser) {
    return user.isSuperAdmin || user.roles.includes('ADMIN') || user.roles.some((r) => SENSITIVE_ROLES.includes(r));
  }

  // ── Triage ──
  async triage(user: AuthUser, dto: TriageDto) {
    const v = await this.visits.mustBeActive(user.tenantId, dto.visitId);
    let category = dto.category ?? (dto.score != null ? tewsToCategory(dto.score) : undefined);
    if (!category) throw new BadRequestException('Provide a category or TEWS score');
    if (dto.emergencySign && !['RED', 'ORANGE'].includes(category)) category = 'ORANGE';
    const t = await this.prisma.triage.create({
      data: { tenantId: user.tenantId, visitId: v.id, scale: dto.scale ?? 'SATS', category, complaint: dto.complaint, score: dto.score, byUserId: user.sub },
    });
    const priority = satsPriority(category);
    await this.queue.reprioritise(user.tenantId, v.id, priority);
    if (category === 'RED' && v.type !== 'EMERGENCY') await this.prisma.visit.update({ where: { id: v.id }, data: { type: 'EMERGENCY' } });
    return { ...t, priority };
  }
  listTriage(tenantId: string, visitId: string) {
    return this.prisma.triage.findMany({ where: { tenantId, visitId }, orderBy: { createdAt: 'desc' } });
  }

  // ── Vitals ──
  async recordVitals(user: AuthUser, dto: VitalsDto) {
    const v = await this.visits.mustBeActive(user.tenantId, dto.visitId);
    const { onOxygen, consciousness, spo2Scale2, visitId, ...vals } = dto;
    const news = news2Score({ ...vals, onOxygen, consciousness, scale2: spo2Scale2 });
    const hasNewsInputs = [vals.respRate, vals.spo2, vals.systolic, vals.pulse, vals.temperatureC].some((x) => x != null);
    const row = await this.prisma.vitals.create({ data: { ...vals, tenantId: user.tenantId, visitId: v.id, news2: hasNewsInputs ? news.score : null, byUserId: user.sub } });
    const bmi = vals.weightKg && vals.heightCm ? Math.round((vals.weightKg / (vals.heightCm / 100) ** 2) * 10) / 10 : undefined;
    const alerts: string[] = [];
    if (news.risk === 'HIGH') alerts.push('NEWS2 ≥ 7: emergency response — urgent clinical review');
    else if (news.risk === 'MEDIUM') alerts.push('NEWS2 5–6: urgent ward-based response');
    else if (news.risk === 'LOW_MEDIUM') alerts.push('Single parameter scored 3: urgent ward-based review');
    if (vals.muacCm != null && vals.muacCm < 11.5) alerts.push('MUAC < 11.5 cm: severe acute malnutrition');
    if (vals.systolic && vals.systolic >= 180) alerts.push('Hypertensive urgency (SBP ≥ 180)');
    return { ...row, news2Risk: hasNewsInputs ? news.risk : null, bmi, alerts };
  }
  listVitals(tenantId: string, visitId: string) {
    return this.prisma.vitals.findMany({ where: { tenantId, visitId }, orderBy: { takenAt: 'asc' } });
  }

  // ── Notes ──
  async createNote(user: AuthUser, dto: NoteDto) {
    const v = await this.visits.mustBeActive(user.tenantId, dto.visitId);
    const sensitive = dto.sensitive ?? (dto.specialty ? SENSITIVE_SPECIALTIES.includes(dto.specialty) : false);
    if (sensitive && !this.canSeeSensitive(user)) throw new ForbiddenException('Only clinicians may record restricted notes');
    const data = processSpecialtyForm(dto.specialty, dto.data);
    const note = await this.prisma.clinicalNote.create({
      data: encryptNoteFields({
        tenantId: user.tenantId, visitId: v.id, type: dto.type ?? (dto.specialty && dto.specialty !== 'GENERAL' ? 'SPECIALTY' : 'SOAP'), specialty: dto.specialty,
        subjective: dto.subjective, objective: dto.objective, assessment: dto.assessment, plan: dto.plan, data: data as any,
        sensitive, aiDrafted: dto.aiDrafted ?? false, authorId: user.sub, signedAt: dto.sign ? new Date() : null,
      }, sensitive),
    });
    if (v.status === 'OPEN') await this.prisma.visit.update({ where: { id: v.id }, data: { status: 'IN_PROGRESS' } });
    if (sensitive) await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CREATE_SENSITIVE', entity: 'ClinicalNote', entityId: note.id });
    return decryptNoteFields(note);
  }

  /** Clinician roles, or anyone holding an active break-glass grant for the visit's patient. */
  private async canSeeSensitiveFor(user: AuthUser, visitId: string) {
    if (this.canSeeSensitive(user)) return { see: true, breakGlass: false };
    const v = await this.prisma.visit.findFirst({ where: { id: visitId, tenantId: user.tenantId }, select: { patientId: true } });
    const bg = !!v && (await this.breakGlass.hasActive(user.tenantId, user.sub, v.patientId));
    return { see: bg, breakGlass: bg };
  }

  async listNotes(user: AuthUser, visitId: string) {
    const notes = await this.prisma.clinicalNote.findMany({ where: { tenantId: user.tenantId, visitId }, orderBy: { createdAt: 'desc' } });
    const { see, breakGlass } = notes.some((n) => n.sensitive) ? await this.canSeeSensitiveFor(user, visitId) : { see: true, breakGlass: false };
    const visible = notes.filter((n) => see || !n.sensitive).map((n) => decryptNoteFields(n));
    if (see && notes.some((n) => n.sensitive))
      await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: breakGlass ? 'READ_SENSITIVE_BREAK_GLASS' : 'READ_SENSITIVE', entity: 'ClinicalNote', data: { visitId } });
    return { data: visible, hiddenSensitive: notes.length - visible.length };
  }

  private async noteFor(user: AuthUser, id: string) {
    const n = await this.prisma.clinicalNote.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!n) throw new NotFoundException('Note not found');
    if (n.sensitive && !(await this.canSeeSensitiveFor(user, n.visitId)).see) throw new ForbiddenException('Restricted note');
    return n;
  }

  async updateNote(user: AuthUser, id: string, dto: UpdateNoteDto) {
    const n = await this.noteFor(user, id);
    if (n.signedAt) throw new BadRequestException('Signed notes cannot be edited; add an addendum note instead');
    if (n.authorId && n.authorId !== user.sub && !user.roles.includes('ADMIN')) throw new ForbiddenException('Only the author can edit this note');
    const data = dto.data ? processSpecialtyForm(n.specialty ?? undefined, dto.data) : undefined;
    const updated = await this.prisma.clinicalNote.update({ where: { id }, data: encryptNoteFields({ ...dto, data: data as any }, n.sensitive) });
    return decryptNoteFields(updated);
  }

  async signNote(user: AuthUser, id: string) {
    const n = await this.noteFor(user, id);
    if (n.signedAt) throw new BadRequestException('Already signed');
    const r = await this.prisma.clinicalNote.update({ where: { id }, data: { signedAt: new Date() } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'SIGN', entity: 'ClinicalNote', entityId: id });
    return decryptNoteFields(r);
  }

  // ── Diagnoses ──
  async addDiagnosis(user: AuthUser, dto: DiagnosisDto) {
    const v = await this.visits.mustGet(user.tenantId, dto.visitId);
    const sys = dto.codeSystem ?? 'ICD-11';
    let display = dto.display;
    if (!display) {
      const hit = ICD11_CODES.find((c) => (sys === 'ICD-11' ? c.code : c.icd10) === dto.code);
      if (!hit) throw new BadRequestException('Unknown code; supply display text');
      display = hit.title;
    }
    const type = dto.type ?? 'PRIMARY';
    if (type === 'PRIMARY') await this.prisma.diagnosis.updateMany({ where: { tenantId: user.tenantId, visitId: v.id, type: 'PRIMARY' }, data: { type: 'SECONDARY' } });
    return this.prisma.diagnosis.create({ data: { tenantId: user.tenantId, visitId: v.id, codeSystem: sys, code: dto.code, display, type } });
  }
  listDiagnoses(tenantId: string, visitId: string) {
    return this.prisma.diagnosis.findMany({ where: { tenantId, visitId }, orderBy: { createdAt: 'asc' } });
  }
  async removeDiagnosis(user: AuthUser, id: string) {
    const r = await this.prisma.diagnosis.deleteMany({ where: { id, tenantId: user.tenantId } });
    if (!r.count) throw new NotFoundException('Diagnosis not found');
    return { deleted: true };
  }

  /** Problem list: distinct diagnoses across all a patient's visits. */
  async problemList(tenantId: string, patientId: string) {
    const dx = await this.prisma.diagnosis.findMany({ where: { tenantId, visit: { patientId } }, orderBy: { createdAt: 'desc' } });
    const seen = new Map<string, (typeof dx)[number] & { occurrences: number }>();
    for (const d of dx) {
      const k = `${d.codeSystem}:${d.code}`;
      const e = seen.get(k);
      if (e) e.occurrences++;
      else seen.set(k, { ...d, occurrences: 1 });
    }
    return [...seen.values()];
  }

  searchIcd(q?: string, limit?: number) {
    return searchIcd11(q, limit);
  }
}
