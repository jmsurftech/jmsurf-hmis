import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth-user';
import { ListQuery } from '../list-query';
import { CloseShiftDto, OpenShiftDto, PaymentListQuery, ReceiptDto, RefundDto, StkDto } from './payments.dto';
import { PaymentsService } from './payments.service';

const CASH = ['CASHIER', 'ACCOUNTANT', 'MANAGER'];

/** Optional shared secret appended to callback URLs (?token=) since Daraja does not sign callbacks. */
const checkToken = (token?: string) => {
  const expected = process.env.MPESA_CALLBACK_TOKEN;
  if (expected && token !== expected) throw new ForbiddenException();
};

@ApiTags('payments') @ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Get() @Roles(...CASH) list(@CurrentUser() u: AuthUser, @Query() q: PaymentListQuery) { return this.svc.list(u.tenantId, q); }
  @Post('receipts') @Roles(...CASH) receipt(@CurrentUser() u: AuthUser, @Body() dto: ReceiptDto) { return this.svc.receipt(u.tenantId, u.sub, dto); }
  @Post('mpesa/stk') @Roles(...CASH, 'RECEPTION') stk(@CurrentUser() u: AuthUser, @Body() dto: StkDto) { return this.svc.initiateStk(u.tenantId, u.sub, dto); }

  @Public() @Post('mpesa/callback') @HttpCode(200)
  callback(@Body() body: any, @Query('token') token?: string) { checkToken(token); return this.svc.handleStkCallback(body); }
  @Public() @Post('mpesa/c2b/validation') @HttpCode(200)
  c2bValidation(@Body() body: any, @Query('token') token?: string) { checkToken(token); return this.svc.c2bValidate(body); }
  @Public() @Post('mpesa/c2b/confirmation') @HttpCode(200)
  c2bConfirmation(@Body() body: any, @Query('token') token?: string) { checkToken(token); return this.svc.c2bConfirm(body); }

  @Get(':id') @Roles(...CASH, 'RECEPTION') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u.tenantId, id); }
  @Post(':id/refund') @Roles('MANAGER', 'ACCOUNTANT') refund(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RefundDto) {
    return this.svc.refund(u.tenantId, u.sub, id, dto);
  }
}

@ApiTags('cashier') @ApiBearerAuth()
@Controller('cashier/shifts')
export class CashierShiftsController {
  constructor(private svc: PaymentsService) {}
  @Get() @Roles('ACCOUNTANT', 'MANAGER') list(@CurrentUser() u: AuthUser, @Query() q: ListQuery, @Query('userId') userId?: string) {
    return this.svc.listShifts(u.tenantId, { ...q, userId });
  }
  @Get('current') @Roles(...CASH) current(@CurrentUser() u: AuthUser) { return this.svc.currentShift(u.tenantId, u.sub); }
  @Post('open') @Roles(...CASH) open(@CurrentUser() u: AuthUser, @Body() dto: OpenShiftDto) { return this.svc.openShiftFor(u.tenantId, u.sub, dto.openingFloat); }
  @Post(':id/close') @Roles(...CASH) close(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.svc.closeShift(u.tenantId, u.sub, id, dto.declaredCash, dto.note, u.roles.includes('MANAGER') || u.roles.includes('ADMIN'));
  }
}
