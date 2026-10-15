import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PageQueryDto } from '../shared/pagination';

export class CreateOrderDto {
  @IsUUID() visitId: string;
  @IsIn(['LAB', 'IMAGING', 'PROCEDURE']) type: 'LAB' | 'IMAGING' | 'PROCEDURE';
  /** ServiceItem to bill. For LAB, may be omitted when labTestId has a linked service item. */
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() labTestId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['ROUTINE', 'URGENT', 'STAT']) priority?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsIn(['XR', 'US', 'CT', 'MRI', 'MAMMO', 'FLUORO', 'ECHO']) modality?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
}

export class OrderQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() visitId?: string;
  @IsOptional() @IsIn(['LAB', 'IMAGING', 'PROCEDURE']) type?: string;
  @IsOptional() @IsString() status?: string;
}

export class RefRangeDto {
  @IsOptional() @IsIn(['MALE', 'FEMALE']) sex?: string;
  @IsOptional() @IsInt() ageMinDays?: number;
  @IsOptional() @IsInt() ageMaxDays?: number;
  @IsOptional() @IsNumber() low?: number;
  @IsOptional() @IsNumber() high?: number;
  @IsOptional() @IsNumber() criticalLow?: number;
  @IsOptional() @IsNumber() criticalHigh?: number;
}

export class LabTestDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() loinc?: string;
  @IsOptional() @IsString() specimenType?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RefRangeDto) refRanges?: RefRangeDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) panelOf?: string[];
  @IsOptional() @IsUUID() serviceItemId?: string;
  @IsOptional() @IsInt() turnaroundMins?: number;
}
export class UpdateLabTestDto extends PartialType(LabTestDto) {}

export class CollectSpecimenDto {
  @IsOptional() @IsString() specimenType?: string;
}
export class RejectSpecimenDto { @IsString() reason: string }

export class ResultItemDto {
  @IsString() testCode: string;
  @IsString() value: string;
  @IsOptional() @IsString() unit?: string;
}
export class EnterResultsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ResultItemDto) results: ResultItemDto[];
  @IsOptional() @IsIn(['MANUAL', 'ANALYZER']) source?: string;
}

export class ImagingReportDto {
  @IsIn(['XR', 'US', 'CT', 'MRI', 'MAMMO', 'FLUORO', 'ECHO']) modality: string;
  @IsOptional() @IsString() studyUid?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() impression?: string;
}

export class WorklistQueryDto extends PageQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsIn(['ROUTINE', 'URGENT', 'STAT']) priority?: string;
}
