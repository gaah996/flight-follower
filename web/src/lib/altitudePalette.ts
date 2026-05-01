// Maps altitude in feet (MSL) to a color, shared between BreadcrumbTrail and
// FlightPlanCard's altitude-profile glyph.
//
// Stops are chosen to make the climb/cruise/descent phases visually distinct:
// ground = neutral, low-altitude warm tones, mid-altitude greens, high-cruise
// cool tones. Bucketing keeps consecutive same-altitude segments collapsible
// into a single polyline so the breadcrumb stays cheap.

export const ALTITUDE_STOPS: ReadonlyArray<{ ft: number; color: string }> = [
  { ft: 0,      color: '#9ca3af' }, // ground / taxi — gray
  { ft: 5000,   color: '#f59e0b' }, // low climb — amber
  { ft: 10000,  color: '#eab308' }, // pattern altitudes — yellow
  { ft: 18000,  color: '#84cc16' }, // mid-climb — lime
  { ft: 28000,  color: '#22c55e' }, // upper climb — green
  { ft: 36000,  color: '#06b6d4' }, // typical cruise — cyan
  { ft: 42000,  color: '#3b82f6' }, // high cruise — blue
];

export function altitudeBucket(altMsl: number): number {
  let idx = 0;
  for (let i = 0; i < ALTITUDE_STOPS.length; i++) {
    if (altMsl >= ALTITUDE_STOPS[i]!.ft) idx = i;
    else break;
  }
  return idx;
}

export function altitudeToColor(altMsl: number): string {
  return ALTITUDE_STOPS[altitudeBucket(altMsl)]!.color;
}
