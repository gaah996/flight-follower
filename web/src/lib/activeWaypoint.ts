import type { FlightProgress, FlightState, Waypoint } from '@ff/shared';

const EARTH_RADIUS_NM = 3440.065;
const MIN_GS_FOR_ETE_KTS = 30;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function eteSec(distanceNm: number, gs: number): number | null {
  if (distanceNm <= 0 || gs < MIN_GS_FOR_ETE_KTS) return null;
  return (distanceNm / gs) * 3600;
}

export type ActiveNext = {
  waypoint: Waypoint | null;
  distanceNm: number | null;
  eteSec: number | null;
  isManual: boolean;
};

export function selectActiveNext(state: FlightState, manualNextIndex: number | null): ActiveNext {
  const { progress, plan, telemetry } = state;
  if (manualNextIndex == null || plan == null) {
    return {
      waypoint: progress.nextWaypoint,
      distanceNm: progress.distanceToNextNm,
      eteSec: progress.eteToNextSec,
      isManual: false,
    };
  }

  // Defensive bounds check.
  const wps = plan.waypoints;
  if (manualNextIndex < 0 || manualNextIndex >= wps.length) {
    return {
      waypoint: progress.nextWaypoint,
      distanceNm: progress.distanceToNextNm,
      eteSec: progress.eteToNextSec,
      isManual: false,
    };
  }

  const wp = wps[manualNextIndex]!;
  if (telemetry == null) {
    return { waypoint: wp, distanceNm: null, eteSec: null, isManual: true };
  }

  const dist = haversineNm(telemetry.position.lat, telemetry.position.lon, wp.lat, wp.lon);
  return {
    waypoint: wp,
    distanceNm: dist,
    eteSec: eteSec(dist, telemetry.speed.ground),
    isManual: true,
  };
}

// Convenience: find the index of the server-derived next waypoint, used to
// seed manualNextIndex when the user first clicks a skip arrow.
export function indexOfServerNext(progress: FlightProgress, plan: FlightState['plan']): number {
  if (plan == null || progress.nextWaypoint == null) return -1;
  const ident = progress.nextWaypoint.ident;
  return plan.waypoints.findIndex((w) => w.ident === ident);
}
