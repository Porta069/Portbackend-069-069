import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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

  /** Min 10 chars (length over complexity, per OWASP). Capped to bound work. */
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;
}
