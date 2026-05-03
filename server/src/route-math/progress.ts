import type { LatLon, Waypoint } from '@ff/shared';
import { bearingDeg, haversineNm } from './distance.js';

const MIN_GS_FOR_ETE_KTS = 30;
const EARTH_RADIUS_NM = 3440.065;
const FIND_PASSED_INDEX_REACH_NM = 200;
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
 * loaded with telemetry already populated (e.g. user clicks Fetch with
 * the aircraft sitting at the gate, or re-fetches mid-flight) so tracking
 * doesn't snap back to the first waypoint or jump to the destination.
 *
 * Algorithm: find the leg [i, i+1] whose nearest endpoint is closest to
 * pos, then project pos onto only that leg. This is the semantically
 * correct "which leg am I on?" question; an unbounded full-scan
 * along-track misfires when a far leg's bearing aligns with the bearing
 * from its start back to pos (the LFPG → LEPA bug). Tie-breaks pick the
 * smaller-index leg, which keeps cursor advancement at a shared waypoint
 * conservative (advance only when along-track on the earlier leg
 * exceeds its length).
 *
 * Returns:
 *   -1 if no leg's nearest endpoint is within FIND_PASSED_INDEX_REACH_NM
 *      of pos (defensive: the aircraft is too far from the route to make
 *      a confident inference; caller should treat the cursor as fresh).
 *   bestLeg + 1 if along-track on the chosen leg meets or exceeds the
 *      leg's length (we have passed waypoint i+1).
 *   bestLeg if along-track is positive but less than the leg's length
 *      (we are between waypoints i and i+1 along that leg).
 *   -1 if along-track is non-positive (we are still approaching, or the
 *      projection is degenerate).
 *
 * For per-tick advancement, use advancePassedIndexWindowed instead.
 */
export function findPassedIndex(pos: LatLon, waypoints: Waypoint[]): number {
  if (waypoints.length < 2) return -1;
  let bestLeg = -1;
  let bestDist = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const da = haversineNm(pos.lat, pos.lon, a.lat, a.lon);
    const db = haversineNm(pos.lat, pos.lon, b.lat, b.lon);
    const d = Math.min(da, db);
    if (d < bestDist) {
      bestDist = d;
      bestLeg = i;
    }
  }
  if (bestLeg < 0 || bestDist > FIND_PASSED_INDEX_REACH_NM) return -1;
  const a = waypoints[bestLeg]!;
  const b = waypoints[bestLeg + 1]!;
  const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
  if (legNm === 0) return -1;
  const along = alongTrackNm(pos, a, b);
  if (along >= legNm) return bestLeg + 1;
  if (along > 0) return bestLeg;
  return -1;
}

/**
 * Per-tick advancement bounded to a window of legs around the current
 * cursor. Within the window [max(0, currentPassedIndex - 1),
 * min(waypoints.length - 2, currentPassedIndex + 2)], find the leg whose
 * nearest endpoint is closest to pos (smaller-index tiebreak), project
 * pos onto only that leg, and advance forward-only based on along-track
 * on that leg.
 *
 * Why closest-leg-in-window: projecting onto every leg in the window and
 * reducing via Math.max gives 4 separate chances per tick for the
 * "leg's bearing aligns with bearing-from-leg-start-to-pos" misfire to
 * fire. Closest-leg picks only the most relevant leg, which is by
 * definition the one we're actually navigating, and projects only that
 * one. Same algorithm as findPassedIndex; consistent across the three
 * reconciliation paths.
 *
 * Forward-only via Math.max with currentPassedIndex.
 */
export function advancePassedIndexWindowed(
  pos: LatLon,
  waypoints: Waypoint[],
  currentPassedIndex: number,
): number {
  if (waypoints.length < 2) return currentPassedIndex;
  const lo = Math.max(0, currentPassedIndex - 1);
  const hi = Math.min(waypoints.length - 2, currentPassedIndex + 2);
  if (lo > hi) return currentPassedIndex;

  let bestLeg = -1;
  let bestDist = Infinity;
  for (let i = lo; i <= hi; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const da = haversineNm(pos.lat, pos.lon, a.lat, a.lon);
    const db = haversineNm(pos.lat, pos.lon, b.lat, b.lon);
    const d = Math.min(da, db);
    if (d < bestDist) {
      bestDist = d;
      bestLeg = i;
    }
  }
  if (bestLeg < 0) return currentPassedIndex;

  const a = waypoints[bestLeg]!;
  const b = waypoints[bestLeg + 1]!;
  const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
  if (legNm === 0) return currentPassedIndex;
  const along = alongTrackNm(pos, a, b);

  let candidate = currentPassedIndex;
  if (along >= legNm) candidate = bestLeg + 1;
  else if (along > 0) candidate = bestLeg;
  return Math.max(currentPassedIndex, candidate);
}
