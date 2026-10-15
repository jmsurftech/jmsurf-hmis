import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQueryDto, pageArgs } from '../shared';

const SEVERITIES = ['NEAR_MISS', 'LOW', 'MODERATE', 'SEVERE', 'DEATH'];

class IncidentDto {
  @IsDateString() occurredAt: string;
  @IsString() category: string;
  @IsIn(SEVERITIES) severity: string;
  @IsString() description: string;
  @IsOptional() @IsString() facilityId?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() patientId?: string;
}
class InvestigateDto {
  @IsOptional() @IsString() investigatorId?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsIn(SEVERITIES) severity?: string;
}
class CloseIncidentDto {
  @IsString() findings: string;
  @IsString() actions: string;
}
class ComplaintDto {
  @IsString() complainant: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsIn(['IN_PERSON', 'PHONE', 'EMAIL', 'SMS', 'SUGGESTION_BOX']) channel?: string;
  @IsOptional() @IsIn(['SERVICE', 'BILLING', 'CLINICAL', 'STAFF_CONDUCT', 'FACILITY', 'OTHER']) category?: string;
  @IsString() description: string;
}
class UpdateComplaintDto {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() resolution?: string;
}

@Injectable()
export class QualityService {
  constructor(private prisma: PrismaService, private seq: SequenceService, private audit: AuditService) {}

  async incidents(u: AuthUser, q: ListQueryDto & { status?: string; severity?: string }) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: any = { tenantId: u.tenantId };
    if (q.status) where.status = q.status;
    if (q.severity) where.severity = q.severity;
    if (q.q) where.OR = [{ description: { contains: q.q, mode: 'insensitive' } }, { number: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      this.prisma.incident.findMany({ where, skip, take, orderBy: { occurredAt: 'desc' } }),
      this.prisma.incident.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }
  async incident(u: AuthUser, id: string) {
    const i = await this.prisma.incident.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!i) throw new NotFoundException('Incident not found');
    return i;
  }
  async report(u: AuthUser, dto: IncidentDto) {
    const number = await this.seq.next(u.tenantId, 'INCIDENT', 'INC');
    const i = await this.prisma.incident.create({ data: { ...dto, occurredAt: new Date(dto.occurredAt), tenantId: u.tenantId, number, reportedById: u.sub } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'Incident', entityId: i.id });
    return i;
  }
  async investigate(u: AuthUser, id: string, dto: InvestigateDto) {
    const i = await this.incident(u, id);
    if (i.status === 'CLOSED') throw new BadRequestException('Incident is closed');
    return this.prisma.incident.update({ where: { id }, data: { ...dto, investigatorId: dto.investigatorId ?? u.sub, status: 'INVESTIGATING' } });
  }
  async close(u: AuthUser, id: string, dto: CloseIncidentDto) {
    const i = await this.incident(u, id);
    if (i.status === 'CLOSED') throw new BadRequestException('Incident already closed');
    const r = await this.prisma.incident.update({ where: { id }, data: { ...dto, status: 'CLOSED', closedAt: new Date() } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CLOSE', entity: 'Incident', entityId: id });
    return r;
  }

  async complaints(u: AuthUser, q: ListQueryDto & { status?: string }) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: any = { tenantId: u.tenantId };
    if (q.status) where.status = q.status;
    if (q.q) where.OR = [{ description: { contains: q.q, mode: 'insensitive' } }, { complainant: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      this.prisma.complaint.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.complaint.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }
  async createComplaint(u: AuthUser, dto: ComplaintDto) {
    const number = await this.seq.next(u.tenantId, 'COMPLAINT', 'CMP');
    return this.prisma.complaint.create({ data: { ...dto, tenantId: u.tenantId, number } });
  }
  async updateComplaint(u: AuthUser, id: string, dto: UpdateComplaintDto) {
    const c = await this.prisma.complaint.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!c) throw new NotFoundException('Complaint not found');
    const resolved = dto.status === 'RESOLVED' || dto.status === 'CLOSED';
    if (resolved && !(dto.resolution ?? c.resolution)) throw new BadRequestException('A resolution is required');
    return this.prisma.complaint.update({ where: { id }, data: { ...dto, resolvedAt: resolved && !c.resolvedAt ? new Date() : undefined } });
  }
}

@Controller('quality')
export class QualityController {
  constructor(private svc: QualityService) {}
  @Get('incidents') @Roles('MANAGER')
  incidents(@CurrentUser() u: AuthUser, @Query() q: ListQueryDto, @Query('status') status?: string, @Query('severity') severity?: string) {
    return this.svc.incidents(u, { ...q, status, severity });
  }
  @Get('incidents/:id') @Roles('MANAGER') incident(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.incident(u, id); }
  /** Any authenticated staff member may report an incident. */
  @Post('incidents') report(@CurrentUser() u: AuthUser, @Body() dto: IncidentDto) { return this.svc.report(u, dto); }
  @Post('incidents/:id/investigate') @Roles('MANAGER') investigate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: InvestigateDto) { return this.svc.investigate(u, id, dto); }
  @Post('incidents/:id/close') @Roles('MANAGER') close(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CloseIncidentDto) { return this.svc.close(u, id, dto); }

  @Get('complaints') @Roles('MANAGER', 'RECEPTION')
  complaints(@CurrentUser() u: AuthUser, @Query() q: ListQueryDto, @Query('status') status?: string) { return this.svc.complaints(u, { ...q, status }); }
  @Post('complaints') createComplaint(@CurrentUser() u: AuthUser, @Body() dto: ComplaintDto) { return this.svc.createComplaint(u, dto); }
  @Patch('complaints/:id') @Roles('MANAGER') updateComplaint(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.svc.updateComplaint(u, id, dto);
  }
}

@Module({ providers: [QualityService], controllers: [QualityController] })
export class QualityModule {}
