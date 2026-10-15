import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQuery } from '../list-query';
import { ClientLookupDto, EligibilityDto, PayerDto, SchemeDto, UpdatePayerDto, UpdateSchemeDto } from './payers.dto';
import { PayersService } from './payers.service';

const ADMIN = ['ACCOUNTANT', 'MANAGER', 'CLAIMS_OFFICER'];

@ApiTags('payers') @ApiBearerAuth()
@Controller('payers')
export class PayersController {
  constructor(private svc: PayersService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.listPayers(u.tenantId); }
  @Post() @Roles(...ADMIN) create(@CurrentUser() u: AuthUser, @Body() dto: PayerDto) { return this.svc.createPayer(u.tenantId, dto); }

  @Get('schemes') schemes(@CurrentUser() u: AuthUser, @Query('payerId') payerId?: string) { return this.svc.listSchemes(u.tenantId, payerId); }
  @Post('schemes') @Roles(...ADMIN) createScheme(@CurrentUser() u: AuthUser, @Body() dto: SchemeDto) { return this.svc.createScheme(u.tenantId, dto); }
  @Patch('schemes/:id') @Roles(...ADMIN) updateScheme(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateSchemeDto) { return this.svc.updateScheme(u.tenantId, id, dto); }
  @Delete('schemes/:id') @Roles(...ADMIN) deleteScheme(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteScheme(u.tenantId, id); }

  @Get('sha/packages') packages(@Query() q: ListQuery, @Query('fund') fund?: string) { return this.svc.listShaPackages({ ...q, fund }); }
  /** Loads the clearly-labelled SAMPLE package table. Global master data → ADMIN only. */
  @Post('sha/packages/seed-sample') @Roles('ADMIN') seed() { return this.svc.seedSamplePackages(); }
  @Post('sha/ensure') @Roles(...ADMIN) ensure(@CurrentUser() u: AuthUser) { return this.svc.ensureShaPayer(u.tenantId); }
  @Post('sha/client-registry') @Roles('RECEPTION', 'CLAIMS_OFFICER', 'CASHIER', 'MANAGER') lookup(@CurrentUser() u: AuthUser, @Body() dto: ClientLookupDto) {
    return this.svc.clientLookup(u.tenantId, dto);
  }
  @Post('sha/eligibility') @Roles('RECEPTION', 'CLAIMS_OFFICER', 'CASHIER', 'MANAGER') eligibility(@CurrentUser() u: AuthUser, @Body() dto: EligibilityDto) {
    return this.svc.checkEligibility(u.tenantId, dto);
  }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getPayer(u.tenantId, id); }
  @Patch(':id') @Roles(...ADMIN) update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdatePayerDto) { return this.svc.updatePayer(u.tenantId, id, dto); }
  @Delete(':id') @Roles(...ADMIN) remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deletePayer(u.tenantId, id); }
}
