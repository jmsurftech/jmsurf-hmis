import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth-user';
import { AiService } from './ai.service';

class TextDto {
  @IsString() @MaxLength(20000) text: string;
  @IsOptional() @IsUUID() visitId?: string;
}
class AiSettingsDto { @IsBoolean() aiEnabled: boolean }
class ForecastQueryDto {
  @IsOptional() @IsUUID() storeId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(4) @Max(104) weeks?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(26) horizonWeeks?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(26) leadTimeWeeks?: number;
  @IsOptional() @IsString() onlyReorder?: string;
}

const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'];

@Controller('ai')
export class AiController {
  constructor(private svc: AiService) {}
  @Get('settings') settings(@CurrentUser() u: AuthUser) { return this.svc.settings(u.tenantId); }
  @Put('settings') @Roles('ADMIN') setSettings(@CurrentUser() u: AuthUser, @Body() dto: AiSettingsDto) { return this.svc.setEnabled(u, dto.aiEnabled); }
  @Get('usage') @Roles('MANAGER') usage(@CurrentUser() u: AuthUser) { return this.svc.usage(u.tenantId); }
  @Post('soap') @Roles(...CLIN) soap(@CurrentUser() u: AuthUser, @Body() dto: TextDto) { return this.svc.soap(u, dto.text, dto.visitId); }
  @Post('icd') @Roles(...CLIN, 'CLAIMS_OFFICER') icd(@CurrentUser() u: AuthUser, @Body() dto: TextDto) { return this.svc.icd(u, dto.text, dto.visitId); }
  @Post('admissions/:id/discharge-summary') @Roles(...CLIN) discharge(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('includeSensitive') inc?: string) { return this.svc.discharge(u, id, inc === 'true'); }
  @Post('claims/:id/risk') @Roles('CLAIMS_OFFICER', 'MANAGER') claimRisk(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.claimRisk(u, id); }
  @Get('inventory/forecast') @Roles('STOREKEEPER', 'PHARMACIST', 'PROCUREMENT', 'MANAGER')
  forecast(@CurrentUser() u: AuthUser, @Query() q: ForecastQueryDto) { return this.svc.forecast(u.tenantId, { ...q, onlyReorder: q.onlyReorder === 'true' }); }
}
