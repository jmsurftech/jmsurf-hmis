import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { PharmacyService } from './pharmacy.service';
import { ControlledRegisterQuery, DispenseDto, OtcSaleDto, PrescriptionDto, RxQueryDto } from './pharmacy.dto';

class CheckDto { @IsUUID() visitId: string; @IsUUID() itemId: string }

@ApiTags('pharmacy') @ApiBearerAuth()
@Controller('pharmacy')
export class PharmacyController {
  constructor(private svc: PharmacyService) {}
  @Post('prescriptions/check') @Roles('DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST') check(@CurrentUser() u: AuthUser, @Body() dto: CheckDto) { return this.svc.check(u.tenantId, dto.visitId, dto.itemId); }
  @Post('prescriptions') @Roles('DOCTOR', 'CLINICAL_OFFICER') prescribe(@CurrentUser() u: AuthUser, @Body() dto: PrescriptionDto) { return this.svc.prescribe(u, dto); }
  @Get('prescriptions') @Roles('DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST', 'NURSE') list(@CurrentUser() u: AuthUser, @Query() q: RxQueryDto) { return this.svc.list(u.tenantId, q); }
  @Post('prescriptions/:id/cancel') @Roles('DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(u, id); }
  @Post('prescriptions/:id/dispense') @Roles('PHARMACIST') dispense(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DispenseDto) { return this.svc.dispense(u, id, dto); }
  @Post('otc') @Roles('PHARMACIST') otc(@CurrentUser() u: AuthUser, @Body() dto: OtcSaleDto) { return this.svc.otcSale(u, dto); }
  @Get('controlled-register') @Roles('PHARMACIST', 'MANAGER') register(@CurrentUser() u: AuthUser, @Query() q: ControlledRegisterQuery) { return this.svc.controlledRegister(u.tenantId, q); }
}
