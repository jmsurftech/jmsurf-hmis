import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { PageQueryDto } from '../shared/pagination';
import { OncologyService } from './oncology.service';
import { AdministerDto, BsaQuery, DelayDto, ProtocolDto, RegimenQuery, RegimenStartDto } from './oncology.dto';

const R = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'PHARMACIST'];
const Id = () => Param('id', ParseUUIDPipe);
@ApiTags('oncology') @ApiBearerAuth()
@Controller('oncology')
export class OncologyController {
  constructor(private s: OncologyService) {}
  @Get('protocols') @Roles(...R) protocols(@CurrentUser() u: AuthUser, @Query() q: PageQueryDto) { return this.s.protocols(u.tenantId, q); }
  @Post('protocols') @Roles('DOCTOR', 'PHARMACIST') createProtocol(@CurrentUser() u: AuthUser, @Body() d: ProtocolDto) { return this.s.createProtocol(u, d); }
  @Get('bsa') @Roles(...R) bsa(@Query() q: BsaQuery) { return this.s.calcBsa(q); }
  @Get('regimens') @Roles(...R) regimens(@CurrentUser() u: AuthUser, @Query() q: RegimenQuery) { return this.s.regimens(u.tenantId, q); }
  @Post('regimens') @Roles('DOCTOR') start(@CurrentUser() u: AuthUser, @Body() d: RegimenStartDto) { return this.s.start(u, d); }
  @Get('regimens/:id') @Roles(...R) regimen(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.regimen(u.tenantId, id); }
  @Post('regimens/:id/stop') @Roles('DOCTOR') stop(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.stop(u, id); }
  @Get('schedule') @Roles(...R) schedule(@CurrentUser() u: AuthUser, @Query() q: PageQueryDto) { return this.s.schedule(u.tenantId, q); }
  @Post('cycles/:id/administer') @Roles('NURSE', 'DOCTOR') administer(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: AdministerDto) { return this.s.administer(u, id, d); }
  @Post('cycles/:id/delay') @Roles('DOCTOR', 'CLINICAL_OFFICER') delay(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: DelayDto) { return this.s.delay(u, id, d); }
}
