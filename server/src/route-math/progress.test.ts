import { describe, expect, it } from 'vitest';
import type { Waypoint } from '@ff/shared';
import { eteSeconds, distanceToWaypointNm, advancePassedIndex, findPassedIndex, alongTrackNm, advancePassedIndexWindowed } from './progress.js';

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

  it('regression: at the route start, picks the first SID-shape leg even when later legs are within reach', () => {
    // Simulates the LFPG → LEPA failure mode: real navlog has multiple
    // SID-and-early-enroute legs within 200 nm of the origin. With a
    // pure reach-gate-in-loop, several of those legs could each misfire
    // (bearing alignment) and the cumulative max jumps the cursor.
    // Closest-leg projects only onto the most relevant leg.
    const sidShape: Waypoint[] = [
      // Mimics a SID departing south, then a doubling-back leg within
      // 200 nm of origin (49°N, 0°E) that previously misfired.
      { ident: 'W0', lat: 48, lon: 0 }, // 60 nm south of origin
      { ident: 'W1', lat: 47, lon: 0 }, // 120 nm south
      { ident: 'W2', lat: 46, lon: 0 }, // 180 nm south
      { ident: 'W3', lat: 47, lon: 0 }, // doubles back north 1° (180 nm from origin)
      { ident: 'W4', lat: 45, lon: 0 }, // 240 nm south (reach-gated by closest-leg's bestDist)
    ];
    expect(findPassedIndex({ lat: 49, lon: 0 }, sidShape)).toBe(-1);
  });
});

describe('advancePassedIndexWindowed', () => {
  // Reuses `wpts` declared at the top of this file (A,B,C at lon 0,1,2).

  it('does not advance from -1 when aircraft is far north of all waypoints', () => {
    // Window at passedIndex=-1 covers leg [0,1] only. Aircraft at lat 5 lon 0
    // is far north; bearing from A to pos differs from A→B (east), so
    // along-track is small or negative. No advance.
    expect(advancePassedIndexWindowed({ lat: 5, lon: 0 }, wpts, -1)).toBe(-1);
  });

  it('advances to 0 when aircraft is past A on leg [A,B]', () => {
    // Aircraft 0.6° east of A: along-track on [A,B] ~36 nm out of ~60 nm.
    expect(advancePassedIndexWindowed({ lat: 0, lon: 0.6 }, wpts, -1)).toBe(0);
  });

  it('advances to 1 when along-track on [A,B] exceeds legNm', () => {
    expect(advancePassedIndexWindowed({ lat: 0, lon: 1.05 }, wpts, -1)).toBe(1);
  });

  it('advances to 2 when on leg [B,C] past C', () => {
    expect(advancePassedIndexWindowed({ lat: 0, lon: 2.05 }, wpts, 1)).toBe(2);
  });

  it('forward-only: never returns less than currentPassedIndex', () => {
    expect(advancePassedIndexWindowed({ lat: -5, lon: 0 }, wpts, 1)).toBe(1);
  });

  it('returns currentPassedIndex unchanged when waypoints has fewer than 2 elements', () => {
    expect(advancePassedIndexWindowed({ lat: 0, lon: 0 }, [], -1)).toBe(-1);
    expect(advancePassedIndexWindowed({ lat: 0, lon: 0 }, [wpts[0]!], -1)).toBe(-1);
  });

  it('regression: does not consider out-of-window legs at the route start (LFPG-shape)', () => {
    // Synthetic doubling-back route: leg [3,4] (C → D) points NORTH (43°N
    // → 44°N). Aircraft at origin (49°N) lies on the bearing-extension of
    // C → D. Full-scan findPassedIndex returns >= 3 for this position;
    // windowed at passedIndex=-1 must return -1 because legs [3,4] and
    // beyond are outside the window [0,1] when N=5 waypoints.
    const lfpgShape = [
      { ident: 'A', lat: 47, lon: 0 },
      { ident: 'B', lat: 45, lon: 0 },
      { ident: 'C', lat: 43, lon: 0 },
      { ident: 'D', lat: 44, lon: 0 }, // doubles back north 1°
      { ident: 'E', lat: 40, lon: 0 },
    ];
    expect(advancePassedIndexWindowed({ lat: 49, lon: 0 }, lfpgShape, -1)).toBe(-1);
    // Anchor: with reach-gating (v1.3.1), findPassedIndex also returns -1
    // for this geometry — only the first leg is within 200 nm of the
    // origin, and its bearing misaligns. Both the windowed per-tick path
    // and the full-scan plan-load path are now safe against the LFPG
    // misfire shape.
    expect(findPassedIndex({ lat: 49, lon: 0 }, lfpgShape)).toBe(-1);
  });
});
