import {
  BadRequestException, Body, Controller, Get, Header, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQueryDto, pageArgs, toCsv } from '../shared';
import { AccountingService } from '../finance/finance.module';
import { computePayslip, Payslip } from './kenya-payroll';

class AllowanceDto {
  @IsString() name: string;
  @Type(() => Number) @IsInt() @Min(0) amountMinor: number;
  /** true = post-tax deduction (HELB, SACCO, loan) rather than a taxable allowance */
  @IsOptional() @IsBoolean() deduction?: boolean;
}
class EmployeeDto {
  @IsString() staffNo: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() kraPin?: string;
  @IsOptional() @IsString() nssfNo?: string;
  @IsOptional() @IsString() shifNo?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designation?: string;
  @Type(() => Number) @IsInt() @Min(0) basicSalaryMinor: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AllowanceDto) allowances?: AllowanceDto[];
  @IsOptional() bankDetails?: Record<string, unknown>;
  @IsOptional() @IsDateString() hireDate?: string;
}
class UpdateEmployeeDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() kraPin?: string;
  @IsOptional() @IsString() nssfNo?: string;
  @IsOptional() @IsString() shifNo?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) basicSalaryMinor?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AllowanceDto) allowances?: AllowanceDto[];
  @IsOptional() bankDetails?: Record<string, unknown>;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
class LeaveDto {
  @IsString() employeeId: string;
  @IsIn(['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'STUDY', 'UNPAID']) type: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}
class LeaveDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) status: string;
}
class PayrollRunDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period: string;
}

