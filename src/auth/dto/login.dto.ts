import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254)
  email!: string;

  // No min-length here — login must not reveal the password policy. Presence
  // only; the actual check happens against the stored hash.
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
