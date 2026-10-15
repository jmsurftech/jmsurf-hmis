import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize = 25;
}
export const pageArgs = (q: ListQuery) => ({ skip: ((q.page ?? 1) - 1) * (q.pageSize ?? 25), take: q.pageSize ?? 25 });
export const paged = <T>(data: T[], total: number, q: ListQuery) => ({ data, total, page: q.page ?? 1, pageSize: q.pageSize ?? 25 });
