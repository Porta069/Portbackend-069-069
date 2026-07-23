import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, Max, MaxLength, Min } from 'class-validator';

export class ListApplicationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  /** Optional exact-match email filter for operator-fulfilled DSAR lookups. */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
