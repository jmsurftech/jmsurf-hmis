import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { PageQueryDto } from '../shared/pagination';
import { OrdersService } from './orders.service';
import { LabService } from './lab.service';
import { RadiologyService } from './radiology.service';
import { CollectSpecimenDto, CreateOrderDto, EnterResultsDto, ImagingReportDto, LabTestDto, OrderQueryDto, RejectSpecimenDto, UpdateLabTestDto, WorklistQueryDto } from './orders.dto';

class ReasonDto { @IsOptional() @IsString() reason?: string }
class TestCodeQuery { @IsOptional() @IsString() testCode?: string }
const CLIN = ['DOCTOR', 'CLINICAL_OFFICER'];

@ApiTags('orders') @ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private svc: OrdersService) {}
  @Post() @Roles(...CLIN, 'NURSE') create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrderDto) { return this.svc.create(u, dto); }
  @Get() @Roles(...CLIN, 'NURSE', 'LAB_TECH', 'RADIOGRAPHER', 'CASHIER') list(@CurrentUser() u: AuthUser, @Query() q: OrderQueryDto) { return this.svc.list(u.tenantId, q); }
  @Get(':id') @Roles(...CLIN, 'NURSE', 'LAB_TECH', 'RADIOGRAPHER') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.tenantId, id); }
  @Post(':id/cancel') @Roles(...CLIN) cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.svc.cancel(u, id, dto.reason); }
  @Post(':id/complete') @Roles(...CLIN, 'NURSE') complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.svc.completeProcedure(u, id, dto.reason); }
}

@ApiTags('lab') @ApiBearerAuth()
@Controller('lab')
export class LabController {
  constructor(private svc: LabService) {}
  @Post('tests') @Roles('LAB_TECH', 'MANAGER') createTest(@CurrentUser() u: AuthUser, @Body() dto: LabTestDto) { return this.svc.createTest(u, dto); }
  @Get('tests') listTests(@CurrentUser() u: AuthUser, @Query() q: PageQueryDto) { return this.svc.listTests(u.tenantId, q); }
  @Get('tests/:id') getTest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getTest(u.tenantId, id); }
  @Patch('tests/:id') @Roles('LAB_TECH', 'MANAGER') updateTest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLabTestDto) { return this.svc.updateTest(u, id, dto); }
  @Delete('tests/:id') @Roles('MANAGER') deleteTest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteTest(u, id); }

  @Get('worklist') @Roles('LAB_TECH') worklist(@CurrentUser() u: AuthUser, @Query() q: WorklistQueryDto) { return this.svc.worklist(u.tenantId, q); }
  @Post('orders/:id/collect') @Roles('LAB_TECH', 'NURSE') collect(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CollectSpecimenDto) { return this.svc.collect(u, id, dto); }
  @Post('orders/:id/receive') @Roles('LAB_TECH') receive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.receive(u, id); }
  @Post('orders/:id/reject') @Roles('LAB_TECH') reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectSpecimenDto) { return this.svc.reject(u, id, dto.reason); }
  @Post('orders/:id/results') @Roles('LAB_TECH') results(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnterResultsDto) { return this.svc.enterResults(u, id, dto); }
  @Post('orders/:id/verify') @Roles('LAB_TECH') verify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.verify(u, id); }
  @Get('patients/:patientId/results') @Roles(...CLIN, 'NURSE', 'LAB_TECH') cumulative(@CurrentUser() u: AuthUser, @Param('patientId', ParseUUIDPipe) pid: string, @Query() q: TestCodeQuery) { return this.svc.patientResults(u.tenantId, pid, q.testCode); }
}

@ApiTags('radiology') @ApiBearerAuth()
@Controller('radiology')
export class RadiologyController {
  constructor(private svc: RadiologyService) {}
  @Get('worklist') @Roles('RADIOGRAPHER', ...CLIN) worklist(@CurrentUser() u: AuthUser, @Query() q: WorklistQueryDto) { return this.svc.worklist(u.tenantId, q); }
  @Post('orders/:id/start') @Roles('RADIOGRAPHER') start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.start(u, id); }
  @Post('orders/:id/report') @Roles('RADIOGRAPHER', 'DOCTOR') report(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ImagingReportDto) { return this.svc.report(u, id, dto); }
  @Post('orders/:id/verify') @Roles('DOCTOR', 'RADIOGRAPHER') verify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.verify(u, id); }
}
