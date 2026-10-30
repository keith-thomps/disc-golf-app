import type { LatLng } from './types.ts';

const EARTH_RADIUS_M = 6_371_008.8;
export const FEET_PER_METER = 3.280839895;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters (haversine). Accurate to well under a foot at disc golf ranges. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceFeet(a: LatLng, b: LatLng): number {
  return distanceMeters(a, b) * FEET_PER_METER;
}

/** Initial compass bearing from a to b, 0-360 degrees (0 = north). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(bearing: number): string {
  return COMPASS[Math.round(bearing / 45) % 8];
}

/**
 * Average several GPS fixes into one point, weighting by 1/accuracy^2.
 * Used when a player surveys a tee or basket by standing on it.
 */
export function averageFixes(fixes: { coord: LatLng; accuracyM: number | null }[]): LatLng | null {
  if (fixes.length === 0) return null;
  let wSum = 0;
  let lat = 0;
  let lng = 0;
  for (const f of fixes) {
    const acc = Math.max(1, f.accuracyM ?? 10);
    const w = 1 / (acc * acc);
    wSum += w;
    lat += f.coord.lat * w;
    lng += f.coord.lng * w;
  }
  return { lat: lat / wSum, lng: lng / wSum };
}
