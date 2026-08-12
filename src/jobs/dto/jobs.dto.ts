import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Zahl aus der Adresszeile lesen — ein leerer Wert gilt als „nicht angegeben".
 *
 * `Number('')` ist 0: `?lat=&lng=7.5` berechnete sonst klaglos eine Route ab
 * dem Äquator und wies sie als „genaue Route" aus, und ein leerer Filterwert
 * wurde zur Zahl 0, die dann an der Untergrenze scheiterte. Die Umwandlung
 * gehört deshalb hierher und nicht in `@Type(() => Number)`: dessen
 * Konvertierung läuft ZUERST, sodass diese Prüfung nur noch die 0 zu sehen
 * bekäme und die leere Eingabe gar nicht mehr erkennen könnte.
 */
const numberParam = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = Number(value);
    // Unlesbares unverändert weiterreichen, damit die Prüfung es beanstandet.
    return Number.isFinite(n) ? n : value;
  });

/** GET /jobs — filters mirror the Jobbörse UI. */
export class ListJobsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;

  /**
   * Komma-getrennte Ausbildungsbereiche (Katalogwerte).
   *
   * Früher wurde hier nach dem Freitextfeld `gewerk` gefiltert — einer zweiten
   * Fachsystematik neben der, nach der das Matching arbeitet. Beide konnten
   * sich widersprechen: ein Inserat für den Bereich Elektronik, dessen
   * Gewerk-Text anders lautete, verschwand aus dem Filter, obwohl es passte.
   */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  bereiche?: string;

  @IsOptional()
  @numberParam()
  @IsInt()
  @Min(1)
  maxTravelMinutes?: number;

  @IsOptional()
  @numberParam()
  @IsInt()
  @Min(0)
  minSalary?: number;

  @IsOptional()
  @IsIn(['1'])
  abendsZuhause?: string;

  @IsOptional()
  @IsIn(['1'])
  fahrzeitIstArbeitszeit?: string;

  @IsOptional()
  @IsIn(['relevanz', 'fahrzeit', 'gehalt', 'neueste'])
  sort?: 'relevanz' | 'fahrzeit' | 'gehalt' | 'neueste';
}

/** GET /jobs/:id/travel — Ausgangspunkt für die exakte Fahrzeit. */
export class TravelQueryDto {
  @numberParam()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @numberParam()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

/** POST /me/offers/:id/respond */
export class RespondOfferDto {
  @IsIn(['angenommen', 'abgelehnt'])
  decision!: 'angenommen' | 'abgelehnt';

  @IsOptional()
  @IsIn(['zu_weit', 'gehalt', 'montage', 'gewerk', 'sonstiges'])
  reason?: string;
}

/** POST /me/contact-requests/:id/respond */
export class RespondContactRequestDto {
  @IsIn(['freigeben', 'ablehnen'])
  decision!: 'freigeben' | 'ablehnen';
}

export class WorkLocationDto {
  @IsString()
  @MaxLength(60)
  id!: string;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsNumber()
  @Min(1)
  @Max(300)
  radiusKm!: number;
}

/** PUT /me/work-locations */
export class SaveWorkLocationsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WorkLocationDto)
  locations!: WorkLocationDto[];
}
