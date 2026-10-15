import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { HomecareService } from './homecare.service';
import { CheckInDto, CheckOutDto, HomeVisitDto, HomeVisitQuery, ReasonDto } from './homecare.dto';

@ApiTags('homecare') @ApiBearerAuth()
@Controller('homecare')
export class HomecareController {
  constructor(private svc: HomecareService) {}
  @Post('visits') @Roles('RECEPTION', 'NURSE', 'MANAGER') book(@CurrentUser() u: AuthUser, @Body() dto: HomeVisitDto) { return this.svc.book(u, dto); }
  @Get('visits') @Roles('RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'MANAGER', 'ACCOUNTANT') list(@CurrentUser() u: AuthUser, @Query() q: HomeVisitQuery) { return this.svc.list(u, q); }
  @Post('visits/:id/check-in') @Roles('NURSE', 'CLINICAL_OFFICER', 'DOCTOR') checkIn(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckInDto) { return this.svc.checkIn(u, id, dto); }
  @Post('visits/:id/check-out') @Roles('NURSE', 'CLINICAL_OFFICER', 'DOCTOR') checkOut(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckOutDto) { return this.svc.checkOut(u, id, dto); }
  @Post('visits/:id/release-escrow') @Roles('MANAGER', 'ACCOUNTANT', 'CASHIER') release(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.releaseEscrow(u, id); }
  @Post('visits/:id/dispute') @Roles('RECEPTION', 'MANAGER') dispute(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.svc.dispute(u, id, dto.reason); }
  @Post('visits/:id/refund') @Roles('MANAGER', 'ACCOUNTANT') refund(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.svc.refund(u, id, dto.reason); }
  @Post('visits/:id/cancel') @Roles('RECEPTION', 'MANAGER') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(u, id); }
}
