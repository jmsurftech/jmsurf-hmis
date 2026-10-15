import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min,
} from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQueryDto, pageArgs } from '../shared';

export const ALL_ROLES = [
  'ADMIN', 'RECEPTION', 'TRIAGE_NURSE', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'LAB_TECH', 'RADIOGRAPHER', 'PHARMACIST',
  'CASHIER', 'CLAIMS_OFFICER', 'STOREKEEPER', 'PROCUREMENT', 'ACCOUNTANT', 'HR', 'MANAGER',
];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: 'Full tenant administration', RECEPTION: 'Registration, appointments, queues', TRIAGE_NURSE: 'Triage & vitals',
  NURSE: 'Nursing care, ward management', DOCTOR: 'Consultation, orders, prescribing', CLINICAL_OFFICER: 'Consultation, orders, prescribing',
  LAB_TECH: 'Laboratory processing & results', RADIOGRAPHER: 'Imaging & reports', PHARMACIST: 'Dispensing, pharmacy stock',
  CASHIER: 'Receipting & shifts', CLAIMS_OFFICER: 'Insurance/SHA claims', STOREKEEPER: 'Stores & inventory',
  PROCUREMENT: 'Requisitions & purchase orders', ACCOUNTANT: 'Finance & accounting', HR: 'Human resources & payroll',
  MANAGER: 'Dashboards & reports',
};

class TenantSettingsDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() kraPin?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) enabledModules?: string[];
  @IsOptional() settings?: Record<string, unknown>;
}

class FacilityDto {
  @IsString() name: string;
  @IsString() code: string;
  @IsOptional() @IsString() kmhflCode?: string;
  @IsOptional() @IsString() shaFacilityId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) level?: number;
  @IsOptional() @IsString() county?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
}
class UpdateFacilityDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() kmhflCode?: string;
  @IsOptional() @IsString() shaFacilityId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) level?: number;
  @IsOptional() @IsString() county?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
}

class DepartmentDto {
  @IsString() facilityId: string;
  @IsString() name: string;
  @IsString() type: string;
  @IsOptional() @IsString() costCentre?: string;
}
class UpdateDepartmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() costCentre?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsString() phone?: string;
  @IsArray() @ArrayNotEmpty() @IsIn(ALL_ROLES, { each: true }) roles: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) facilityIds?: string[];
}
class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsArray() @IsIn(ALL_ROLES, { each: true }) roles?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) facilityIds?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

class PractitionerDto {
  @IsString() userId: string;
  @IsString() cadre: string;
  @IsOptional() @IsString() regulator?: string;
  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsDateString() licenseExpiry?: string;
  @IsOptional() @IsString() hwrId?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) consultationFeeMinor?: number;
}
class UpdatePractitionerDto {
  @IsOptional() @IsString() cadre?: string;
  @IsOptional() @IsString() regulator?: string;
  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsDateString() licenseExpiry?: string;
  @IsOptional() @IsString() hwrId?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) consultationFeeMinor?: number;
}

class AuditQueryDto extends ListQueryDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

const userSelect = {
  id: true, tenantId: true, email: true, phone: true, firstName: true, lastName: true, roles: true, facilityIds: true,
  active: true, lastLoginAt: true, createdAt: true, practitioner: true,
} as const;

