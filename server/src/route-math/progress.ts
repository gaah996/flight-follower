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
