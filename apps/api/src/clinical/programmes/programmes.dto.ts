import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export class HivEnrolDto {
  @IsUUID() patientId: string; @IsOptional() @IsString() cccNumber?: string;
  @IsOptional() @IsDateString() enrolledAt?: string;
  @IsOptional() @IsIn(['VCT', 'OPD', 'IPD', 'PMTCT', 'TB', 'CWC', 'TRANSFER_IN']) entryPoint?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) whoStage?: number;
  @IsOptional() @IsBoolean() pmtct?: boolean;
  @IsOptional() @IsString() regimen?: string; @IsOptional() @IsDateString() artStartDate?: string;
}
export class HivQuery extends PageQueryDto { @IsOptional() @IsString() status?: string; @IsOptional() @IsString() pmtct?: string }
export class HivUpdateDto {
  @IsOptional() @IsIn(['ACTIVE', 'TRANSFERRED_OUT', 'LTFU', 'DEAD', 'STOPPED']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) whoStage?: number; @IsOptional() @IsBoolean() pmtct?: boolean;
}
export class RegimenDto { @IsString() regimen: string; @IsOptional() @IsIn(['FIRST', 'SECOND', 'THIRD']) line?: string; @IsOptional() @IsDateString() startDate?: string; @IsOptional() @IsString() changeReason?: string }
export class ViralLoadDto { @IsDateString() sampleDate: string; @IsOptional() @Type(() => Number) @IsInt() @Min(0) copiesPerMl?: number; @IsOptional() @IsBoolean() ldl?: boolean }
export class AppointmentDto { @IsDateString() scheduledAt: string; @IsOptional() @IsIn(['CLINICAL', 'REFILL', 'VL', 'COUNSELLING']) purpose?: string }
export class TracingDto { @IsIn(['CONTACTED_RETURNED', 'CONTACTED_WILL_RETURN', 'NOT_REACHED', 'TRANSFERRED', 'DEAD']) tracingOutcome: string; @IsOptional() @IsString() tracingNotes?: string }
export class ExportQuery { @IsOptional() @IsString() format?: string }

export class TbCaseDto {
  @IsUUID() patientId: string; @IsOptional() @IsString() tbNumber?: string;
  @IsOptional() @IsIn(['PULMONARY', 'EXTRA_PULMONARY']) diseaseSite?: string;
  @IsOptional() @IsIn(['BACTERIOLOGICAL', 'CLINICAL']) confirmation?: string;
  @IsOptional() @IsIn(['NEW', 'RELAPSE', 'TREATMENT_AFTER_LTFU', 'FAILURE', 'TRANSFER_IN']) patientType?: string;
  @IsOptional() @IsString() regimen?: string; @IsOptional() @IsIn(['POS', 'NEG', 'UNKNOWN']) hivStatus?: string;
  @IsOptional() @IsDateString() intensiveStart?: string;
}
export class TbQuery extends PageQueryDto { @IsOptional() @IsString() phase?: string; @IsOptional() @IsString() outcome?: string }
export class DotDto { @IsOptional() @IsDateString() date?: string; @IsOptional() @IsBoolean() observed?: boolean; @IsOptional() @IsString() observer?: string; @IsOptional() @IsString() notes?: string }
export class PhaseDto { @IsIn(['CONTINUATION']) phase: string; @IsOptional() @IsDateString() date?: string }
export class OutcomeDto { @IsIn(['CURED', 'COMPLETED', 'FAILED', 'DIED', 'LTFU', 'NOT_EVALUATED', 'TRANSFERRED_OUT']) outcome: string; @IsOptional() @IsDateString() date?: string }
