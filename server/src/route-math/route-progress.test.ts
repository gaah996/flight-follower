import { describe, expect, it } from 'vitest';
import type { FlightPlan } from '@ff/shared';
import { routeDistanceFromOriginNm, routeRemainingNm } from './route-progress.js';

const planSingleLeg: FlightPlan = {
  fetchedAt: 0,
  origin: { icao: 'AAAA', lat: 0, lon: 0 },
  destination: { icao: 'BBBB', lat: 0, lon: 10 },
  waypoints: [],
};

const planMultiLeg: FlightPlan = {
  fetchedAt: 0,
  origin: { icao: 'AAAA', lat: 0, lon: 0 },
  destination: { icao: 'BBBB', lat: 0, lon: 10 },
  waypoints: [
    { ident: 'W1', lat: 0, lon: 2 },
    { ident: 'W2', lat: 0, lon: 5 },
    { ident: 'W3', lat: 0, lon: 8 },
  ],
};

describe('routeRemainingNm', () => {
  it('returns near total for a single-leg plan with aircraft at origin', () => {
    const r = routeRemainingNm({ lat: 0, lon: 0 }, planSingleLeg, -1);
    // 10° at the equator ≈ 600 nm.
    expect(r).toBeGreaterThan(595);
    expect(r).toBeLessThan(605);
  });

  it('returns 0 for a single-leg plan with aircraft at destination', () => {
    const r = routeRemainingNm({ lat: 0, lon: 10 }, planSingleLeg, -1);
    expect(r).toBeCloseTo(0, 1);
  });

  it('clamps to 0 when aircraft is past the destination on a single-leg plan', () => {
    const r = routeRemainingNm({ lat: 0, lon: 12 }, planSingleLeg, -1);
    expect(r).toBeCloseTo(0, 1);
  });

  it('multi-leg, aircraft at origin: returns ~ sum of all leg distances', () => {
    // 10° at the equator ≈ 600 nm spread across origin→W1 (2°) + W1→W2 (3°)
    // + W2→W3 (3°) + W3→destination (2°). Total 10° ≈ 600 nm.
    const r = routeRemainingNm({ lat: 0, lon: 0 }, planMultiLeg, -1);
    expect(r).toBeGreaterThan(595);
    expect(r).toBeLessThan(605);
  });

  it('multi-leg, aircraft mid-leg [origin → W1] (passedIndex = -1)', () => {
    // Aircraft at lon 1: along-track on origin→W1 is ~60 nm out of ~120 nm.
    // Remaining = (W1 leg's other half ~60) + W1→W2 (180) + W2→W3 (180) +
    // W3→dest (120) ≈ 540 nm.
    const r = routeRemainingNm({ lat: 0, lon: 1 }, planMultiLeg, -1);
    expect(r).toBeGreaterThan(530);
    expect(r).toBeLessThan(550);
  });

  it('multi-leg, aircraft just past last waypoint (passedIndex = 2)', () => {
    // Current leg is W3→destination = (0,8) → (0,10). Aircraft at lon 9:
    // along-track = ~60 nm; legNm = ~120 nm. Remainder ≈ 60 nm. No further legs.
    const r = routeRemainingNm({ lat: 0, lon: 9 }, planMultiLeg, 2);
    expect(r).toBeGreaterThan(55);
    expect(r).toBeLessThan(65);
  });

  it('multi-leg, aircraft past destination on the last leg', () => {
    const r = routeRemainingNm({ lat: 0, lon: 11 }, planMultiLeg, 2);
    expect(r).toBeCloseTo(0, 1);
  });

  it('multi-leg, aircraft off-track: uses leg natural length, not pos→dest geodesic', () => {
    // Aircraft 100 nm north of the route midpoint. With passedIndex = 0
    // (current leg is W1→W2), the answer should be (current leg remainder)
    // + W2→W3 + W3→dest ≈ same order as on-track at lon 3.5.
    // Aircraft at lon 3.5 lat 1.66 (~100nm north): along on W1→W2 = ~90 nm
    // (1.5° east), legNm = 180 nm, remainder = ~90 nm. Plus 180 + 120 = ~390.
    const offTrack = routeRemainingNm({ lat: 1.66, lon: 3.5 }, planMultiLeg, 0);
    // The exact value depends on great-circle along-track at non-zero lat;
    // assert it's in the expected range for an on-route flight.
    expect(offTrack).toBeGreaterThan(360);
    expect(offTrack).toBeLessThan(420);
  });

  it('handles a degenerate zero-length leg without throwing', () => {
    const planWithDup: FlightPlan = {
      ...planMultiLeg,
      waypoints: [
        { ident: 'W1', lat: 0, lon: 2 },
        { ident: 'W1B', lat: 0, lon: 2 }, // duplicate position
        { ident: 'W2', lat: 0, lon: 5 },
      ],
    };
    expect(() => routeRemainingNm({ lat: 0, lon: 0 }, planWithDup, -1)).not.toThrow();
  });
});

describe('routeDistanceFromOriginNm', () => {
  it('returns 0 when point is at the origin', () => {
    expect(routeDistanceFromOriginNm({ lat: 0, lon: 0 }, planMultiLeg)).toBeCloseTo(0, 1);
  });

  it('returns the full route length when point is at the destination', () => {
    // 10° at the equator ≈ 600 nm.
    const r = routeDistanceFromOriginNm({ lat: 0, lon: 10 }, planMultiLeg);
    expect(r).toBeGreaterThan(595);
    expect(r).toBeLessThan(605);
  });

  it('returns cumulative distance to a named waypoint endpoint', () => {
    // W2 is at lon 5; legs origin→W1 (2°) + W1→W2 (3°) = 5° ≈ 300 nm.
    const r = routeDistanceFromOriginNm({ lat: 0, lon: 5 }, planMultiLeg);
    expect(r).toBeGreaterThan(298);
    expect(r).toBeLessThan(302);
  });

  it('returns leg-interior distance for a point between waypoints', () => {
    // Point at lon 3.5 (mid-leg between W1@2 and W2@5):
    // origin→W1 = 2° (120 nm) + along-track on W1→W2 = 1.5° (90 nm) = 210 nm.
    const r = routeDistanceFromOriginNm({ lat: 0, lon: 3.5 }, planMultiLeg);
    expect(r).toBeGreaterThan(205);
    expect(r).toBeLessThan(215);
  });

  it('returns null when point is not on any leg (within tolerance)', () => {
    // Point far north of the equatorial route.
    const r = routeDistanceFromOriginNm({ lat: 30, lon: 5 }, planMultiLeg);
    expect(r).toBeNull();
  });

  it('handles single-leg plan (no intermediate waypoints)', () => {
    // Point at lon 5 on a 10° single-leg route: along-track = 5° ≈ 300 nm.
    const r = routeDistanceFromOriginNm({ lat: 0, lon: 5 }, planSingleLeg);
    expect(r).toBeGreaterThan(298);
    expect(r).toBeLessThan(302);
  });
});
