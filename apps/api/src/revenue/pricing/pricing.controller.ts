import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQuery } from '../list-query';
import { BulkImportDto, PriceListDto, PriceListItemsDto, ServiceItemDto, UpdatePriceListDto, UpdateServiceItemDto } from './pricing.dto';
import { PricingService } from './pricing.service';

const PRICING_ADMIN = ['ACCOUNTANT', 'MANAGER'];

@ApiTags('pricing') @ApiBearerAuth()
@Controller('pricing')
export class PricingController {
  constructor(private svc: PricingService) {}

  @Get('service-items') list(@CurrentUser() u: AuthUser, @Query() q: ListQuery, @Query('category') category?: string) {
    return this.svc.listServiceItems(u.tenantId, { ...q, category });
  }
  @Get('service-items/:id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getServiceItem(u.tenantId, id); }
  @Post('service-items') @Roles(...PRICING_ADMIN) create(@CurrentUser() u: AuthUser, @Body() dto: ServiceItemDto) { return this.svc.createServiceItem(u.tenantId, dto); }
  @Patch('service-items/:id') @Roles(...PRICING_ADMIN) update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateServiceItemDto) {
    return this.svc.updateServiceItem(u.tenantId, id, dto);
  }
  @Delete('service-items/:id') @Roles(...PRICING_ADMIN) remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deactivateServiceItem(u.tenantId, id); }
  /** CSV-style bulk import: client parses the CSV and posts a JSON array of rows. */
  @Post('service-items/import') @Roles(...PRICING_ADMIN) import(@CurrentUser() u: AuthUser, @Body() dto: BulkImportDto) { return this.svc.bulkImport(u.tenantId, dto); }

  @Get('price-lists') lists(@CurrentUser() u: AuthUser) { return this.svc.listPriceLists(u.tenantId); }
  @Get('price-lists/:id') getList(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getPriceList(u.tenantId, id); }
  @Post('price-lists') @Roles(...PRICING_ADMIN) createList(@CurrentUser() u: AuthUser, @Body() dto: PriceListDto) { return this.svc.createPriceList(u.tenantId, dto); }
  @Patch('price-lists/:id') @Roles(...PRICING_ADMIN) updateList(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdatePriceListDto) {
    return this.svc.updatePriceList(u.tenantId, id, dto);
  }
  @Delete('price-lists/:id') @Roles(...PRICING_ADMIN) deleteList(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deletePriceList(u.tenantId, id); }
  @Put('price-lists/:id/items') @Roles(...PRICING_ADMIN) setItems(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PriceListItemsDto) {
    return this.svc.setItems(u.tenantId, id, dto.items);
  }
  @Delete('price-lists/:id/items/:itemId') @Roles(...PRICING_ADMIN) removeItem(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.svc.removeItem(u.tenantId, id, itemId);
  }
}
