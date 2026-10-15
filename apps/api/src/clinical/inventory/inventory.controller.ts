import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { PageQueryDto } from '../shared/pagination';
import { InventoryService } from './inventory.service';
import { ProcurementService } from './procurement.service';
import { AdjustmentDto, CreatePoDto, ExpiryQueryDto, ItemQueryDto, LevelsQueryDto, MovementQueryDto, PoDecisionDto, PoQueryDto, ReceiveStockDto, StockItemDto, StoreDto, SupplierDto, TransferDto, UpdatePoDto, UpdateStockItemDto, UpdateSupplierDto } from './inventory.dto';

const STORE = ['STOREKEEPER', 'PHARMACIST', 'PROCUREMENT', 'MANAGER'];

@ApiTags('inventory') @ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService) {}
  @Get('stores') stores(@CurrentUser() u: AuthUser) { return this.svc.listStores(u.tenantId); }
  @Post('stores') @Roles('MANAGER', 'STOREKEEPER') createStore(@CurrentUser() u: AuthUser, @Body() dto: StoreDto) { return this.svc.createStore(u, dto); }

  @Post('items') @Roles(...STORE) createItem(@CurrentUser() u: AuthUser, @Body() dto: StockItemDto) { return this.svc.createItem(u, dto); }
  @Get('items') items(@CurrentUser() u: AuthUser, @Query() q: ItemQueryDto) { return this.svc.listItems(u.tenantId, q); }
  @Get('items/:id') item(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getItem(u.tenantId, id); }
  @Patch('items/:id') @Roles(...STORE) updateItem(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockItemDto) { return this.svc.updateItem(u, id, dto); }
  @Delete('items/:id') @Roles('MANAGER', 'STOREKEEPER') deactivate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deactivateItem(u, id); }

  @Post('receive') @Roles(...STORE) receive(@CurrentUser() u: AuthUser, @Body() dto: ReceiveStockDto) { return this.svc.receive(u, dto); }
  @Post('transfers') @Roles(...STORE, 'NURSE') transfer(@CurrentUser() u: AuthUser, @Body() dto: TransferDto) { return this.svc.transfer(u, dto); }
  @Post('adjustments') @Roles('STOREKEEPER', 'PHARMACIST', 'MANAGER') adjust(@CurrentUser() u: AuthUser, @Body() dto: AdjustmentDto) { return this.svc.adjust(u, dto); }

  @Get('levels') @Roles(...STORE, 'NURSE', 'ACCOUNTANT') levels(@CurrentUser() u: AuthUser, @Query() q: LevelsQueryDto) { return this.svc.levels(u.tenantId, q); }
  @Get('reorder-alerts') @Roles(...STORE) reorder(@CurrentUser() u: AuthUser) { return this.svc.reorderAlerts(u.tenantId); }
  @Get('expiry-report') @Roles(...STORE, 'ACCOUNTANT') expiry(@CurrentUser() u: AuthUser, @Query() q: ExpiryQueryDto) { return this.svc.expiryReport(u.tenantId, q); }
  @Get('movements') @Roles(...STORE, 'ACCOUNTANT') movements(@CurrentUser() u: AuthUser, @Query() q: MovementQueryDto) { return this.svc.movements(u.tenantId, q); }
}

@ApiTags('procurement') @ApiBearerAuth()
@Controller('procurement')
export class ProcurementController {
  constructor(private svc: ProcurementService) {}
  @Post('suppliers') @Roles('PROCUREMENT', 'MANAGER') createSupplier(@CurrentUser() u: AuthUser, @Body() dto: SupplierDto) { return this.svc.createSupplier(u, dto); }
  @Get('suppliers') @Roles('PROCUREMENT', 'STOREKEEPER', 'MANAGER', 'ACCOUNTANT') suppliers(@CurrentUser() u: AuthUser, @Query() q: PageQueryDto) { return this.svc.listSuppliers(u.tenantId, q); }
  @Patch('suppliers/:id') @Roles('PROCUREMENT', 'MANAGER') updateSupplier(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) { return this.svc.updateSupplier(u, id, dto); }

  @Post('purchase-orders') @Roles('PROCUREMENT', 'STOREKEEPER') create(@CurrentUser() u: AuthUser, @Body() dto: CreatePoDto) { return this.svc.create(u, dto); }
  @Get('purchase-orders') @Roles('PROCUREMENT', 'STOREKEEPER', 'MANAGER', 'ACCOUNTANT') list(@CurrentUser() u: AuthUser, @Query() q: PoQueryDto) { return this.svc.list(u.tenantId, q); }
  @Get('purchase-orders/:id') @Roles('PROCUREMENT', 'STOREKEEPER', 'MANAGER', 'ACCOUNTANT') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.tenantId, id); }
  @Patch('purchase-orders/:id') @Roles('PROCUREMENT', 'STOREKEEPER') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePoDto) { return this.svc.update(u, id, dto); }
  @Post('purchase-orders/:id/submit') @Roles('PROCUREMENT', 'STOREKEEPER') submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.submit(u, id); }
  @Post('purchase-orders/:id/approve') @Roles('MANAGER', 'ACCOUNTANT') approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PoDecisionDto) { return this.svc.approve(u, id, dto.comment); }
  @Post('purchase-orders/:id/reject') @Roles('MANAGER', 'ACCOUNTANT') reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PoDecisionDto) { return this.svc.reject(u, id, dto.comment); }
  @Post('purchase-orders/:id/cancel') @Roles('PROCUREMENT', 'MANAGER') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PoDecisionDto) { return this.svc.cancel(u, id, dto.comment); }
  @Post('purchase-orders/:id/receive') @Roles('STOREKEEPER', 'PHARMACIST') receive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveStockDto) { return this.svc.receive(u, id, dto); }
}
