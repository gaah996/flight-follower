import type { LatLon, Waypoint } from '@ff/shared';
import { haversineNm } from './distance.js';

const MIN_GS_FOR_ETE_KTS = 30;

export function distanceToWaypointNm(pos: LatLon, wp: Waypoint): number {
  return haversineNm(pos.lat, pos.lon, wp.lat, wp.lon);
}

export function eteSeconds(distanceNm: number, groundSpeedKts: number): number | null {
  if (distanceNm <= 0 || groundSpeedKts < MIN_GS_FOR_ETE_KTS) return null;
  return (distanceNm / groundSpeedKts) * 3600;
}

/**
 * Advance the "passed" waypoint cursor if the aircraft is within
 * thresholdNm of the next unpassed waypoint. Cursor never moves backwards.
 */
export function advancePassedIndex(
  pos: LatLon,
  waypoints: Waypoint[],
  currentPassedIndex: number,
  thresholdNm: number,
): number {
  let idx = currentPassedIndex;
  while (idx < waypoints.length - 1) {
    const next = waypoints[idx + 1]!;
    if (distanceToWaypointNm(pos, next) <= thresholdNm) {
      idx += 1;
    } else {
      break;
    }
  }
  return idx;
}

/**
 * Estimate which waypoint has been most recently passed based purely on
 * current position. Used to seed the passedIndex cursor when a plan is
 * loaded mid-flight (e.g. after re-fetching from Simbrief) so tracking
 * doesn't snap back to the first waypoint.
 *
 * Heuristic: the largest index N for which the aircraft is closer to
 * waypoint N+1 than to waypoint N. Returns -1 when the aircraft is still
 * approaching the first waypoint, or for empty plans.
 */
export function findPassedIndex(pos: LatLon, waypoints: Waypoint[]): number {
  let passed = -1;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const distHere = distanceToWaypointNm(pos, waypoints[i]!);
    const distNext = distanceToWaypointNm(pos, waypoints[i + 1]!);
    if (distNext < distHere) passed = i;
  }
  return passed;
}
