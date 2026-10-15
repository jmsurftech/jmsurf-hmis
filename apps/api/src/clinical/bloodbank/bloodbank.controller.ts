import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { PageQueryDto } from '../shared/pagination';
import { BloodBankService } from './bloodbank.service';
import {
  BloodRequestDto, CrossmatchDto, DeferDto, DonationDto, DonorDto, ExpiryQuery, GroupingDto, IssueDto, ReactionDto, RequestQuery, ScreeningDto,
  TransfusionEndDto, TransfusionStartDto, UnitDto, UnitQuery,
} from './bloodbank.dto';

const LAB = ['LAB_TECH'];
const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'];
const ALL = [...LAB, ...CLIN];
type U = AuthUser;
const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('blood-bank') @ApiBearerAuth()
@Controller('blood-bank')
export class BloodBankController {
  constructor(private s: BloodBankService) {}
  @Get('donors') @Roles(...LAB) donors(@CurrentUser() u: U, @Query() q: PageQueryDto) { return this.s.listDonors(u.tenantId, q); }
  @Post('donors') @Roles(...LAB) createDonor(@CurrentUser() u: U, @Body() d: DonorDto) { return this.s.createDonor(u, d); }
  @Get('donors/:id') @Roles(...LAB) donor(@CurrentUser() u: U, @Id() id: string) { return this.s.donor(u.tenantId, id); }
  @Post('donors/:id/defer') @Roles(...LAB) defer(@CurrentUser() u: U, @Id() id: string, @Body() d: DeferDto) { return this.s.deferDonor(u, id, d); }
  @Get('donations') @Roles(...LAB) donations(@CurrentUser() u: U, @Query() q: PageQueryDto) { return this.s.listDonations(u.tenantId, q); }
  @Post('donations') @Roles(...LAB) donate(@CurrentUser() u: U, @Body() d: DonationDto) { return this.s.donate(u, d); }
  @Post('donations/:id/screening') @Roles(...LAB) screen(@CurrentUser() u: U, @Id() id: string, @Body() d: ScreeningDto) { return this.s.screen(u, id, d); }
  @Get('units') @Roles(...ALL) units(@CurrentUser() u: U, @Query() q: UnitQuery) { return this.s.listUnits(u.tenantId, q); }
  @Post('units') @Roles(...LAB) receive(@CurrentUser() u: U, @Body() d: UnitDto) { return this.s.receiveUnit(u, d); }
  @Post('units/:id/discard') @Roles(...LAB) discard(@CurrentUser() u: U, @Id() id: string) { return this.s.discardUnit(u, id); }
  @Get('inventory') @Roles(...ALL) inventory(@CurrentUser() u: U) { return this.s.inventory(u.tenantId); }
  @Get('alerts/expiry') @Roles(...ALL) expiry(@CurrentUser() u: U, @Query() q: ExpiryQuery) { return this.s.expiryAlerts(u.tenantId, q); }
  @Get('requests') @Roles(...ALL) requests(@CurrentUser() u: U, @Query() q: RequestQuery) { return this.s.listRequests(u.tenantId, q); }
  @Post('requests') @Roles(...ALL) createRequest(@CurrentUser() u: U, @Body() d: BloodRequestDto) { return this.s.createRequest(u, d); }
  @Get('requests/:id') @Roles(...ALL) request(@CurrentUser() u: U, @Id() id: string) { return this.s.request(u.tenantId, id); }
  @Post('requests/:id/group') @Roles(...LAB) group(@CurrentUser() u: U, @Id() id: string, @Body() d: GroupingDto) { return this.s.group(u, id, d); }
  @Post('requests/:id/crossmatch') @Roles(...LAB) crossmatch(@CurrentUser() u: U, @Id() id: string, @Body() d: CrossmatchDto) { return this.s.crossmatch(u, id, d); }
  @Post('requests/:id/issue') @Roles(...LAB) issue(@CurrentUser() u: U, @Id() id: string, @Body() d: IssueDto) { return this.s.issue(u, id, d); }
  @Post('requests/:id/cancel') @Roles(...ALL) cancel(@CurrentUser() u: U, @Id() id: string) { return this.s.cancelRequest(u, id); }
  @Get('transfusions') @Roles(...ALL) transfusions(@CurrentUser() u: U, @Query() q: RequestQuery) { return this.s.listTransfusions(u.tenantId, q); }
  @Get('reactions') @Roles(...ALL) reactions(@CurrentUser() u: U) { return this.s.reactions(u.tenantId); }
  @Post('transfusions/:id/start') @Roles(...CLIN) start(@CurrentUser() u: U, @Id() id: string, @Body() d: TransfusionStartDto) { return this.s.startTransfusion(u, id, d); }
  @Post('transfusions/:id/complete') @Roles(...CLIN) complete(@CurrentUser() u: U, @Id() id: string, @Body() d: TransfusionEndDto) { return this.s.completeTransfusion(u, id, d); }
  @Post('transfusions/:id/reaction') @Roles(...CLIN) reaction(@CurrentUser() u: U, @Id() id: string, @Body() d: ReactionDto) { return this.s.reaction(u, id, d); }
}
