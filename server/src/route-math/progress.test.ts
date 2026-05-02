import { describe, expect, it } from 'vitest';
import { eteSeconds, distanceToWaypointNm, advancePassedIndex, findPassedIndex } from './progress.js';

const wpts = [
  { ident: 'A', lat: 0, lon: 0 },
  { ident: 'B', lat: 0, lon: 1 },
  { ident: 'C', lat: 0, lon: 2 },
];

describe('eteSeconds', () => {
  it('computes time from distance / ground speed', () => {
    expect(eteSeconds(60, 60)).toBeCloseTo(3600, 3);
  });

  it('returns null when ground speed is below threshold', () => {
    expect(eteSeconds(100, 10)).toBeNull();
  });

  it('returns null for non-positive inputs', () => {
    expect(eteSeconds(-5, 100)).toBeNull();
    expect(eteSeconds(100, 0)).toBeNull();
  });
});

describe('distanceToWaypointNm', () => {
  it('returns distance in nautical miles', () => {
    const d = distanceToWaypointNm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 } as never);
    expect(d).toBeGreaterThan(59);
    expect(d).toBeLessThan(61);
  });
});

describe('advancePassedIndex', () => {
  it('does not advance when the aircraft is far from the next waypoint', () => {
    const next = advancePassedIndex({ lat: 5, lon: 0 }, wpts, -1, 2);
    expect(next).toBe(-1);
  });

  it('advances when within threshold of the next waypoint', () => {
    const next = advancePassedIndex({ lat: 0, lon: 0.005 }, wpts, -1, 2);
    expect(next).toBe(0);
  });

  it('never goes backwards', () => {
    const next = advancePassedIndex({ lat: 0, lon: 0 }, wpts, 1, 2);
    expect(next).toBe(1);
  });

  it('stops at the last waypoint', () => {
    const next = advancePassedIndex({ lat: 0, lon: 2.001 }, wpts, 1, 2);
    expect(next).toBe(2);
  });
});

describe('findPassedIndex', () => {
  it('returns -1 when the aircraft is still approaching the first waypoint', () => {
    // Aircraft south of A; closer to A than to B.
    expect(findPassedIndex({ lat: -1, lon: 0 }, wpts)).toBe(-1);
  });

  it('returns 0 when the aircraft is between the first and second waypoints', () => {
    // Aircraft at lon 0.6 on the equator: closer to B (lon 1) than to A (lon 0)
    // and closer to B than to C (lon 2).
    expect(findPassedIndex({ lat: 0, lon: 0.6 }, wpts)).toBe(0);
  });

  it('returns the last index when the aircraft is past the final waypoint', () => {
    // Aircraft at lon 3: closer to C (lon 2) than to B (lon 1).
    expect(findPassedIndex({ lat: 0, lon: 3 }, wpts)).toBe(1);
  });

  it('returns -1 for empty waypoint list', () => {
    expect(findPassedIndex({ lat: 0, lon: 0 }, [])).toBe(-1);
  });

  it('returns -1 for a single waypoint', () => {
    expect(findPassedIndex({ lat: 0, lon: 0 }, [wpts[0]!])).toBe(-1);
  });
});
