import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class RequestOtpDto {
  @IsString() @Length(1, 80) tenant: string;
  @IsString() @Matches(/^\+?[0-9 ]{9,15}$/) phone: string;
}
export class VerifyOtpDto extends RequestOtpDto {
  @IsString() @Matches(/^\d{6}$/) code: string;
}
export class PatientScopeQuery { @IsOptional() @IsUUID() patientId?: string }
export class SlotsQuery {
  @IsUUID() practitionerId: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsOptional() @IsIn(['IN_PERSON', 'TELEMEDICINE']) mode?: string;
}
export class BookDto {
  @IsUUID() practitionerId: string;
  @IsISO8601() startAt: string;
  @IsOptional() @IsIn(['IN_PERSON', 'TELEMEDICINE']) mode?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsUUID() patientId?: string;
}
export class PayBillDto { @IsOptional() @IsString() @Matches(/^\+?[0-9 ]{9,15}$/) phone?: string }
export class ConsentDto {
  @IsString() scope: string;
  @IsBoolean() granted: boolean;
  @IsOptional() @IsUUID() patientId?: string;
}
export class PreferencesDto {
  @IsOptional() @IsIn(['en', 'sw']) language?: string;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
}
export class FeedbackDto {
  @IsInt() @Min(0) @Max(10) score: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @IsUUID() visitId?: string;
}
export class RxItemDto {
  @IsOptional() @IsUUID() itemId?: string;
  @IsString() @MaxLength(200) drugName: string;
  @IsString() @MaxLength(100) dose: string;
  @IsOptional() @IsString() route?: string;
  @IsString() @MaxLength(100) frequency: string;
  @IsOptional() @IsInt() @Min(1) durationDays?: number;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
}
export class EPrescribeDto {
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => RxItemDto) items: RxItemDto[];
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
export class TemplateDto {
  @IsString() @Length(1, 40) code: string;
  @IsIn(['en', 'sw']) lang: string;
  @IsString() @Length(1, 640) body: string;
}
export class AvailabilityDto {
  @IsUUID() practitionerId: string;
  @IsInt() @Min(0) @Max(6) weekday: number;
  @Matches(/^\d{2}:\d{2}$/) startTime: string;
  @Matches(/^\d{2}:\d{2}$/) endTime: string;
  @IsOptional() @IsInt() @Min(5) @Max(240) slotMinutes?: number;
}
