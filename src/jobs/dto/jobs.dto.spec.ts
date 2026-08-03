// Die DTO-Dekoratoren brauchen die Metadaten-Erweiterung; im laufenden Server
// lädt Nest sie selbst, im Test müssen wir sie hier hereinholen.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListJobsQueryDto, TravelQueryDto } from './jobs.dto';

/**
 * Query-Werte kommen immer als Text an. Ein leerer Text wurde von
 * `Number('')` klaglos zur 0 — bei Koordinaten hieß das: Route ab dem
 * Äquator, ausgewiesen als „genaue Route". Diese Tests halten fest, dass
 * leere Werte als „nicht angegeben" gelten und nicht als Null.
 */
const check = <T extends object>(cls: new () => T, query: Record<string, string>) => {
  const dto = plainToInstance(cls, query, { enableImplicitConversion: false });
  return { dto, errors: validateSync(dto as object) };
};

describe('TravelQueryDto', () => {
  it('nimmt gültige Koordinaten als Zahlen an', () => {
    const { dto, errors } = check(TravelQueryDto, { lat: '49.1427', lng: '9.2109' });
    expect(errors).toHaveLength(0);
    expect(dto.lat).toBe(49.1427);
    expect(dto.lng).toBe(9.2109);
  });

  it('weist einen leeren Breitengrad ab, statt vom Äquator zu rechnen', () => {
    const { dto, errors } = check(TravelQueryDto, { lat: '', lng: '7.5' });
    expect(dto.lat).toBeUndefined();
    expect(errors.map((e) => e.property)).toContain('lat');
  });

  it('weist Text ab, der keine Zahl ist', () => {
    const { errors } = check(TravelQueryDto, { lat: 'undefined', lng: '7.5' });
    expect(errors.map((e) => e.property)).toContain('lat');
  });

  it('weist Koordinaten außerhalb der Erde ab', () => {
    const { errors } = check(TravelQueryDto, { lat: '91', lng: '181' });
    expect(errors.map((e) => e.property).sort()).toEqual(['lat', 'lng']);
  });

  it('verlangt beide Angaben', () => {
    const { errors } = check(TravelQueryDto, {});
    expect(errors.map((e) => e.property).sort()).toEqual(['lat', 'lng']);
  });
});

describe('ListJobsQueryDto', () => {
  it('behandelt einen leeren Filterwert als nicht gesetzt', () => {
    const { dto, errors } = check(ListJobsQueryDto, { maxTravelMinutes: '', minSalary: '' });
    expect(errors).toHaveLength(0);
    expect(dto.maxTravelMinutes).toBeUndefined();
    expect(dto.minSalary).toBeUndefined();
  });

  it('wandelt gesetzte Filterwerte in Zahlen um', () => {
    const { dto, errors } = check(ListJobsQueryDto, { maxTravelMinutes: '45', minSalary: '3000' });
    expect(errors).toHaveLength(0);
    expect(dto.maxTravelMinutes).toBe(45);
    expect(dto.minSalary).toBe(3000);
  });
});
