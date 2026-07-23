import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsIn(['email', 'sms'])
  channel!: 'email' | 'sms';

  /** Email address or phone number, depending on channel. */
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  contact!: string;
}
