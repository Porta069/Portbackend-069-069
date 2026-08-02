/**
 * Coarse geography helpers. Positions are city/region-level on purpose —
 * the platform never works with exact addresses before a contact release.
 */

/** Great-circle distance in kilometers. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Rough driving-time estimate from an air-line distance. Calibrated for
 * regional trades commutes (mixed city/Autobahn): ~50 km/h effective average
 * plus a fixed 5-minute overhead.
 */
export function travelMinutes(distanceKm: number): number {
  return Math.round(distanceKm * 1.2 + 5);
}

/** Centroid of a German PLZ "Leitregion" (first digit). */
export interface PlzRegion {
  prefix: string;
  region: string;
  city: string;
  lat: number;
  lng: number;
}

export const PLZ_REGIONS: PlzRegion[] = [
  { prefix: '0', region: 'Sachsen / Leipzig', city: 'Leipzig', lat: 51.34, lng: 12.37 },
  { prefix: '1', region: 'Berlin / Brandenburg', city: 'Berlin', lat: 52.52, lng: 13.4 },
  { prefix: '2', region: 'Hamburg / Niedersachsen', city: 'Hamburg', lat: 53.55, lng: 9.99 },
  { prefix: '3', region: 'Hannover / Kassel', city: 'Hannover', lat: 52.37, lng: 9.73 },
  { prefix: '4', region: 'Ruhrgebiet / Münster', city: 'Dortmund', lat: 51.51, lng: 7.47 },
  { prefix: '5', region: 'Köln / Bonn', city: 'Köln', lat: 50.94, lng: 6.96 },
  { prefix: '6', region: 'Rhein-Main', city: 'Frankfurt', lat: 50.11, lng: 8.68 },
  { prefix: '7', region: 'Stuttgart / Baden', city: 'Stuttgart', lat: 48.78, lng: 9.18 },
  { prefix: '8', region: 'München / Oberbayern', city: 'München', lat: 48.14, lng: 11.58 },
  { prefix: '9', region: 'Nürnberg / Franken', city: 'Nürnberg', lat: 49.45, lng: 11.08 },
];

/** Coarse centroid for a five-digit PLZ, or null if the PLZ is malformed. */
export function plzCentroid(plz: string): PlzRegion | null {
  const p = (plz ?? '').trim();
  if (!/^\d{5}$/.test(p)) return null;
  return PLZ_REGIONS.find((r) => r.prefix === p[0]) ?? null;
}
