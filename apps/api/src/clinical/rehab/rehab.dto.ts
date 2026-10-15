import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export class RehabPlanDto {
  @IsUUID() patientId: string; @IsOptional() @IsIn(['PHYSIO', 'OT', 'SPEECH']) therapy?: string; @IsString() diagnosis: string;
  @IsOptional() @IsString() goals?: string; @IsOptional() @IsString() frequency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) plannedSessions?: number;
  @IsOptional() @IsString() outcomeMeasure?: string;
  @IsOptional() @Type(() => Number) @IsNumber() baselineScore?: number; @IsOptional() @Type(() => Number) @IsNumber() targetScore?: number;
  @IsOptional() @IsDateString() startDate?: string;
}
export class PlanQuery extends PageQueryDto { @IsOptional() @IsString() status?: string; @IsOptional() @IsUUID() patientId?: string }
export class RehabSessionDto {
  @IsOptional() @IsDateString() sessionAt?: string; @IsOptional() @Type(() => Number) @IsInt() durationMin?: number;
  @IsOptional() @IsString() interventions?: string; @IsOptional() @IsString() notes?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10) painScore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() outcomeScore?: number;
  @IsOptional() @IsUUID() visitId?: string;
}
export class PlanStatusDto { @IsIn(['COMPLETED', 'DISCONTINUED', 'ACTIVE']) status: string }
