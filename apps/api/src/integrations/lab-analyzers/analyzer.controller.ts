import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth-user';
import { AnalyzerService } from './analyzer.service';
import { AnalyzerSpecimen } from './types';

class IngestDto {
  @IsOptional() @IsIn(['ASTM', 'HL7', 'JSON']) protocol?: 'ASTM' | 'HL7' | 'JSON';
  @IsOptional() @IsString() @MaxLength(2_000_000) message?: string;
  @IsOptional() @IsArray() specimens?: AnalyzerSpecimen[];
}
class DeviceDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsIn(['ASTM', 'HL7']) protocol?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsObject() testMap?: Record<string, string>;
}

@Controller('lab/analyzer')
export class AnalyzerController {
  constructor(private svc: AnalyzerService) {}

  /** Device-authenticated (X-Device-Key) result ingestion from the edge agent or a LIS middleware. */
  @Public() @Post('results') @HttpCode(200)
  ingest(@Headers('x-device-key') key: string | undefined, @Body() dto: IngestDto) { return this.svc.ingest(key, dto); }

  @Get('devices') @Roles('LAB_TECH', 'MANAGER') list(@CurrentUser() u: AuthUser) { return this.svc.listDevices(u.tenantId); }
  @Post('devices') @Roles('ADMIN') create(@CurrentUser() u: AuthUser, @Body() dto: DeviceDto) { return this.svc.createDevice(u.tenantId, u.sub, dto); }
  @Post('devices/:id/deactivate') @Roles('ADMIN') deactivate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deactivate(u.tenantId, id); }
}
