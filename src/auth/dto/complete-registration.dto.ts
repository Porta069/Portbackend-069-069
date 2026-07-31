import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * The final contact step of the registration wizard. Collects the applicant's
 * name, email and phone plus a password, and (given a valid draft token)
 * creates the User account.
 */
export class CompleteRegistrationDto {
  /** Registration-draft token returned by POST /auth/registration/start. */
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  draftToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone!: string;

  /**
   * Min 10 chars AND at least one lowercase, uppercase, digit and special
   * character. Enforced server-side so the client policy can't be bypassed.
   * Capped to bound hashing work.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message:
      'Password must include a lowercase and uppercase letter, a number and a special character',
  })
  password!: string;

  /** Optional referral name/code the applicant entered ("Empfohlen von"). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  referredBy?: string;
}
