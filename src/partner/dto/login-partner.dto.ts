import { IsString, MaxLength, MinLength } from 'class-validator';

/** POST /partner/login — sign in with phone (or slug) + password. */
export class LoginPartnerDto {
  // A single identifier: the partner's phone number or their referral slug.
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  identifier!: string;

  // Presence only — the real check happens against the stored hash.
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
