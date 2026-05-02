import type { LatLon, Waypoint } from '@ff/shared';
import { bearingDeg, haversineNm } from './distance.js';

const MIN_GS_FOR_ETE_KTS = 30;
const EARTH_RADIUS_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Signed along-track distance: how far `pos` projects onto the great-circle
 * leg from `from` to `to`, measured in nautical miles from `from`. Negative
 * when the projection falls "behind" `from`. Greater than the leg's own
 * length when `pos` projects past `to`.
 */
export function alongTrackNm(pos: LatLon, from: LatLon, to: LatLon): number {
  const d13 = haversineNm(from.lat, from.lon, pos.lat, pos.lon);
  if (d13 === 0) return 0;
  const b13 = toRad(bearingDeg(from.lat, from.lon, pos.lat, pos.lon));
  const b12 = toRad(bearingDeg(from.lat, from.lon, to.lat, to.lon));
  const angularDist = d13 / EARTH_RADIUS_NM;
  const dxtRad = Math.asin(Math.sin(angularDist) * Math.sin(b13 - b12));
  const datRad = Math.acos(Math.cos(angularDist) / Math.cos(dxtRad));
  const sign = Math.cos(b13 - b12) >= 0 ? 1 : -1;
  return datRad * EARTH_RADIUS_NM * sign;
}

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
 * Walks each leg [i, i+1] and projects the aircraft onto it via along-track
 * distance. If the projection lands past the leg's length, waypoint i+1 has
 * been passed (passed = i+1). If it lands within the leg, waypoint i has
 * been passed but i+1 has not (passed = i). Returns the largest such index
 * across all legs, or -1 when the aircraft is still approaching the first
 * waypoint or no leg analysis succeeds.
 *
 * Using along-track instead of raw distance correctly handles the
 * "just past waypoint N" case — when the aircraft is close to N but on the
 * far side, the along-track value exceeds the [N-1, N] leg length and
 * tracking advances to N+1 (rather than re-targeting N).
 */
export function findPassedIndex(pos: LatLon, waypoints: Waypoint[]): number {
  let passed = -1;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    if (legNm === 0) continue;
    const along = alongTrackNm(pos, a, b);
    if (along >= legNm) {
      // Past waypoint i+1 along this leg's direction.
      if (i + 1 > passed) passed = i + 1;
    } else if (along > 0) {
      // Between waypoint i and i+1 on this leg.
      if (i > passed) passed = i;
    }
    // along < 0 → projection is behind waypoint i on this leg; ignore.
  }
  return passed;
}

/**
 * Per-tick advancement bounded to a window of legs around the current
 * cursor. Considers legs [i, i+1] where i is in
 *   [max(0, currentPassedIndex - 1), min(waypoints.length - 2, currentPassedIndex + 2)].
 * Within that window, applies the same along-track logic as findPassedIndex
 * (project pos onto leg [i, i+1]; advance to i+1 when along >= legNm,
 * otherwise mark i as passed when along > 0); takes the max with
 * currentPassedIndex (forward-only).
 *
 * Why a window: full-scan along-track misfires when pos is far from a leg
 * but roughly collinear with it (e.g. at the LFPG origin, a near-destination
 * leg's bearing aligns with the bearing from that leg's start back to LFPG;
 * along-track returns a large positive value despite pos being hundreds of
 * nm away). Reconciliation only needs to look near the current expected
 * position; arbitrary-distance jumps across the route are not a real
 * telemetry-tick scenario.
 */
export function advancePassedIndexWindowed(
  pos: LatLon,
  waypoints: Waypoint[],
  currentPassedIndex: number,
): number {
  if (waypoints.length < 2) return currentPassedIndex;
  const lo = Math.max(0, currentPassedIndex - 1);
  const hi = Math.min(waypoints.length - 2, currentPassedIndex + 2);
  let passed = currentPassedIndex;
  for (let i = lo; i <= hi; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    if (legNm === 0) continue;
    const along = alongTrackNm(pos, a, b);
    if (along >= legNm) {
      if (i + 1 > passed) passed = i + 1;
    } else if (along > 0) {
      if (i > passed) passed = i;
    }
  }
  return passed;
}
