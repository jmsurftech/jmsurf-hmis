import { IsIn, IsString, Length } from 'class-validator';

export class TemplateDto {
  @IsString() @Length(1, 40) code: string;
  @IsIn(['en', 'sw']) lang: string;
  @IsString() @Length(1, 640) body: string;
}
