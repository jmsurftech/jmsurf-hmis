import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PageQueryDto } from '../shared/pagination';

export class CompartmentDto { @IsString() label: string; @IsOptional() @IsIn(['COLD', 'DEEP_FREEZE']) type?: string }
export class CompartmentStatusDto { @IsIn(['AVAILABLE', 'MAINTENANCE']) status: string }
export class BodyAdmissionDto {
  @IsIn(['WARD_DEATH', 'BROUGHT_IN_DEAD']) source: string;
  /** WARD_DEATH: the inpatient admission (patient is taken from it). */
  @IsOptional() @IsUUID() admissionId?: string;
  /** BROUGHT_IN_DEAD: existing patient record, or name details to register one. */
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsString() firstName?: string; @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE', 'UNKNOWN']) sex?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ageYears?: number;
  @IsOptional() @IsDateString() dateOfDeath?: string;
  @IsOptional() @IsString() causeOfDeath?: string;
  @IsOptional() @IsString() broughtBy?: string; @IsOptional() @IsString() policeObNumber?: string;
  @IsOptional() @IsUUID() compartmentId?: string;
}
export class CaseQuery extends PageQueryDto { @IsOptional() @IsString() status?: string }
export class AssignCompartmentDto { @IsUUID() compartmentId: string }
export class PmRequestDto { @IsString() requestedBy: string; @IsOptional() @IsString() reason?: string }
export class PmReportDto { @IsString() pathologist: string; @IsString() findings: string; @IsString() causeOfDeath: string }
export class ReleaseDto {
  @IsString() releasedTo: string; @IsString() releasedToIdNo: string; @IsString() relationship: string;
  @IsString() burialPermitNo: string; @IsOptional() @IsDateString() burialPermitDate?: string;
  @IsOptional() @IsIn(['BURIAL', 'CREMATION']) disposalMethod?: string; @IsOptional() @IsString() destination?: string;
}
