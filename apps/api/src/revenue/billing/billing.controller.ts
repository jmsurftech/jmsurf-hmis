import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { BillListQuery, FiscalSignDto, DiscountDto, FinalizeDto, ManualLineDto, VoidLineDto } from './billing.dto';
import { BillingService } from './billing.service';

const BILLING = ['CASHIER', 'ACCOUNTANT', 'MANAGER', 'RECEPTION', 'CLAIMS_OFFICER'];

@ApiTags('billing') @ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private svc: BillingService) {}

  @Get('bills') @Roles(...BILLING) list(@CurrentUser() u: AuthUser, @Query() q: BillListQuery) { return this.svc.list(u.tenantId, q); }
  @Get('visits/:visitId/bill') @Roles(...BILLING, 'DOCTOR', 'NURSE') forVisit(@CurrentUser() u: AuthUser, @Param('visitId') visitId: string) {
    return this.svc.forVisit(u.tenantId, visitId);
  }
  @Get('bills/:id') @Roles(...BILLING) get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u.tenantId, id); }
  @Get('bills/:id/print') @Roles(...BILLING) print(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.printData(u.tenantId, id); }
  @Post('bills/:id/lines') @Roles('CASHIER', 'ACCOUNTANT', 'MANAGER') addLine(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ManualLineDto) {
    return this.svc.addManualLine(u.tenantId, u.sub, id, dto);
  }
  /** Voiding needs an approver role. */
  @Post('lines/:lineId/void') @Roles('MANAGER', 'ACCOUNTANT') voidLine(@CurrentUser() u: AuthUser, @Param('lineId') lineId: string, @Body() dto: VoidLineDto) {
    return this.svc.voidLine(u.tenantId, u.sub, lineId, dto.reason);
  }
  @Post('bills/:id/discount') @Roles('MANAGER', 'ACCOUNTANT') discount(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DiscountDto) {
    return this.svc.discount(u.tenantId, u.sub, id, dto);
  }
  @Post('bills/:id/finalize') @Roles('CASHIER', 'ACCOUNTANT', 'MANAGER') finalize(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: FinalizeDto) {
    return this.svc.finalize(u.tenantId, u.sub, id, dto);
  }
  @Post('bills/:id/fiscal-sign') @Roles('CASHIER', 'ACCOUNTANT', 'MANAGER') sign(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: FiscalSignDto) {
    return this.svc.signFiscal(u.tenantId, id, dto?.buyerPin);
  }
}
