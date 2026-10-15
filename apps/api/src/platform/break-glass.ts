import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth-user';

export class BreakGlassDto {
  @IsString() @MinLength(15) reason: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240) minutes?: number;
}
class ReviewDto { @IsOptional() @IsString() note?: string }

/** Emergency ("break-glass") access to restricted records: reason required, time-limited, audited, reviewed by an admin. */
@Injectable()
export class BreakGlassService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async request(u: AuthUser, dto: BreakGlassDto) {
    if (dto.patientId && !(await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId: u.tenantId }, select: { id: true } }))) {
      throw new NotFoundException('Patient not found');
    }
    const minutes = dto.minutes ?? 60;
    const g = await this.prisma.breakGlassGrant.create({
      data: { tenantId: u.tenantId, userId: u.sub, patientId: dto.patientId, reason: dto.reason, expiresAt: new Date(Date.now() + minutes * 60000) },
    });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'BREAK_GLASS', entity: 'Patient', entityId: dto.patientId, data: { grantId: g.id, reason: dto.reason, minutes } });
    return g;
  }

  /** True if the user holds an unexpired grant for this patient (or a patient-agnostic grant). */
  async hasActive(tenantId: string, userId: string, patientId?: string | null) {
    const g = await this.prisma.breakGlassGrant.findFirst({
      where: { tenantId, userId, expiresAt: { gt: new Date() }, OR: [{ patientId: null }, ...(patientId ? [{ patientId }] : [])] },
      select: { id: true },
    });
    return !!g;
  }

  active(u: AuthUser) {
    return this.prisma.breakGlassGrant.findMany({ where: { tenantId: u.tenantId, userId: u.sub, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  }

  async list(u: AuthUser, reviewed?: string) {
    const where: any = { tenantId: u.tenantId };
    if (reviewed === 'false') where.reviewedAt = null;
    if (reviewed === 'true') where.reviewedAt = { not: null };
    const data = await this.prisma.breakGlassGrant.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    const users = await this.prisma.user.findMany({ where: { tenantId: u.tenantId, id: { in: [...new Set(data.map((d) => d.userId))] } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const patients = await this.prisma.patient.findMany({ where: { tenantId: u.tenantId, id: { in: data.map((d) => d.patientId).filter(Boolean) as string[] } }, select: { id: true, firstName: true, lastName: true, mrn: true } });
    return { data: data.map((d) => ({ ...d, user: users.find((x) => x.id === d.userId), patient: patients.find((p) => p.id === d.patientId) ?? null })), total: data.length, page: 1, pageSize: 200 };
  }

  async review(u: AuthUser, id: string, note?: string) {
    const g = await this.prisma.breakGlassGrant.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!g) throw new NotFoundException('Grant not found');
    if (g.reviewedAt) throw new BadRequestException('Already reviewed');
    const r = await this.prisma.breakGlassGrant.update({ where: { id }, data: { reviewedAt: new Date(), reviewedBy: u.sub, reviewNote: note } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'BREAK_GLASS_REVIEWED', entity: 'BreakGlassGrant', entityId: id, data: { note } });
    return r;
  }
}

@Controller('security/break-glass')
export class BreakGlassController {
  constructor(private svc: BreakGlassService) {}
  @Post() request(@CurrentUser() u: AuthUser, @Body() dto: BreakGlassDto) { return this.svc.request(u, dto); }
  @Get('active') active(@CurrentUser() u: AuthUser) { return this.svc.active(u); }
  @Get() @Roles('ADMIN') list(@CurrentUser() u: AuthUser, @Query('reviewed') reviewed?: string) { return this.svc.list(u, reviewed); }
  @Post(':id/review') @Roles('ADMIN') review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) { return this.svc.review(u, id, dto.note); }
}