export function tempPassword() {
  return 'Tmp-' + randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, 'x') + '9!';
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ── Tenant settings
  getTenant(u: AuthUser) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
  }
  async updateTenant(u: AuthUser, dto: TenantSettingsDto) {
    const current = await this.getTenant(u);
    const data: any = { ...dto };
    if (dto.settings) data.settings = { ...(current.settings as object), ...dto.settings };
    const t = await this.prisma.tenant.update({ where: { id: u.tenantId }, data });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'UPDATE', entity: 'Tenant', entityId: u.tenantId, data: dto });
    return t;
  }

  // ── Facilities
  listFacilities(u: AuthUser) {
    return this.prisma.facility.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: 'asc' } });
  }
  async getFacility(u: AuthUser, id: string) {
    const f = await this.prisma.facility.findFirst({ where: { id, tenantId: u.tenantId }, include: { departments: true, wards: true, stores: true } });
    if (!f) throw new NotFoundException('Facility not found');
    return f;
  }
  async createFacility(u: AuthUser, dto: FacilityDto) {
    const f = await this.prisma.facility.create({ data: { ...dto, tenantId: u.tenantId } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'Facility', entityId: f.id });
    return f;
  }
  async updateFacility(u: AuthUser, id: string, dto: UpdateFacilityDto) {
    await this.getFacility(u, id);
    return this.prisma.facility.update({ where: { id }, data: dto });
  }

  // ── Departments
  listDepartments(u: AuthUser, facilityId?: string) {
    return this.prisma.department.findMany({ where: { tenantId: u.tenantId, ...(facilityId ? { facilityId } : {}) }, orderBy: { name: 'asc' } });
  }
  async createDepartment(u: AuthUser, dto: DepartmentDto) {
    await this.getFacility(u, dto.facilityId);
    return this.prisma.department.create({ data: { ...dto, tenantId: u.tenantId } });
  }
  async updateDepartment(u: AuthUser, id: string, dto: UpdateDepartmentDto) {
    const d = await this.prisma.department.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!d) throw new NotFoundException('Department not found');
    return this.prisma.department.update({ where: { id }, data: dto });
  }
  async deactivateDepartment(u: AuthUser, id: string) {
    return this.updateDepartment(u, id, { active: false });
  }

  // ── Users
  async listUsers(u: AuthUser, q: ListQueryDto & { role?: string }) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: any = { tenantId: u.tenantId };
    if (q.q) where.OR = ['email', 'firstName', 'lastName'].map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } }));
    if (q.role) where.roles = { has: q.role };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: userSelect, skip, take, orderBy: { lastName: 'asc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }
  async getUser(u: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId: u.tenantId }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
  async createUser(u: AuthUser, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('Email already registered');
    const temporaryPassword = tempPassword();
    let facilityIds = dto.facilityIds;
    if (!facilityIds?.length) facilityIds = (await this.listFacilities(u)).map((f) => f.id);
    const user = await this.prisma.user.create({
      data: {
        tenantId: u.tenantId, email, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone, roles: dto.roles,
        facilityIds, passwordHash: await bcrypt.hash(temporaryPassword, 10),
      },
      select: userSelect,
    });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'User', entityId: user.id, data: { roles: dto.roles } });
    return { user, temporaryPassword };
  }
  async updateUser(u: AuthUser, id: string, dto: UpdateUserDto) {
    await this.getUser(u, id);
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: userSelect });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'UPDATE', entity: 'User', entityId: id, data: dto });
    return user;
  }
  async deactivateUser(u: AuthUser, id: string) {
    if (id === u.sub) throw new BadRequestException('You cannot deactivate yourself');
    return this.updateUser(u, id, { active: false });
  }
  async resetPassword(u: AuthUser, id: string) {
    await this.getUser(u, id);
    const temporaryPassword = tempPassword();
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(temporaryPassword, 10) } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'RESET_PASSWORD', entity: 'User', entityId: id });
    return { temporaryPassword };
  }

  // ── Practitioners
  listPractitioners(u: AuthUser) {
    return this.prisma.practitioner.findMany({
      where: { tenantId: u.tenantId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, active: true } } },
    });
  }
  async createPractitioner(u: AuthUser, dto: PractitionerDto) {
    await this.getUser(u, dto.userId);
    return this.prisma.practitioner.create({
      data: { ...dto, tenantId: u.tenantId, licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined },
    });
  }
  async updatePractitioner(u: AuthUser, id: string, dto: UpdatePractitionerDto) {
    const p = await this.prisma.practitioner.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!p) throw new NotFoundException('Practitioner not found');
    return this.prisma.practitioner.update({
      where: { id }, data: { ...dto, licenseExpiry: dto.licenseExpiry ? new Date(dto.licenseExpiry) : undefined },
    });
  }
  /** Practitioners whose licence is expired or expires within `days` (or has no expiry on record). */
  async licenceAlerts(u: AuthUser, days = 60) {
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 86400000);
    const list = await this.prisma.practitioner.findMany({
      where: { tenantId: u.tenantId, OR: [{ licenseExpiry: null }, { licenseExpiry: { lte: horizon } }] },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { licenseExpiry: 'asc' },
    });
    return list.map((p) => ({
      ...p,
      alert: !p.licenseExpiry ? 'MISSING' : p.licenseExpiry < now ? 'EXPIRED' : 'EXPIRING',
      daysToExpiry: p.licenseExpiry ? Math.ceil((p.licenseExpiry.getTime() - now.getTime()) / 86400000) : null,
    }));
  }

  // ── Audit log
  async auditLog(u: AuthUser, q: AuditQueryDto) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: any = { tenantId: u.tenantId };
    for (const k of ['userId', 'action', 'entity', 'entityId'] as const) if (q[k]) where[k] = q[k];
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
    if (q.q) where.OR = [{ entity: { contains: q.q, mode: 'insensitive' } }, { action: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  roles() {
    return ALL_ROLES.map((code) => ({ code, description: ROLE_DESCRIPTIONS[code] }));
  }
}

@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private svc: AdminService) {}

  @Get('tenant') getTenant(@CurrentUser() u: AuthUser) { return this.svc.getTenant(u); }
  @Patch('tenant') updateTenant(@CurrentUser() u: AuthUser, @Body() dto: TenantSettingsDto) { return this.svc.updateTenant(u, dto); }

  @Get('facilities') @Roles('ADMIN', 'MANAGER') listFacilities(@CurrentUser() u: AuthUser) { return this.svc.listFacilities(u); }
  @Get('facilities/:id') getFacility(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getFacility(u, id); }
  @Post('facilities') createFacility(@CurrentUser() u: AuthUser, @Body() dto: FacilityDto) { return this.svc.createFacility(u, dto); }
  @Patch('facilities/:id') updateFacility(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateFacilityDto) { return this.svc.updateFacility(u, id, dto); }

  @Get('departments') @Roles('ADMIN', 'MANAGER', 'HR', 'ACCOUNTANT', 'RECEPTION', 'TRIAGE_NURSE', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER')
  listDepartments(@CurrentUser() u: AuthUser, @Query('facilityId') facilityId?: string) { return this.svc.listDepartments(u, facilityId); }
  @Post('departments') createDepartment(@CurrentUser() u: AuthUser, @Body() dto: DepartmentDto) { return this.svc.createDepartment(u, dto); }
  @Patch('departments/:id') updateDepartment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) { return this.svc.updateDepartment(u, id, dto); }
  @Delete('departments/:id') deleteDepartment(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deactivateDepartment(u, id); }

  @Get('users') listUsers(@CurrentUser() u: AuthUser, @Query() q: ListQueryDto, @Query('role') role?: string) { return this.svc.listUsers(u, { ...q, role }); }
  @Get('users/:id') getUser(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getUser(u, id); }
  @Post('users') createUser(@CurrentUser() u: AuthUser, @Body() dto: CreateUserDto) { return this.svc.createUser(u, dto); }
  @Patch('users/:id') updateUser(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) { return this.svc.updateUser(u, id, dto); }
  @Post('users/:id/deactivate') deactivateUser(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deactivateUser(u, id); }
  @Post('users/:id/reset-password') resetPassword(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.resetPassword(u, id); }

  @Get('practitioners') @Roles('ADMIN', 'HR', 'MANAGER', 'RECEPTION', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE') listPractitioners(@CurrentUser() u: AuthUser) { return this.svc.listPractitioners(u); }
  @Get('practitioners/licence-alerts') @Roles('ADMIN', 'HR', 'MANAGER')
  licenceAlerts(@CurrentUser() u: AuthUser, @Query('days') days?: string) { return this.svc.licenceAlerts(u, days ? Number(days) : 60); }
  @Post('practitioners') @Roles('ADMIN', 'HR') createPractitioner(@CurrentUser() u: AuthUser, @Body() dto: PractitionerDto) { return this.svc.createPractitioner(u, dto); }
  @Patch('practitioners/:id') @Roles('ADMIN', 'HR')
  updatePractitioner(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdatePractitionerDto) { return this.svc.updatePractitioner(u, id, dto); }

  @Get('audit') auditLog(@CurrentUser() u: AuthUser, @Query() q: AuditQueryDto) { return this.svc.auditLog(u, q); }
  @Get('roles') roles() { return this.svc.roles(); }
}

@Module({ providers: [AdminService], controllers: [AdminController], exports: [AdminService] })
export class AdminModule {}
