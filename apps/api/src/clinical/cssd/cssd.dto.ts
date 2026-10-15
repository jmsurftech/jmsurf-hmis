import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export class SetItemDto { @IsString() name: string; @Type(() => Number) @IsInt() qty: number }
export class InstrumentSetDto {
  @IsString() code: string; @IsString() name: string; @IsOptional() @IsString() department?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SetItemDto) items: SetItemDto[];
}
export class SetQuery extends PageQueryDto { @IsOptional() @IsString() status?: string }
export class CycleDto {
  @IsString() machine: string; @IsOptional() @IsIn(['STEAM', 'ETO', 'PLASMA']) method?: string;
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true }) setIds: string[];
  @IsOptional() @Type(() => Number) @IsNumber() temperatureC?: number; @IsOptional() @Type(() => Number) @IsNumber() pressureKpa?: number;
  @IsOptional() @Type(() => Number) @IsInt() durationMin?: number;
}
export class CycleResultDto {
  @IsIn(['PASS', 'FAIL']) chemicalIndicator: string;
  @IsOptional() @IsIn(['PASS', 'FAIL', 'PENDING']) biologicalIndicator?: string;
  @IsOptional() @IsIn(['PASS', 'FAIL']) bowieDick?: string;
  @IsOptional() @Type(() => Number) @IsNumber() temperatureC?: number; @IsOptional() @Type(() => Number) @IsNumber() pressureKpa?: number;
  @IsOptional() @Type(() => Number) @IsInt() durationMin?: number;
  /** Shelf life of sterile packs (days). Default 30. */
  @IsOptional() @Type(() => Number) @IsInt() shelfLifeDays?: number;
}
export class BiDto { @IsIn(['PASS', 'FAIL']) biologicalIndicator: string }
export class RecallDto { @IsString() reason: string }
export class IssueSetDto { @IsOptional() @IsUUID() surgeryId?: string; @IsOptional() @IsUUID() patientId?: string; @IsOptional() @IsString() location?: string }
