import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class SessionDto {
  @IsUUID() patientId: string;
  @IsString() chair: string;
  @IsOptional() @IsString() machine?: string;
  @IsDateString() scheduledAt: string;
}
export class RecurringDto {
  @IsUUID() patientId: string;
  @IsString() chair: string;
  @IsOptional() @IsString() machine?: string;
  @IsDateString() startDate: string;
  /** 0=Sunday … 6=Saturday, e.g. [1,3,5] for Mon/Wed/Fri. */
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays: number[];
  @IsInt() @Min(1) @Max(26) weeks: number;
  @Matches(/^\d{2}:\d{2}$/) time: string;
  @IsOptional() @IsNumber() durationHours?: number;
}
export class SessionQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsString() chair?: string;
  @IsOptional() @IsString() status?: string;
}
export class StartSessionDto {
  @IsOptional() @IsUUID() visitId?: string;
  @IsOptional() @IsObject() preVitals?: Record<string, unknown>;
  @IsOptional() @IsObject() parameters?: Record<string, unknown>;
}
export class CompleteSessionDto {
  @IsOptional() @IsObject() postVitals?: Record<string, unknown>;
  @IsOptional() @IsObject() parameters?: Record<string, unknown>;
  @IsOptional() @IsNumber() @Min(0.1) preUrea?: number;
  @IsOptional() @IsNumber() @Min(0) postUrea?: number;
  @IsOptional() @IsNumber() @Min(0) ufLitres?: number;
  @IsOptional() @IsNumber() @Min(1) postWeightKg?: number;
  @IsOptional() @IsNumber() @Min(0.5) hours?: number;
}
