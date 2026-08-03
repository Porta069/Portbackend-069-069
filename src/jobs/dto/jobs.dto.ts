import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** GET /jobs — filters mirror the Jobbörse UI. */
export class ListJobsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;

  /** Comma-separated exact GEWERKE values. */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  gewerke?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTravelMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSalary?: number;

  @IsOptional()
  @IsIn(['1'])
  abendsZuhause?: string;

  @IsOptional()
  @IsIn(['1'])
  fahrzeitIstArbeitszeit?: string;

  @IsOptional()
  @IsIn(['relevanz', 'fahrzeit', 'gehalt', 'neueste'])
  sort?: 'relevanz' | 'fahrzeit' | 'gehalt' | 'neueste';
}

/** GET /jobs/:id/travel — Ausgangspunkt für die exakte Fahrzeit. */
export class TravelQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

/** POST /me/offers/:id/respond */
export class RespondOfferDto {
  @IsIn(['angenommen', 'abgelehnt'])
  decision!: 'angenommen' | 'abgelehnt';

  @IsOptional()
  @IsIn(['zu_weit', 'gehalt', 'montage', 'gewerk', 'sonstiges'])
  reason?: string;
}

/** POST /me/contact-requests/:id/respond */
export class RespondContactRequestDto {
  @IsIn(['freigeben', 'ablehnen'])
  decision!: 'freigeben' | 'ablehnen';
}

export class WorkLocationDto {
  @IsString()
  @MaxLength(60)
  id!: string;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsNumber()
  @Min(1)
  @Max(300)
  radiusKm!: number;
}

/** PUT /me/work-locations */
export class SaveWorkLocationsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WorkLocationDto)
  locations!: WorkLocationDto[];
}
