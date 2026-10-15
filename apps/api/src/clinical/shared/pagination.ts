import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

export function pageArgs(q: PageQueryDto) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export async function paginate<T>(
  q: PageQueryDto,
  fetch: (skip: number, take: number) => Promise<T[]>,
  count: () => Promise<number>,
) {
  const { page, pageSize, skip, take } = pageArgs(q);
  const [data, total] = await Promise.all([fetch(skip, take), count()]);
  return { data, total, page, pageSize };
}

export const ageInDays = (dob?: Date | null, at = new Date()) =>
  dob ? Math.floor((at.getTime() - new Date(dob).getTime()) / 86400000) : undefined;
