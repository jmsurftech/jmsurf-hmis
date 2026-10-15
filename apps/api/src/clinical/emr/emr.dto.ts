import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class TriageDto {
  @IsUUID() visitId: string;
  @IsOptional() @IsIn(['SATS', 'ESI']) scale?: string;
  /** SATS colour; if omitted it is derived from the TEWS score. */
  @IsOptional() @IsIn(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) score?: number;
  @IsOptional() @IsString() complaint?: string;
  /** Emergency discriminators (e.g. seizure, burns) force at least ORANGE. */
  @IsOptional() @IsBoolean() emergencySign?: boolean;
}

export class VitalsDto {
  @IsUUID() visitId: string;
  @IsOptional() @IsNumber() @Min(25) @Max(45) temperatureC?: number;
  @IsOptional() @IsInt() @Min(0) @Max(300) pulse?: number;
  @IsOptional() @IsInt() @Min(0) @Max(80) respRate?: number;
  @IsOptional() @IsInt() @Min(0) @Max(300) systolic?: number;
  @IsOptional() @IsInt() @Min(0) @Max(200) diastolic?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) spo2?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(400) weightKg?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(260) heightCm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(60) muacCm?: number;
  @IsOptional() @IsNumber() bloodSugar?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) painScore?: number;
  @IsOptional() @IsBoolean() onOxygen?: boolean;
  @IsOptional() @IsIn(['A', 'C', 'V', 'P', 'U']) consciousness?: 'A' | 'C' | 'V' | 'P' | 'U';
  @IsOptional() @IsBoolean() spo2Scale2?: boolean;
}

export const SENSITIVE_SPECIALTIES = ['MENTAL_HEALTH', 'PSYCHIATRY', 'HIV', 'SEXUAL_HEALTH', 'GBV'];
export const SPECIALTIES = ['GENERAL', 'DENTAL', 'EYE', 'ENT', 'PHYSIOTHERAPY', 'NUTRITION', 'PAEDIATRICS', 'GYNAECOLOGY', 'ORTHOPAEDICS', 'ONCOLOGY', 'DIABETES', 'HYPERTENSION', ...SENSITIVE_SPECIALTIES];

export class NoteDto {
  @IsUUID() visitId: string;
  @IsOptional() @IsIn(['SOAP', 'PROGRESS', 'NURSING', 'WARD_ROUND', 'DISCHARGE', 'OPERATION', 'SPECIALTY']) type?: string;
  @IsOptional() @IsIn(SPECIALTIES) specialty?: string;
  @IsOptional() @IsString() subjective?: string;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsString() assessment?: string;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
  @IsOptional() @IsBoolean() sensitive?: boolean;
  @IsOptional() @IsBoolean() aiDrafted?: boolean;
  @IsOptional() @IsBoolean() sign?: boolean;
}
export class UpdateNoteDto {
  @IsOptional() @IsString() subjective?: string;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsString() assessment?: string;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}

export class DiagnosisDto {
  @IsUUID() visitId: string;
  @IsString() code: string;
  @IsOptional() @IsString() display?: string;
  @IsOptional() @IsIn(['ICD-11', 'ICD-10']) codeSystem?: string;
  @IsOptional() @IsIn(['PRIMARY', 'SECONDARY', 'PROVISIONAL']) type?: string;
}

export class VisitRefQuery { @IsUUID() visitId: string }
export class IcdQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
