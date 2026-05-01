import { describe, expect, it } from 'vitest';
import type { Waypoint } from '@ff/shared';
import { findTOC, findTOD } from './cruise-points.js';

const wp = (ident: string, plannedAltitude?: number): Waypoint => ({
  ident,
  lat: 0,
  lon: 0,
  plannedAltitude,
});

describe('findTOC — name match (primary)', () => {
  it('returns the position of the waypoint with ident "TOC"', () => {
    const wps: Waypoint[] = [
      { ident: 'A', lat: 1, lon: 1 },
      { ident: 'TOC', lat: 5, lon: 5 },
      { ident: 'B', lat: 9, lon: 9 },
    ];
    expect(findTOC(wps)).toEqual({ lat: 5, lon: 5 });
  });
});

describe('findTOD — name match (primary)', () => {
  it('returns the position of the waypoint with ident "TOD"', () => {
    const wps: Waypoint[] = [
      { ident: 'A', lat: 1, lon: 1 },
      { ident: 'TOD', lat: 7, lon: 7 },
      { ident: 'B', lat: 9, lon: 9 },
    ];
    expect(findTOD(wps)).toEqual({ lat: 7, lon: 7 });
  });
});

describe('findTOC — altitude scan fallback', () => {
  it('returns the first waypoint at the given cruise altitude', () => {
    const wps: Waypoint[] = [
      wp('A', 5000),
      wp('B', 18000),
      wp('C', 36000),
      wp('D', 36000),
    ];
    wps[0]!.lat = 0; wps[1]!.lat = 1; wps[2]!.lat = 2; wps[3]!.lat = 3;
    expect(findTOC(wps, 36000)).toEqual({ lat: 2, lon: 0 });
  });

  it('uses the highest plannedAltitude when no cruise altitude is provided', () => {
    const wps: Waypoint[] = [
      wp('A', 5000),
      wp('B', 18000),
      wp('C', 36000),
      wp('D', 36000),
    ];
    wps[2]!.lat = 2;
    expect(findTOC(wps)).toEqual({ lat: 2, lon: 0 });
  });

  it('handles stepped climbs by returning the first waypoint at cruise', () => {
    const wps: Waypoint[] = [
      wp('A', 8000),
      wp('B', 24000),
      wp('C', 36000),
      wp('D', 36000),
    ];
    wps[2]!.lat = 2;
    expect(findTOC(wps, 36000)).toEqual({ lat: 2, lon: 0 });
  });
});

describe('findTOD — altitude scan fallback', () => {
  it('returns the last waypoint at cruise altitude before descent', () => {
    const wps: Waypoint[] = [
      wp('A', 5000),
      wp('B', 36000),
      wp('C', 36000),
      wp('D', 18000),
      wp('E', 5000),
    ];
    wps[2]!.lat = 2;
    expect(findTOD(wps, 36000)).toEqual({ lat: 2, lon: 0 });
  });
});

describe('null cases', () => {
  it('findTOC returns null when no plannedAltitude data and no name match', () => {
    const wps: Waypoint[] = [wp('A'), wp('B'), wp('C')];
    expect(findTOC(wps, 36000)).toBeNull();
  });

  it('findTOD returns null when no plannedAltitude data and no name match', () => {
    const wps: Waypoint[] = [wp('A'), wp('B'), wp('C')];
    expect(findTOD(wps, 36000)).toBeNull();
  });

  it('findTOC returns null on empty waypoints', () => {
    expect(findTOC([])).toBeNull();
  });

  it('findTOD returns null on empty waypoints', () => {
    expect(findTOD([])).toBeNull();
  });

  it('findTOC returns null when plan stays at 0', () => {
    const wps: Waypoint[] = [wp('A', 0), wp('B', 0)];
    expect(findTOC(wps)).toBeNull();
  });
});
