import type { FlightPlan, LatLon } from '@ff/shared';
import { haversineNm } from './distance.js';
import { alongTrackNm } from './progress.js';

/**
 * Route-following distance to destination in nautical miles: along-track
 * remainder of the current leg + sum of remaining leg lengths.
 *
 * passedIndex is interpreted in the FlightPlan.waypoints array (existing
 * convention): -1 means no waypoint passed yet (current leg is origin →
 * waypoints[0]); N-1 means past the last named waypoint (current leg is
 * lastWaypoint → destination). When waypoints is empty, the route is a
 * single leg origin → destination.
 */
export function routeRemainingNm(
  pos: LatLon,
  plan: FlightPlan,
  passedIndex: number,
): number {
  // Build the combined route. legCount = combined.length - 1.
  const combined: LatLon[] = [
    plan.origin,
    ...plan.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
    plan.destination,
  ];
  // Current leg in combined-list space = passedIndex + 1.
  // (passedIndex = -1 → current leg index = 0 = [origin, waypoints[0]].)
  const currentLegIdx = Math.max(0, passedIndex + 1);
  if (currentLegIdx >= combined.length - 1) {
    // We are on or past the final leg's end (destination). Nothing remains.
    return 0;
  }

  const a = combined[currentLegIdx]!;
  const b = combined[currentLegIdx + 1]!;
  const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
  let currentLegRemainder: number;
  if (legNm === 0) {
    currentLegRemainder = 0;
  } else {
    const along = alongTrackNm(pos, a, b);
    const alongClamped = Math.max(0, Math.min(legNm, along));
    currentLegRemainder = legNm - alongClamped;
  }

  let restNm = 0;
  for (let i = currentLegIdx + 1; i < combined.length - 1; i++) {
    restNm += haversineNm(
      combined[i]!.lat,
      combined[i]!.lon,
      combined[i + 1]!.lat,
      combined[i + 1]!.lon,
    );
  }

  return currentLegRemainder + restNm;
}
