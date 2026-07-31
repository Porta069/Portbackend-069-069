import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Shared strong-password rule (mirrors CompleteRegistrationDto). */
const STRONG_PASSWORD =
  /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
const STRONG_PASSWORD_MSG =
  'Password must include a lowercase and uppercase letter, a number and a special character';

/** PATCH /auth/me — edit profile fields. All optional; only sent ones change. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone?: string;

  /** The onboarding answers (survey + AI + work locations) — stored opaquely. */
  @IsOptional()
  @IsObject()
  profileData?: Record<string, unknown>;

  /**
   * Optional profile/reference picture as a resized data URL (base64). Empty
   * string clears it. Capped to keep DB rows small (client resizes to ~256px).
   */
  @IsOptional()
  @IsString()
  @MaxLength(700_000)
  avatar?: string;
}

/** POST /auth/me/verify-contact — confirm email/phone with an OTP code. */
export class VerifyContactDto {
  @IsIn(['email', 'sms'])
  channel!: 'email' | 'sms';

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

/** POST /auth/password/change — requires the current password. */
export class ChangePasswordDto {
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

/** POST /auth/email/change — requires the password to confirm. */
export class ChangeEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254)
  newEmail!: string;
}

/** POST /auth/account/delete — requires the password to confirm. */
export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
