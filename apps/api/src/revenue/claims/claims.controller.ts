import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQuery } from '../list-query';
import { BuildClaimDto, ClaimListQuery, ClaimNoteDto, ManualStatusDto, PreAuthDto, PreAuthListQuery, RemittanceDto, UpdatePreAuthDto } from './claims.dto';
import { ClaimsService } from './claims.service';
import { PreAuthService } from './preauth.service';

const CLAIMS = ['CLAIMS_OFFICER', 'ACCOUNTANT', 'MANAGER'];

@ApiTags('claims') @ApiBearerAuth()
@Controller('claims')
@Roles(...CLAIMS)
export class ClaimsController {
  constructor(private svc: ClaimsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ClaimListQuery) { return this.svc.list(u.tenantId, q); }
  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser, @Query('payerId') payerId?: string) { return this.svc.dashboard(u.tenantId, payerId); }
  @Get('remittances') remittances(@CurrentUser() u: AuthUser, @Query() q: ListQuery) { return this.svc.listRemittances(u.tenantId, q); }
  @Post('remittances') importRemittance(@CurrentUser() u: AuthUser, @Body() dto: RemittanceDto) { return this.svc.importRemittance(u.tenantId, u.sub, dto); }
  @Post('from-bill') build(@CurrentUser() u: AuthUser, @Body() dto: BuildClaimDto) { return this.svc.buildFromBill(u.tenantId, u.sub, dto.billId); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getDetail(u.tenantId, id); }
  @Get(':id/fhir') fhir(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.buildFhir(u.tenantId, id); }
  @Post(':id/scrub') scrub(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.scrub(u.tenantId, id); }
  @Post(':id/submit') submit(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.submit(u.tenantId, u.sub, id); }
  /** Resubmit a REJECTED/QUERIED claim after correction (re-scrubs first). */
  @Post(':id/resubmit') resubmit(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.submit(u.tenantId, u.sub, id); }
  @Post(':id/reopen') reopen(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ClaimNoteDto) { return this.svc.reopen(u.tenantId, u.sub, id, dto.note); }
  @Post(':id/refresh-status') refresh(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.refreshStatus(u.tenantId, id); }
  @Post(':id/status') @Roles('MANAGER', 'CLAIMS_OFFICER') status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ManualStatusDto) {
    return this.svc.manualStatus(u.tenantId, u.sub, id, dto);
  }
}

@ApiTags('claims') @ApiBearerAuth()
@Controller('preauths')
export class PreAuthController {
  constructor(private svc: PreAuthService) {}
  @Get() @Roles(...CLAIMS, 'DOCTOR', 'RECEPTION') list(@CurrentUser() u: AuthUser, @Query() q: PreAuthListQuery) { return this.svc.list(u.tenantId, q); }
  @Get(':id') @Roles(...CLAIMS, 'DOCTOR', 'RECEPTION') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u.tenantId, id); }
  @Post() @Roles(...CLAIMS, 'DOCTOR') create(@CurrentUser() u: AuthUser, @Body() dto: PreAuthDto) { return this.svc.create(u.tenantId, u.sub, dto); }
  @Patch(':id') @Roles(...CLAIMS) update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdatePreAuthDto) { return this.svc.update(u.tenantId, u.sub, id, dto); }
  @Delete(':id') @Roles(...CLAIMS) remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.remove(u.tenantId, id); }
  @Post(':id/submit') @Roles(...CLAIMS, 'DOCTOR') submit(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.submit(u.tenantId, u.sub, id); }
}
