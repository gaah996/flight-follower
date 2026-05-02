import { describe, expect, it } from 'vitest';
import { buildTelemetry } from './variables.js';

// Order in SIM_VARS:
//   lat, lon, altMsl, altIndicated, gs, ias, mach,
//   hdgMag, hdgTrue, trackMag, vs, windDir, windVel, onGround,
//   zuluYear, zuluMonth, zuluDay, zuluTime
const baseValues = [52.36, 13.51, 1000, 9500, 200, 200, 0.3, 90, 45, 47, 0, 270, 12, 0];

describe('buildTelemetry', () => {
  it('composes simTimeUtc from ZULU YEAR/MONTH/DAY/TIME', () => {
    const zuluTimeSec = 12 * 3600 + 34 * 60 + 56; // 12:34:56 UTC
    const t = buildTelemetry([...baseValues, 2026, 4, 25, zuluTimeSec], 1000);
    expect(t.simTimeUtc).toBe(Date.UTC(2026, 3, 25, 12, 34, 56));
  });

  it('leaves simTimeUtc undefined when ZULU year is 0', () => {
    const t = buildTelemetry([...baseValues, 0, 0, 0, 0], 1000);
    expect(t.simTimeUtc).toBeUndefined();
  });

  it('still populates the existing telemetry fields', () => {
    const t = buildTelemetry([...baseValues, 2026, 4, 25, 0], 1000);
    expect(t.position).toEqual({ lat: 52.36, lon: 13.51 });
    expect(t.heading.magnetic).toBe(90);
    expect(t.heading.true).toBeCloseTo(45);
    expect(t.track.magnetic).toBeCloseTo(47);
    expect(t.altitude.indicated).toBeCloseTo(9500);
    expect(t.timestamp).toBe(1000);
  });

  it('handles end-of-year boundary (December 31, 23:59:59 UTC)', () => {
    const zuluTimeSec = 23 * 3600 + 59 * 60 + 59;
    const t = buildTelemetry([...baseValues, 2026, 12, 31, zuluTimeSec], 1000);
    expect(t.simTimeUtc).toBe(Date.UTC(2026, 11, 31, 23, 59, 59));
  });
});
