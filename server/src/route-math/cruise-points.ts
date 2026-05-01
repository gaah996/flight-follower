import type { LatLon, Waypoint } from '@ff/shared';

function namedPosition(waypoints: Waypoint[], ident: 'TOC' | 'TOD'): LatLon | null {
  const w = waypoints.find((x) => x.ident === ident);
  return w ? { lat: w.lat, lon: w.lon } : null;
}

function effectiveCruiseAltitude(
  waypoints: Waypoint[],
  cruiseAltitudeFt: number | undefined,
): number | null {
  if (cruiseAltitudeFt != null && cruiseAltitudeFt > 0) return cruiseAltitudeFt;
  const max = waypoints.reduce(
    (m, w) => (w.plannedAltitude != null && w.plannedAltitude > m ? w.plannedAltitude : m),
    0,
  );
  return max > 0 ? max : null;
}

export function findTOC(waypoints: Waypoint[], cruiseAltitudeFt?: number): LatLon | null {
  const named = namedPosition(waypoints, 'TOC');
  if (named) return named;

  const cruise = effectiveCruiseAltitude(waypoints, cruiseAltitudeFt);
  if (cruise == null) return null;

  for (const w of waypoints) {
    if (w.plannedAltitude != null && w.plannedAltitude >= cruise) {
      return { lat: w.lat, lon: w.lon };
    }
  }
  return null;
}

export function findTOD(waypoints: Waypoint[], cruiseAltitudeFt?: number): LatLon | null {
  const named = namedPosition(waypoints, 'TOD');
  if (named) return named;

  const cruise = effectiveCruiseAltitude(waypoints, cruiseAltitudeFt);
  if (cruise == null) return null;

  let lastAtCruiseIdx = -1;
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i]!;
    if (w.plannedAltitude != null && w.plannedAltitude >= cruise) {
      lastAtCruiseIdx = i;
    }
  }
  if (lastAtCruiseIdx < 0) return null;
  const w = waypoints[lastAtCruiseIdx]!;
  return { lat: w.lat, lon: w.lon };
}
