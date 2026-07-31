import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Shared strong-password rule (mirrors the other account DTOs). */
const STRONG_PASSWORD = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
const STRONG_PASSWORD_MSG =
  'Password must include a lowercase and uppercase letter, a number and a special character';

/**
 * PATCH /partner/me — edit partner profile. All optional; only sent fields
 * change. The slug is deliberately NOT editable: the referral link is the
 * partner's identity and printed on shared cards.
 */
export class UpdatePartnerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  // Empty string clears the (optional) email.
  @IsOptional()
  @IsString()
  @MaxLength(254)
  @Matches(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: 'A valid email is required',
  })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone?: string;
}

/** POST /partner/password/change — requires the current password. */
export class PartnerChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MSG })
  newPassword!: string;
}

/** POST /partner/account/delete — requires the password to confirm. */
export class PartnerDeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
