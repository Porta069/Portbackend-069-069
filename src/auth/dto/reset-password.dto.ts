import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /** Single-use token from the password-reset email link. */
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword!: string;
}
