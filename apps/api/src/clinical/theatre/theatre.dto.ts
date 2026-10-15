import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class BookingDto {
  @IsUUID() visitId: string;
  @IsString() theatre: string;
  @IsString() procedure: string;
  @IsOptional() @IsUUID() surgeonId?: string;
  @IsOptional() @IsUUID() anaesthetistId?: string;
  @IsDateString() scheduledStart: string;
  @IsDateString() scheduledEnd: string;
  @IsOptional() @IsUUID() preauthId?: string;
}
export class RescheduleDto {
  @IsOptional() @IsString() theatre?: string;
  @IsOptional() @IsUUID() surgeonId?: string;
  @IsOptional() @IsUUID() anaesthetistId?: string;
  @IsOptional() @IsDateString() scheduledStart?: string;
  @IsOptional() @IsDateString() scheduledEnd?: string;
}
export class ClashQuery {
  @IsString() theatre: string;
  @IsOptional() @IsUUID() surgeonId?: string;
  @IsOptional() @IsUUID() anaesthetistId?: string;
  @IsDateString() scheduledStart: string;
  @IsDateString() scheduledEnd: string;
}
export class ScheduleQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsString() theatre?: string;
}
export class ChecklistDto {
  @IsIn(['SIGN_IN', 'TIME_OUT', 'SIGN_OUT']) phase: 'SIGN_IN' | 'TIME_OUT' | 'SIGN_OUT';
  @IsObject() items: Record<string, boolean>;
  @IsOptional() @IsString() notes?: string;
}
export class AnaesthesiaDto { @IsObject() record: Record<string, unknown> }
export class OpNoteDto {
  @IsString() operationNote: string;
  @IsOptional() @IsObject() counts?: Record<string, unknown>;
}
export class CompleteDto { @IsOptional() @IsUUID() serviceId?: string }
export class ConsumableLineDto { @IsUUID() itemId: string; @IsInt() @Min(1) quantity: number }
export class ConsumablesDto {
  @IsUUID() storeId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ConsumableLineDto) items: ConsumableLineDto[];
}
