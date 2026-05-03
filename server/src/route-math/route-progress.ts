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

/**
 * Cumulative route distance from origin to a point that lies on the planned
 * route, summed along the legs `[origin, ...waypoints, destination]`.
 * Handles three cases:
 *   - Point matches a leg endpoint: returns the cumulative distance to that
 *     endpoint exactly.
 *   - Point lies on a leg interior (along-track in (0, legNm)): returns
 *     cumulative-to-leg-start + along-track.
 *   - Point isn't on any leg (within tolerance): returns null.
 *
 * Used to place TOC/TOD ticks consistently with the route-following total,
 * including the case where TOC/TOD is an interpolated position from the
 * altitude-scan fallback (not a named waypoint).
 */
export function routeDistanceFromOriginNm(
  point: LatLon,
  plan: FlightPlan,
): number | null {
  const combined: LatLon[] = [
    { lat: plan.origin.lat, lon: plan.origin.lon },
    ...plan.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
    { lat: plan.destination.lat, lon: plan.destination.lon },
  ];
  const ENDPOINT_MATCH_NM = 0.01; // ~60 m
  let cum = 0;
  for (let i = 0; i < combined.length - 1; i++) {
    const a = combined[i]!;
    const b = combined[i + 1]!;
    const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    if (haversineNm(point.lat, point.lon, a.lat, a.lon) < ENDPOINT_MATCH_NM) {
      return cum;
    }
    if (haversineNm(point.lat, point.lon, b.lat, b.lon) < ENDPOINT_MATCH_NM) {
      return cum + legNm;
    }
    if (legNm > 0) {
      const along = alongTrackNm(point, a, b);
      if (along > 0 && along < legNm) {
        return cum + along;
      }
    }
    cum += legNm;
  }
  return null;
}
