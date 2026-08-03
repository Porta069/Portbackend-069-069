import { Injectable, Logger } from '@nestjs/common';
import { PLZ_REGIONS, plzCentroid } from './geo.util';

/**
 * Postleitzahl → Koordinaten.
 *
 * Vorher lag hier nur eine Leitregion-Tabelle, die ausschließlich die ERSTE
 * Ziffer auswertete: 74072 Heilbronn, 76133 Karlsruhe und 78462 Konstanz
 * landeten alle auf demselben Punkt (Stuttgart) — bis zu 200 km daneben.
 * Da an dieser Koordinate jede Fahrzeit, jeder Umkreisfilter und die
 * Match-Begründung hängen, war die wichtigste Größe im Handwerk ("wie weit
 * ist es?") faktisch geraten.
 *
 * Jetzt wird die vollständige PLZ über Nominatim (OpenStreetMap) aufgelöst und
 * dauerhaft im Speicher behalten. Fällt der Dienst aus, greift die alte
 * Leitregion als grobe Näherung — die Anwendung bleibt also immer bedienbar,
 * nur ungenauer.
 */

export interface Coordinates {
  lat: number;
  lng: number;
  /** false = Rückfall auf die grobe Leitregion. */
  exact: boolean;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 4_000;

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, Coordinates>();
  /** Fehlgeschlagene Abfragen kurz merken, um nicht in Schleifen zu laufen. */
  private readonly failedUntil = new Map<string, number>();

  /** Grobe Näherung ohne Netzzugriff (Leitregion, erste Ziffer). */
  fallback(plz: string): Coordinates | null {
    const region = plzCentroid(plz);
    return region ? { lat: region.lat, lng: region.lng, exact: false } : null;
  }

  /**
   * Löst eine fünfstellige PLZ auf. Liefert `null`, wenn die PLZ ungültig ist.
   * Bei Netzproblemen kommt die Leitregion zurück (exact: false).
   */
  async resolve(plz: string): Promise<Coordinates | null> {
    const key = (plz ?? '').trim();
    if (!/^\d{5}$/.test(key)) return null;

    const cached = this.cache.get(key);
    if (cached) return cached;

    const blockedUntil = this.failedUntil.get(key) ?? 0;
    if (Date.now() < blockedUntil) return this.fallback(key);

    try {
      const url =
        `${NOMINATIM}?postalcode=${key}&country=Germany&format=json&limit=1`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // Nominatim verlangt eine identifizierende Kennung.
          'User-Agent': 'PortaWerk/1.0 (kontakt@portawerk.de)',
          'Accept-Language': 'de',
        },
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const json = (await res.json()) as { lat?: string; lon?: string }[];
      const hit = json[0];
      if (hit?.lat && hit?.lon) {
        const coords: Coordinates = {
          lat: Number(hit.lat),
          lng: Number(hit.lon),
          exact: true,
        };
        if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
          this.cache.set(key, coords);
          return coords;
        }
      }
      // Keine Fundstelle: Leitregion merken, damit wir nicht erneut fragen.
      const fb = this.fallback(key);
      if (fb) this.cache.set(key, fb);
      return fb;
    } catch (e) {
      this.failedUntil.set(key, Date.now() + 60_000);
      this.logger.warn(`PLZ ${key} nicht auflösbar, nutze Leitregion (${String(e)})`);
      return this.fallback(key);
    }
  }

  /** Anzahl bekannter Leitregionen — nur für Diagnosezwecke. */
  get regionCount(): number {
    return PLZ_REGIONS.length;
  }
}
