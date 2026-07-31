import { IsString, MaxLength, MinLength } from 'class-validator';

/** Payload for the live email-deliverability check (POST /auth/email/check). */
export class CheckEmailDto {
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  email!: string;
}
