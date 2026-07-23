import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Text fields of the multipart application submission. Files are handled
 * separately by the file interceptor + magic-byte validation.
 *
 * Note: multipart text values arrive as strings, so `consent` is coerced.
 */
export class CreateApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  /** ISO date YYYY-MM-DD. Age is validated in the service. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate must be YYYY-MM-DD' })
  birthDate!: string;

  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  profession?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  federalState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  availability?: string;

  @IsOptional()
  @IsIn(['active', 'passive'])
  searchIntent?: 'active' | 'passive';

  /** Proof-of-verification token returned by POST /otp/verify. */
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  verificationToken!: string;

  /** Explicit GDPR consent for the core placement processing. Must be true. */
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  consent!: boolean;

  /** Separate, withdrawable consent for the optional profile photo. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  consentPhoto?: boolean;

  /** Exact consent wording the frontend displayed (Art. 7(1) proof). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  consentText?: string;

  /** Version identifier of the displayed consent text / privacy notice. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  consentVersion?: string;
}
