import { describe, expect, it } from 'vitest';
import { eteSeconds, distanceToWaypointNm, advancePassedIndex, findPassedIndex, alongTrackNm } from './progress.js';

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

describe('alongTrackNm', () => {
  it('is 0 when pos coincides with from', () => {
    expect(alongTrackNm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(0, 3);
  });

  it('equals leg length when pos is at to', () => {
    const along = alongTrackNm({ lat: 0, lon: 1 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(along).toBeGreaterThan(59);
    expect(along).toBeLessThan(61);
  });

  it('exceeds leg length when pos projects past to', () => {
    const along = alongTrackNm({ lat: 0, lon: 1.5 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(along).toBeGreaterThan(89); // ~1.5° at equator
  });

  it('is negative when pos projects behind from', () => {
    expect(alongTrackNm({ lat: 0, lon: -0.5 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeLessThan(0);
  });
});

describe('findPassedIndex', () => {
  it('returns -1 when the aircraft is still approaching the first waypoint', () => {
    // Aircraft south of A; not past A on the [A,B] leg.
    expect(findPassedIndex({ lat: -1, lon: 0 }, wpts)).toBe(-1);
  });

  it('returns 0 when the aircraft is between the first and second waypoints', () => {
    // Aircraft at lon 0.6 on the equator: along-track on [A,B] is positive
    // but less than the leg length.
    expect(findPassedIndex({ lat: 0, lon: 0.6 }, wpts)).toBe(0);
  });

  it('returns N when the aircraft has just passed waypoint N (close but on far side)', () => {
    // Edge case the original "closer to N+1 than N" heuristic missed: at
    // lon 1.05, the aircraft is closer to B (lon 1) than to C (lon 2), but
    // along-track on [A,B] exceeds the leg length, so B has been passed.
    expect(findPassedIndex({ lat: 0, lon: 1.05 }, wpts)).toBe(1);
  });

  it('returns the last index when the aircraft is past the final waypoint', () => {
    expect(findPassedIndex({ lat: 0, lon: 3 }, wpts)).toBe(2);
  });

  it('returns -1 for empty waypoint list', () => {
    expect(findPassedIndex({ lat: 0, lon: 0 }, [])).toBe(-1);
  });

  it('returns -1 for a single waypoint', () => {
    expect(findPassedIndex({ lat: 0, lon: 0 }, [wpts[0]!])).toBe(-1);
  });
});
