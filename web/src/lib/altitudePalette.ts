// Maps altitude in feet (MSL) to a color, shared between BreadcrumbTrail and
// FlightPlanCard's altitude-profile glyph.
//
// Colors are linearly interpolated between adjacent stops in RGB space, so
// the breadcrumb fades smoothly through the climb / cruise / descent phases
// rather than stepping at bucket boundaries. Below the first stop or above
// the last stop the palette clamps to the endpoint color.

export const ALTITUDE_STOPS: ReadonlyArray<{ ft: number; color: string }> = [
  { ft: 0,      color: '#9ca3af' }, // ground / taxi — gray
  { ft: 5000,   color: '#f59e0b' }, // low climb — amber
  { ft: 10000,  color: '#eab308' }, // pattern altitudes — yellow
  { ft: 18000,  color: '#84cc16' }, // mid-climb — lime
  { ft: 28000,  color: '#22c55e' }, // upper climb — green
  { ft: 36000,  color: '#06b6d4' }, // typical cruise — cyan
  { ft: 42000,  color: '#3b82f6' }, // high cruise — blue
];

function lerpHex(a: string, b: string, t: number): string {
  const ai = parseInt(a.slice(1), 16);
  const bi = parseInt(b.slice(1), 16);
  const ar = (ai >> 16) & 0xff;
  const ag = (ai >> 8) & 0xff;
  const ab = ai & 0xff;
  const br = (bi >> 16) & 0xff;
  const bg = (bi >> 8) & 0xff;
  const bb = bi & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const c = Math.round(ab + (bb - ab) * t);
  return '#' + ((r << 16) | (g << 8) | c).toString(16).padStart(6, '0');
}

export function altitudeToColor(altMsl: number): string {
  const stops = ALTITUDE_STOPS;
  if (altMsl <= stops[0]!.ft) return stops[0]!.color;
  const last = stops[stops.length - 1]!;
  if (altMsl >= last.ft) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (altMsl >= a.ft && altMsl <= b.ft) {
      const t = (altMsl - a.ft) / (b.ft - a.ft);
      return lerpHex(a.color, b.color, t);
    }
  }
  return last.color;
}
