import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Gleiche Regel wie bei Registrierung und Passwortwechsel. */
const STRONG_PASSWORD = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
const STRONG_PASSWORD_MSG =
  'Password must include a lowercase and uppercase letter, a number and a special character';

export class ResetPasswordDto {
  /** Single-use token from the password-reset email link. */
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;

  // Ohne diese Prüfung ließe sich die Passwort-Richtlinie über den
  // Zurücksetzen-Weg dauerhaft unterlaufen.
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MSG })
  newPassword!: string;
}
