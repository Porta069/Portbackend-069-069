import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  FIRST_PLACEHOLDER_STEP,
  LAST_PLACEHOLDER_STEP,
} from '../registration-steps';

/**
 * Payload for one of the placeholder wizard steps (1–5). `data` is an opaque,
 * free-form object — these steps are not specified yet, so its contents are
 * stored as-is on the draft and not validated field-by-field.
 */
export class RegistrationStepDto {
  /** Registration-draft token returned by POST /auth/registration/start. */
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  draftToken!: string;

  @IsInt()
  @Min(FIRST_PLACEHOLDER_STEP)
  @Max(LAST_PLACEHOLDER_STEP)
  step!: number;

  /** Opaque per-step payload. Schema TBD; captured verbatim for now. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
