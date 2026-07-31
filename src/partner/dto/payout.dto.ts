import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** PATCH /partner/payout — the bank details the reward is paid to. */
export class UpdatePayoutDto {
  @IsOptional()
  @IsString()
  @MinLength(15)
  @MaxLength(34)
  @Matches(/^[A-Z]{2}[0-9A-Z]+$/, { message: 'iban must be a valid IBAN' })
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  holder?: string;
}
