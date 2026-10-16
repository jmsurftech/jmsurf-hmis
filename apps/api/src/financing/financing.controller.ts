import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth-user';
import { FinancingService } from './financing.service';

class FinancingRequestDto {
  @IsInt() @Min(1) requestedMinor: number;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsString() payerType?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class ConsentDto { @IsOptional() @IsArray() @IsString({ each: true }) scopes?: string[] }
class PartnerDto { @IsString() @MaxLength(120) name: string }
class DecisionDto {
  @IsIn(['UNDER_REVIEW', 'OFFERED', 'DECLINED', 'DISBURSED', 'REPAID']) status: string;
  @IsOptional() @IsInt() @Min(0) offeredMinor?: number;
  @IsOptional() @IsInt() @Min(0) feeMinor?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/** Tenant-side embedded finance (JWT). */
@Controller('financing')
@Roles('ACCOUNTANT', 'MANAGER')
export class FinancingController {
  constructor(private svc: FinancingService) {}
  @Get('receivables') receivables(@CurrentUser() u: AuthUser) { return this.svc.receivables(u.tenantId); }
  @Get('requests') list(@CurrentUser() u: AuthUser) { return this.svc.listRequests(u.tenantId); }
  @Post('requests') create(@CurrentUser() u: AuthUser, @Body() dto: FinancingRequestDto) { return this.svc.createRequest(u, dto); }
  @Post('requests/:id/accept') accept(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.tenantTransition(u, id, 'ACCEPTED'); }
  @Post('requests/:id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.tenantTransition(u, id, 'CANCELLED'); }
  @Get('partners') partners(@CurrentUser() u: AuthUser) { return this.svc.partners(u.tenantId); }
  @Post('partners') @Roles('ADMIN') createPartner(@CurrentUser() u: AuthUser, @Body() dto: PartnerDto) { return this.svc.createPartner(u, dto.name); }
  @Post('partners/:id/consent') @Roles('ADMIN') grant(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsentDto) { return this.svc.grantConsent(u, id, dto.scopes); }
  @Delete('partners/:id/consent') @Roles('ADMIN') revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revokeConsent(u, id); }
}

/** Partner API v1 (X-Partner-Key). Read-only except decisions on financing requests (scope financing:decide). */
@Public()
@Controller('partner/v1')
export class PartnerApiController {
  constructor(private svc: FinancingService) {}
  @Get('tenants') tenants(@Headers('x-partner-key') k?: string) { return this.svc.partnerTenants(k); }
  @Get('tenants/:tenantId/receivables') receivables(@Headers('x-partner-key') k: string | undefined, @Param('tenantId', ParseUUIDPipe) t: string) { return this.svc.partnerReceivables(k, t); }
  @Get('tenants/:tenantId/financing-requests') requests(@Headers('x-partner-key') k: string | undefined, @Param('tenantId', ParseUUIDPipe) t: string) { return this.svc.partnerRequests(k, t); }
  @Post('financing-requests/:id/decision') decide(@Headers('x-partner-key') k: string | undefined, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.svc.partnerDecide(k, id, dto); }
}
