import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsIn(['email', 'sms'])
  channel!: 'email' | 'sms';

  @IsString()
  @MinLength(3)
  @MaxLength(254)
  contact!: string;

  /** Exactly 6 numeric digits. */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
