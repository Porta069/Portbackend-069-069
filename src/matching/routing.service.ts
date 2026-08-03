import { Injectable, Logger } from '@nestjs/common';

/**
 * Real driving times via OSRM (Open Source Routing Machine, OpenStreetMap
 * road network). One /table request computes the full origins × destinations
 * matrix, so a job listing costs a single external call.
 *
 * Results are cached in memory per coordinate pair (roads don't change), and
 * every failure degrades gracefully: callers fall back to the air-line
 * estimate, the listing never breaks or blocks on the routing server.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const OSRM_BASE = process.env.OSRM_URL ?? 'https://router.project-osrm.org';
const TIMEOUT_MS = 4_000;
const CACHE_MAX = 10_000;

/** ~11 m precision — enough to reuse routes for identical places. */
const keyOf = (a: LatLng, b: LatLng) =>
  `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly cache = new Map<string, number>();
  // Beobachtung des öffentlichen OSRM-Demo-Servers (keine SLA): steigen die
  // Fehler, ist das das Signal, OSRM_URL auf eine eigene Instanz umzustellen.
  private fetches = 0;
  private failures = 0;

  /**
   * Driving minutes for each (from → to) pair, or null where unavailable.
   * Uncached pairs are fetched in ONE table request over the unique points.
   */
  async drivingMinutes(
    pairs: { from: LatLng; to: LatLng }[],
  ): Promise<(number | null)[]> {
    const missing = pairs.filter((p) => !this.cache.has(keyOf(p.from, p.to)));

    if (missing.length > 0) {
      await this.fetchTable(missing);
    }
    return pairs.map((p) => this.cache.get(keyOf(p.from, p.to)) ?? null);
  }

  private async fetchTable(pairs: { from: LatLng; to: LatLng }[]): Promise<void> {
    // Unique origins and destinations (a listing has few work locations but
    // many jobs — the matrix stays small).
    const uniq = (points: LatLng[]) => {
      const seen = new Map<string, LatLng>();
      for (const p of points) {
        seen.set(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`, p);
      }
      return [...seen.values()];
    };
    const sources = uniq(pairs.map((p) => p.from));
    const destinations = uniq(pairs.map((p) => p.to));
    // Demo-server table limit is ~100 coordinates — plenty for now; truncate
    // defensively instead of failing the whole request.
    if (sources.length + destinations.length > 90) {
      destinations.length = Math.max(1, 90 - sources.length);
    }

    // Auf ~110 m gerundet: für eine Fahrzeit mehr als genau genug, aber die
    // exakte Position einer Person verlässt damit unser System nicht.
    const coords = [...sources, ...destinations]
      .map((p) => `${p.lng.toFixed(3)},${p.lat.toFixed(3)}`)
      .join(';');
    const srcIdx = sources.map((_, i) => i).join(';');
    const dstIdx = destinations.map((_, i) => i + sources.length).join(';');
    const url =
      `${OSRM_BASE}/table/v1/driving/${coords}` +
      `?sources=${srcIdx}&destinations=${dstIdx}&annotations=duration`;

    try {
      this.fetches++;
      if (this.fetches % 25 === 0) {
        this.logger.log(
          `OSRM usage: ${this.fetches} fetches, ${this.failures} failures, cache ${this.cache.size}`,
        );
      }
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Identifizierende Kennung — verlangt die Nutzungsetikette der
        // OpenStreetMap-Dienste und macht uns bei Problemen ansprechbar.
        headers: { 'User-Agent': 'PortaWerk/1.0 (kontakt@portawerk.de)' },
      });
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const json = (await res.json()) as {
        code?: string;
        durations?: (number | null)[][];
      };
      if (json.code !== 'Ok' || !json.durations) {
        throw new Error(`OSRM code ${json.code}`);
      }

      if (this.cache.size > CACHE_MAX) this.cache.clear();
      sources.forEach((s, i) => {
        destinations.forEach((d, j) => {
          const seconds = json.durations?.[i]?.[j];
          if (typeof seconds === 'number') {
            this.cache.set(keyOf(s, d), Math.max(1, Math.round(seconds / 60)));
          }
        });
      });
    } catch (e) {
      // Fallback path: callers keep the air-line estimate.
      this.failures++;
      this.logger.warn(
        `OSRM unavailable (${this.failures}/${this.fetches} failed), using estimate (${String(e)})`,
      );
    }
  }
}
