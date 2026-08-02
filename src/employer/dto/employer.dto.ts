import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** PATCH /employer/profile — field names mirror the frontend EmployerProfile. */
export class UpdateEmployerProfileDto {
  @IsOptional() @IsString() @MaxLength(120) firmenname?: string;
  @IsOptional() @IsString() @MaxLength(160) slogan?: string;
  /** Long-form company description ("Über uns" ausführlich). */
  @IsOptional() @IsString() @MaxLength(8000) beschreibung?: string;
  @IsOptional() @IsString() @MaxLength(1200) ueberUns?: string;
  @IsOptional() @IsString() @MaxLength(8) gruendungsjahr?: string;
  @IsOptional() @IsString() @MaxLength(24) mitarbeiter?: string;
  @IsOptional() @IsString() @MaxLength(160) strasse?: string;
  @IsOptional() @IsString() @MaxLength(5) plz?: string;
  @IsOptional() @IsString() @MaxLength(80) ort?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(80) kontaktName?: string;
  @IsOptional() @IsString() @MaxLength(80) kontaktPosition?: string;
  @IsOptional() @IsString() @MaxLength(40) kontaktTelefon?: string;
  @IsOptional() @IsString() @MaxLength(254) kontaktEmail?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) benefits?: string[];
  @IsOptional() @IsString() @MaxLength(40) montage?: string;
  @IsOptional() @IsString() @MaxLength(4) urlaubstage?: string;
  /** Logo as a small data URL; empty string clears it. */
  @IsOptional() @IsString() @MaxLength(700_000) logo?: string;
}

/** One answered match question on a job posting (range + weight). */
export class CriterionInputDto {
  @IsString()
  @MaxLength(60)
  questionKey!: string;

  @IsNumber()
  minValue!: number;

  @IsNumber()
  maxValue!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  weight!: number;
}

/** POST /employer/jobs + PATCH /employer/jobs/:id */
export class SaveJobDto {
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsString() @MinLength(2) @MaxLength(60) gewerk!: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @IsInt() @Min(0) @Max(50_000) salaryMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(50_000) salaryMax?: number;
  @IsOptional() @IsString() @MaxLength(40) montage?: string;
  @IsOptional() @IsBoolean() fahrzeitIstArbeitszeit?: boolean;
  @IsOptional() @IsIn(['Haustür', 'Betrieb']) startpunkt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(60) urlaubstage?: number;
  @IsOptional() @IsString() @MaxLength(40) startText?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) extras?: string[];
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']) status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  criteria?: CriterionInputDto[];
}

/** GET /employer/candidates */
export class CandidateQueryDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: 'plz must be a five-digit postal code' })
  plz!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  radiusKm!: number;

  /** Score candidates against this posting's criteria (default: newest active). */
  @IsOptional()
  @IsString()
  jobPostingId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minErfahrung?: number;

  /** Comma-separated required certificate labels. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  zertifikate?: string;

  /** Comma-separated required willingness labels. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  bereitschaft?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  gewerke?: string;

  @IsOptional()
  @IsIn(['match', 'naehe', 'erfahrung'])
  sort?: 'match' | 'naehe' | 'erfahrung';
}

/** POST /employer/candidates/:id/request */
export class RequestContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  position!: string;
}

/** POST /employer/applications/:id/status — Status, den der Betrieb setzt. */
export class ApplicationStatusDto {
  @IsIn(['gesehen', 'im_gespraech', 'zusage', 'abgelehnt'])
  status!: 'gesehen' | 'im_gespraech' | 'zusage' | 'abgelehnt';
}

/** POST /employer/candidates/:id/offer */
export class SendOfferDto {
  @IsString()
  jobPostingId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

// ── Admin (server-to-server; foundation for the AI intake) ──────────────────

const STRONG_PASSWORD = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;

export class AdminAccountDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD, {
    message:
      'Password must include a lowercase and uppercase letter, a number and a special character',
  })
  password!: string;

  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
}

/**
 * POST /employer/admin/companies — creates a company (plus optional login
 * account and job postings) in one call. This is the entry point the AI
 * pipeline will use after a phone acquisition: companies get listed and
 * matchable WITHOUT ever visiting the platform themselves.
 */
export class AdminCreateCompanyDto {
  @IsObject()
  profile!: Record<string, unknown>; // validated field-by-field in the service via UpdateEmployerProfileDto

  @IsIn(['ADMIN', 'AI'])
  source!: 'ADMIN' | 'AI';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  managedNote?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminAccountDto)
  account?: AdminAccountDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveJobDto)
  jobs?: SaveJobDto[];
}