export interface StoredPayslip extends Payslip {
  employeeId: string; staffNo: string; name: string; kraPin?: string | null; nssfNo?: string | null; shifNo?: string | null; idNumber?: string | null; department?: string | null;
}

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService, private audit: AuditService, private accounting: AccountingService) {}

  async employees(u: AuthUser, q: ListQueryDto & { active?: string }) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: any = { tenantId: u.tenantId };
    if (q.active !== undefined) where.active = q.active === 'true';
    if (q.q) where.OR = ['firstName', 'lastName', 'staffNo', 'department'].map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } }));
    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({ where, skip, take, orderBy: { staffNo: 'asc' } }),
      this.prisma.employee.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }
  async employee(u: AuthUser, id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!e) throw new NotFoundException('Employee not found');
    return e;
  }
  async createEmployee(u: AuthUser, dto: EmployeeDto) {
    const e = await this.prisma.employee.create({
      data: { ...dto, tenantId: u.tenantId, allowances: (dto.allowances ?? []) as any, bankDetails: dto.bankDetails as any, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined },
    });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'Employee', entityId: e.id });
    return e;
  }
  async updateEmployee(u: AuthUser, id: string, dto: UpdateEmployeeDto) {
    await this.employee(u, id);
    const e = await this.prisma.employee.update({
      where: { id },
      data: { ...dto, allowances: dto.allowances as any, bankDetails: dto.bankDetails as any, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined },
    });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'UPDATE', entity: 'Employee', entityId: id, data: { fields: Object.keys(dto) } });
    return e;
  }

  async leaves(u: AuthUser, status?: string, employeeId?: string) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: { tenantId: u.tenantId, ...(status ? { status } : {}), ...(employeeId ? { employeeId } : {}) }, orderBy: { createdAt: 'desc' },
    });
    const emps = await this.prisma.employee.findMany({ where: { tenantId: u.tenantId, id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, firstName: true, lastName: true, staffNo: true } });
    const byId = new Map(emps.map((e) => [e.id, e]));
    return rows.map((r) => ({ ...r, employee: byId.get(r.employeeId) ?? null, days: Math.round((r.endDate.getTime() - r.startDate.getTime()) / 86400000) + 1 }));
  }
  async requestLeave(u: AuthUser, dto: LeaveDto) {
    await this.employee(u, dto.employeeId);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) throw new BadRequestException('endDate is before startDate');
    return this.prisma.leaveRequest.create({ data: { tenantId: u.tenantId, employeeId: dto.employeeId, type: dto.type, startDate, endDate } });
  }
  async decideLeave(u: AuthUser, id: string, dto: LeaveDecisionDto) {
    const l = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!l) throw new NotFoundException('Leave request not found');
    if (l.status !== 'PENDING') throw new BadRequestException(`Leave already ${l.status}`);
    const r = await this.prisma.leaveRequest.update({ where: { id }, data: { status: dto.status } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: dto.status, entity: 'LeaveRequest', entityId: id });
    return r;
  }

  // ── Payroll
  async runPayroll(u: AuthUser, period: string) {
    const existing = await this.prisma.payrollRun.findUnique({ where: { tenantId_period: { tenantId: u.tenantId, period } } });
    if (existing && existing.status !== 'DRAFT') throw new BadRequestException(`Payroll for ${period} is already ${existing.status}`);
    const emps = await this.prisma.employee.findMany({ where: { tenantId: u.tenantId, active: true }, orderBy: { staffNo: 'asc' } });
    const payslips: StoredPayslip[] = emps.map((e) => {
      const items = (Array.isArray(e.allowances) ? e.allowances : []) as { name: string; amountMinor: number; deduction?: boolean }[];
      const slip = computePayslip({
        basicMinor: e.basicSalaryMinor,
        allowances: items.filter((a) => !a.deduction),
        otherDeductions: items.filter((a) => a.deduction),
      });
      return {
        employeeId: e.id, staffNo: e.staffNo, name: `${e.firstName} ${e.lastName}`, kraPin: e.kraPin, nssfNo: e.nssfNo, shifNo: e.shifNo,
        idNumber: e.idNumber, department: e.department, ...slip,
      };
    });
    const run = await this.prisma.payrollRun.upsert({
      where: { tenantId_period: { tenantId: u.tenantId, period } },
      create: { tenantId: u.tenantId, period, payslips: payslips as any },
      update: { payslips: payslips as any },
    });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'PayrollRun', entityId: run.id, data: { period, count: payslips.length } });
    return { ...run, summary: this.summary(payslips) };
  }

  summary(slips: StoredPayslip[]) {
    const s = (k: keyof Payslip) => slips.reduce((t, p) => t + (p[k] as number), 0);
    return {
      employees: slips.length, grossMinor: s('grossMinor'), payeMinor: s('payeMinor'), nssfMinor: s('nssfMinor'), shifMinor: s('shifMinor'),
      housingLevyMinor: s('housingLevyMinor'), otherDeductionsMinor: s('otherDeductionsMinor'), netPayMinor: s('netPayMinor'),
      employerNssfMinor: s('employerNssfMinor'), employerHousingLevyMinor: s('employerHousingLevyMinor'),
    };
  }

  async runs(u: AuthUser) {
    const rows = await this.prisma.payrollRun.findMany({ where: { tenantId: u.tenantId }, orderBy: { period: 'desc' } });
    return rows.map(({ payslips, ...r }) => ({ ...r, summary: this.summary(payslips as unknown as StoredPayslip[]) }));
  }
  async run(u: AuthUser, period: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { tenantId_period: { tenantId: u.tenantId, period } } });
    if (!run) throw new NotFoundException('Payroll run not found');
    return { ...run, payslips: run.payslips as unknown as StoredPayslip[], summary: this.summary(run.payslips as unknown as StoredPayslip[]) };
  }
  async payslip(u: AuthUser, period: string, employeeId: string) {
    const run = await this.run(u, period);
    const p = run.payslips.find((x) => x.employeeId === employeeId);
    if (!p) throw new NotFoundException('Payslip not found');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: u.tenantId }, select: { name: true, kraPin: true } });
    return { employer: tenant, period, status: run.status, ...p };
  }

  /** Approve a payroll run and post the payroll journal to the GL. */
  async approve(u: AuthUser, period: string) {
    const run = await this.run(u, period);
    if (run.status !== 'DRAFT') throw new BadRequestException(`Payroll already ${run.status}`);
    const s = run.summary;
    if (s.grossMinor > 0) {
      await this.accounting.post({
        tenantId: u.tenantId, sourceType: 'PAYROLL', sourceId: run.id, reference: `PAYROLL-${period}`, memo: `Payroll ${period}`, postedBy: u.sub,
        lines: [
          { accountCode: '6000', debitMinor: s.grossMinor, creditMinor: 0 },
          { accountCode: '6010', debitMinor: s.employerNssfMinor + s.employerHousingLevyMinor, creditMinor: 0 },
          { accountCode: '2200', debitMinor: 0, creditMinor: s.payeMinor },
          { accountCode: '2210', debitMinor: 0, creditMinor: s.nssfMinor + s.employerNssfMinor },
          { accountCode: '2220', debitMinor: 0, creditMinor: s.shifMinor },
          { accountCode: '2230', debitMinor: 0, creditMinor: s.housingLevyMinor + s.employerHousingLevyMinor },
          { accountCode: '2400', debitMinor: 0, creditMinor: s.otherDeductionsMinor },
          { accountCode: '2300', debitMinor: 0, creditMinor: s.netPayMinor },
        ],
      });
    }
    const r = await this.prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'APPROVED' } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'APPROVE', entity: 'PayrollRun', entityId: run.id });
    return r;
  }

  /** P10-style monthly return (iTax upload layout simplified): one row per employee. */
  async p10Csv(u: AuthUser, period: string) {
    const run = await this.run(u, period);
    const K = (m: number) => (m / 100).toFixed(2);
    return toCsv(run.payslips.map((p) => ({
      'PIN of Employee': p.kraPin ?? '', 'Name of Employee': p.name, 'Staff No': p.staffNo, 'ID Number': p.idNumber ?? '',
      'Residential Status': 'Resident', 'Type of Employee': 'Primary Employee',
      'Basic Salary': K(p.basicMinor), 'Allowances': K(p.allowancesMinor), 'Gross Pay': K(p.grossMinor),
      'NSSF': K(p.nssfMinor), 'SHIF': K(p.shifMinor), 'Housing Levy': K(p.housingLevyMinor),
      'Taxable Pay': K(p.taxablePayMinor), 'Tax Charged': K(p.taxBeforeReliefMinor), 'Personal Relief': K(p.personalReliefMinor),
      'PAYE Tax': K(p.payeMinor), 'Net Pay': K(p.netPayMinor),
    })));
  }
}

