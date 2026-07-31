import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Shared strong-password rule (mirrors the account DTOs). */
const STRONG_PASSWORD = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
const STRONG_PASSWORD_MSG =
  'Password must include a lowercase and uppercase letter, a number and a special character';

/** POST /partner/register — create a referral partner after an SMS check. */
export class RegisterPartnerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MSG })
  password!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase letters, digits and hyphens only',
  })
  slug!: string;

  // Proof the phone was SMS-verified (from POST /otp/verify).
  @IsString()
  @MaxLength(500)
  verificationToken!: string;
}
