import type { RawTelemetry } from '@ff/shared';

/**
 * SimVar subscription definitions. Each row:
 *   [simvar name, units]
 * Order matters — parseDataBlock() reads floats in the same order.
 */
export const SIM_VARS = [
  ['PLANE LATITUDE', 'degrees'],
  ['PLANE LONGITUDE', 'degrees'],
  ['PLANE ALTITUDE', 'feet'],
  ['INDICATED ALTITUDE', 'feet'],
  ['GROUND VELOCITY', 'knots'],
  ['AIRSPEED INDICATED', 'knots'],
  ['AIRSPEED MACH', 'mach'],
  ['PLANE HEADING DEGREES MAGNETIC', 'degrees'],
  ['PLANE HEADING DEGREES TRUE', 'degrees'],
  ['GPS GROUND MAGNETIC TRACK', 'degrees'],
  ['VERTICAL SPEED', 'feet per minute'],
  ['AMBIENT WIND DIRECTION', 'degrees'],
  ['AMBIENT WIND VELOCITY', 'knots'],
  ['SIM ON GROUND', 'bool'],
  ['ZULU YEAR', 'number'],
  ['ZULU MONTH OF YEAR', 'number'],
  ['ZULU DAY OF MONTH', 'number'],
  ['ZULU TIME', 'seconds'],
] as const;

export function buildTelemetry(values: number[], timestamp: number): RawTelemetry {
  const [
    lat, lon,
    altMsl, altIndicated,
    gs, ias, mach,
    hdgMag, hdgTrue, trackMag,
    vs,
    windDir, windVel,
    onGround,
    zuluYear, zuluMonth, zuluDay, zuluTime,
  ] = values as number[];

  // MSFS reports year=0 before a flight is loaded. We treat anything before
  // 1900 (and any non-finite value) as "no sim time" so the FE falls back to
  // wall-clock. This project targets present-day airline scenarios; adjust if
  // historical missions are ever added.
  const simTimeUtc =
    Number.isFinite(zuluYear) && (zuluYear as number) >= 1900
      ? Date.UTC(zuluYear as number, (zuluMonth ?? 1) - 1, zuluDay ?? 1) + (zuluTime ?? 0) * 1000
      : undefined;

  return {
    timestamp,
    position: { lat: lat ?? 0, lon: lon ?? 0 },
    altitude: { msl: altMsl ?? 0, indicated: altIndicated },
    speed: { ground: gs ?? 0, indicated: ias ?? 0, mach: mach ?? 0 },
    heading: { magnetic: hdgMag ?? 0, true: hdgTrue ?? 0 },
    track: { magnetic: trackMag ?? 0 },
    verticalSpeed: vs ?? 0,
    wind: { direction: windDir ?? 0, speed: windVel ?? 0 },
    onGround: (onGround ?? 0) > 0.5,
    simTimeUtc,
  };
}