@Controller('hr')
@Roles('HR')
export class HrController {
  constructor(private svc: HrService) {}

  @Get('employees') @Roles('HR', 'MANAGER', 'ACCOUNTANT')
  employees(@CurrentUser() u: AuthUser, @Query() q: ListQueryDto, @Query('active') active?: string) { return this.svc.employees(u, { ...q, active }); }
  @Get('employees/:id') employee(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.employee(u, id); }
  @Post('employees') createEmployee(@CurrentUser() u: AuthUser, @Body() dto: EmployeeDto) { return this.svc.createEmployee(u, dto); }
  @Patch('employees/:id') updateEmployee(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) { return this.svc.updateEmployee(u, id, dto); }

  @Get('leave') @Roles('HR', 'MANAGER') leaves(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('employeeId') employeeId?: string) { return this.svc.leaves(u, status, employeeId); }
  @Post('leave') @Roles('HR', 'MANAGER') requestLeave(@CurrentUser() u: AuthUser, @Body() dto: LeaveDto) { return this.svc.requestLeave(u, dto); }
  @Post('leave/:id/decision') @Roles('HR', 'MANAGER') decideLeave(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LeaveDecisionDto) { return this.svc.decideLeave(u, id, dto); }

  @Get('payroll') @Roles('HR', 'ACCOUNTANT') runs(@CurrentUser() u: AuthUser) { return this.svc.runs(u); }
  @Post('payroll/run') runPayroll(@CurrentUser() u: AuthUser, @Body() dto: PayrollRunDto) { return this.svc.runPayroll(u, dto.period); }
  @Get('payroll/:period') @Roles('HR', 'ACCOUNTANT') run(@CurrentUser() u: AuthUser, @Param('period') period: string) { return this.svc.run(u, period); }
  @Post('payroll/:period/approve') @Roles('HR', 'ACCOUNTANT') approve(@CurrentUser() u: AuthUser, @Param('period') period: string) { return this.svc.approve(u, period); }
  @Get('payroll/:period/payslips/:employeeId') payslip(@CurrentUser() u: AuthUser, @Param('period') period: string, @Param('employeeId') employeeId: string) {
    return this.svc.payslip(u, period, employeeId);
  }
  @Get('payroll/:period/p10.csv') @Roles('HR', 'ACCOUNTANT') @Header('Content-Type', 'text/csv')
  p10(@CurrentUser() u: AuthUser, @Param('period') period: string) { return this.svc.p10Csv(u, period); }
}

@Module({ providers: [HrService], controllers: [HrController] })
export class HrModule {}
