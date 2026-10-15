import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { InpatientService } from './inpatient.service';
import { AdmissionQuery, AdmitDto, BedBoardQuery, BedDto, BedStatusDto, DischargeDto, MarActionDto, ScheduleMarDto, TransferBedDto, UpdateWardDto, WardDto } from './inpatient.dto';

class AdhocDto { @IsUUID() prescriptionId: string; @IsOptional() @IsString() note?: string }
class WardQuery { @IsOptional() @IsUUID() wardId?: string }
const WARD = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER'];

@ApiTags('inpatient') @ApiBearerAuth()
@Controller('inpatient')
export class InpatientController {
  constructor(private svc: InpatientService) {}
  @Post('wards') @Roles('MANAGER') createWard(@CurrentUser() u: AuthUser, @Body() dto: WardDto) { return this.svc.createWard(u, dto); }
  @Get('wards') wards(@CurrentUser() u: AuthUser) { return this.svc.listWards(u.tenantId); }
  @Patch('wards/:id') @Roles('MANAGER') updateWard(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWardDto) { return this.svc.updateWard(u, id, dto); }
  @Delete('wards/:id') @Roles('MANAGER') deleteWard(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteWard(u, id); }
  @Post('wards/:id/beds') @Roles('MANAGER') addBed(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BedDto) { return this.svc.addBed(u, id, dto); }
  @Patch('beds/:id/status') @Roles('NURSE', 'MANAGER') bedStatus(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BedStatusDto) { return this.svc.setBedStatus(u, id, dto.status); }
  @Delete('beds/:id') @Roles('MANAGER') deleteBed(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteBed(u, id); }
  @Get('bed-board') bedBoard(@CurrentUser() u: AuthUser, @Query() q: BedBoardQuery) { return this.svc.bedBoard(u, q); }

  @Post('admissions') @Roles(...WARD, 'RECEPTION') admit(@CurrentUser() u: AuthUser, @Body() dto: AdmitDto) { return this.svc.admit(u, dto); }
  @Get('admissions') @Roles(...WARD, 'RECEPTION', 'CASHIER', 'PHARMACIST') admissions(@CurrentUser() u: AuthUser, @Query() q: AdmissionQuery) { return this.svc.listAdmissions(u.tenantId, q); }
  @Get('admissions/:id') @Roles(...WARD, 'PHARMACIST') admission(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getAdmission(u.tenantId, id); }
  @Post('admissions/:id/transfer') @Roles(...WARD) transfer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferBedDto) { return this.svc.transfer(u, id, dto); }
  @Post('admissions/:id/discharge') @Roles('DOCTOR', 'CLINICAL_OFFICER') discharge(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DischargeDto) { return this.svc.discharge(u, id, dto); }
  @Post('bed-charges/run') @Roles('MANAGER', 'CASHIER') runCharges(@CurrentUser() u: AuthUser) { return this.svc.runBedChargesForTenant(u); }

  @Post('admissions/:id/mar/schedule') @Roles(...WARD, 'PHARMACIST') scheduleMar(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleMarDto) { return this.svc.scheduleMar(u, id, dto); }
  @Post('admissions/:id/mar/adhoc') @Roles('NURSE') adhoc(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdhocDto) { return this.svc.adhocMar(u, id, dto.prescriptionId, dto.note); }
  @Get('admissions/:id/mar') @Roles(...WARD, 'PHARMACIST') mar(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listMar(u.tenantId, id); }
  @Post('mar/:marId') @Roles('NURSE') recordMar(@CurrentUser() u: AuthUser, @Param('marId', ParseUUIDPipe) id: string, @Body() dto: MarActionDto) { return this.svc.recordMar(u, id, dto); }
  @Get('mar/overdue') @Roles(...WARD) overdue(@CurrentUser() u: AuthUser, @Query() q: WardQuery) { return this.svc.overdueDoses(u, q.wardId); }
}
