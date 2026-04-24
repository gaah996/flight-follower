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
  ['GROUND VELOCITY', 'knots'],
  ['AIRSPEED INDICATED', 'knots'],
  ['AIRSPEED MACH', 'mach'],
  ['PLANE HEADING DEGREES MAGNETIC', 'degrees'],
  ['VERTICAL SPEED', 'feet per minute'],
  ['AMBIENT WIND DIRECTION', 'degrees'],
  ['AMBIENT WIND VELOCITY', 'knots'],
  ['SIM ON GROUND', 'bool'],
] as const;

export function buildTelemetry(values: number[], timestamp: number): RawTelemetry {
  const [lat, lon, alt, gs, ias, mach, hdg, vs, windDir, windVel, onGround] = values as number[];
  return {
    timestamp,
    position: { lat: lat ?? 0, lon: lon ?? 0 },
    altitude: { msl: alt ?? 0 },
    speed: { ground: gs ?? 0, indicated: ias ?? 0, mach: mach ?? 0 },
    heading: { magnetic: hdg ?? 0 },
    verticalSpeed: vs ?? 0,
    wind: { direction: windDir ?? 0, speed: windVel ?? 0 },
    onGround: (onGround ?? 0) > 0.5,
  };
}
