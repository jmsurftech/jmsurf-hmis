import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { DieteticsService } from './dietetics.service';
import { DietOrderDto, DietQuery, GenerateDto, SheetQuery } from './dietetics.dto';

const R = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'STOREKEEPER'];
@ApiTags('dietetics') @ApiBearerAuth()
@Controller('dietetics')
export class DieteticsController {
  constructor(private s: DieteticsService) {}
  @Get('orders') @Roles(...R) list(@CurrentUser() u: AuthUser, @Query() q: DietQuery) { return this.s.list(u.tenantId, q); }
  @Post('orders') @Roles('NURSE', 'DOCTOR', 'CLINICAL_OFFICER') order(@CurrentUser() u: AuthUser, @Body() d: DietOrderDto) { return this.s.order(u, d); }
  @Post('orders/:id/stop') @Roles('NURSE', 'DOCTOR', 'CLINICAL_OFFICER') stop(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.stop(u, id); }
  @Post('meal-plans/generate') @Roles(...R) generate(@CurrentUser() u: AuthUser, @Body() d: GenerateDto) { return this.s.generate(u, d); }
  @Get('meal-plans') @Roles(...R) plans(@CurrentUser() u: AuthUser, @Query() q: SheetQuery) { return this.s.plans(u.tenantId, q); }
  @Get('kitchen-sheet') @Roles(...R) sheet(@CurrentUser() u: AuthUser, @Query() q: SheetQuery) { return this.s.kitchenSheet(u.tenantId, q); }
}
