import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export const DIET_TYPES = ['NORMAL', 'DIABETIC', 'RENAL', 'LOW_SALT', 'SOFT', 'LIQUID', 'HIGH_PROTEIN', 'HIGH_ENERGY', 'NPO'];
export const MEALS = ['BREAKFAST', 'LUNCH', 'SUPPER'];
export class DietOrderDto {
  @IsUUID() admissionId: string; @IsIn(DIET_TYPES) dietType: string;
  @IsOptional() @IsString() texture?: string; @IsOptional() @IsString() allergies?: string; @IsOptional() @IsString() notes?: string;
}
export class DietQuery extends PageQueryDto { @IsOptional() @IsUUID() wardId?: string; @IsOptional() @IsString() status?: string }
export class GenerateDto { @IsDateString() date: string; @IsIn(MEALS) meal: string; @IsOptional() @IsUUID() wardId?: string }
export class SheetQuery { @IsDateString() date: string; @IsIn(MEALS) meal: string }
