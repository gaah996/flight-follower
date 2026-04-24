import type { LatLon } from '@ff/shared';

const EARTH_RADIUS_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Absolute cross-track distance in nautical miles from `pos` to the great-circle through `a`-`b`. */
export function crossTrackNm(pos: LatLon, a: LatLon, b: LatLon): number {
  const d13 = greatCircleRad(a, pos);
  const brng13 = initialBearingRad(a, pos);
  const brng12 = initialBearingRad(a, b);
  const xt = Math.asin(Math.sin(d13) * Math.sin(brng13 - brng12));
  return Math.abs(xt) * EARTH_RADIUS_NM;
}

function greatCircleRad(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function initialBearingRad(a: LatLon, b: LatLon): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const lambda1 = toRad(a.lon);
  const lambda2 = toRad(b.lon);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return Math.atan2(y, x);
}
