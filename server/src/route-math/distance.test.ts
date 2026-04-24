import { describe, expect, it } from 'vitest';
import { haversineNm, bearingDeg } from './distance.js';

describe('haversineNm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineNm(40, -70, 40, -70)).toBe(0);
  });

  it('returns LAX–JFK great-circle distance within 1 nm of 2145 nm', () => {
    const d = haversineNm(33.9425, -118.4081, 40.6413, -73.7781);
    expect(d).toBeGreaterThan(2144);
    expect(d).toBeLessThan(2147);
  });

  it('is symmetric', () => {
    const a = haversineNm(10, 20, 30, 40);
    const b = haversineNm(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('bearingDeg', () => {
  it('returns 0 for due north', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 4);
  });

  it('returns 90 for due east at the equator', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 4);
  });

  it('returns value in [0, 360)', () => {
    const b = bearingDeg(0, 0, -1, -1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});
