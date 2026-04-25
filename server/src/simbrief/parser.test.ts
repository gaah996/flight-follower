import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSimbriefOfp } from './parser.js';

const fixturePath = fileURLToPath(new URL('./fixtures/minimal-ofp.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('parseSimbriefOfp', () => {
  it('extracts origin and destination ICAOs', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.origin.icao).toBe('EGLL');
    expect(plan.destination.icao).toBe('LEMD');
  });

  it('parses alternate when present', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.alternate?.icao).toBe('LEBL');
  });

  it('coerces string coordinates to numbers', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(typeof plan.origin.lat).toBe('number');
    expect(plan.origin.lat).toBeCloseTo(51.4706, 4);
  });

  it('produces a waypoint list in order', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.waypoints.map((w) => w.ident)).toEqual(['MID', 'OKRIX', 'BAN']);
  });

  it('sets fetchedAt to a timestamp around now', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(Math.abs(Date.now() - plan.fetchedAt)).toBeLessThan(2000);
  });

  it('rejects input missing required fields', () => {
    expect(() => parseSimbriefOfp({})).toThrow();
  });

  it('extracts airport names when present', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.origin.name).toBe('London Heathrow');
    expect(plan.destination.name).toBe('Madrid Barajas');
    expect(plan.alternate?.name).toBe('Barcelona El Prat');
  });

  it('parses scheduled out/in as epoch ms', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.scheduledOut).toBe(1714053600 * 1000);
    expect(plan.scheduledIn).toBe(1714060800 * 1000);
  });

  it('omits scheduled times when the OFP lacks a times block', () => {
    const { times: _ignored, ...withoutTimes } = fixture;
    const plan = parseSimbriefOfp(withoutTimes);
    expect(plan.scheduledOut).toBeUndefined();
    expect(plan.scheduledIn).toBeUndefined();
  });

  it('omits airport names when absent from the OFP', () => {
    const withoutNames = {
      ...fixture,
      origin: { icao_code: 'EGLL', pos_lat: '51.4706', pos_long: '-0.4619' },
      destination: { icao_code: 'LEMD', pos_lat: '40.4936', pos_long: '-3.5668' },
    };
    const plan = parseSimbriefOfp(withoutNames);
    expect(plan.origin.name).toBeUndefined();
    expect(plan.destination.name).toBeUndefined();
  });

  it('extracts callsign by concatenating icao_airline + flight_number', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.flightNumber).toBe('BAW123');
  });

  it('extracts aircraft type from aircraft.icao_code', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.aircraftType).toBe('A320');
  });

  it('extracts cruise altitude in feet', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.cruiseAltitudeFt).toBe(36000);
  });

  it('extracts total distance in nautical miles, preferring air_distance', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.totalDistanceNm).toBe(1085);
  });

  it('extracts route string, preferring route_navigraph when present', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.routeString).toBe('EGLL DCT MID UN160 OKRIX UM601 BAN LEMD');
  });

  it('falls back to general.route when route_navigraph is absent', () => {
    const without = {
      ...fixture,
      general: { ...fixture.general, route_navigraph: undefined },
    };
    const plan = parseSimbriefOfp(without);
    expect(plan.routeString).toBe('MID OKRIX BAN');
  });

  it('omits the new fields when absent from the OFP', () => {
    const stripped = {
      ...fixture,
      general: undefined,
      aircraft: undefined,
    };
    const plan = parseSimbriefOfp(stripped);
    expect(plan.flightNumber).toBeUndefined();
    expect(plan.aircraftType).toBeUndefined();
    expect(plan.cruiseAltitudeFt).toBeUndefined();
    expect(plan.totalDistanceNm).toBeUndefined();
    expect(plan.routeString).toBeUndefined();
  });

  it('omits flightNumber when only one of icao_airline / flight_number is present', () => {
    const partial = {
      ...fixture,
      general: { ...fixture.general, flight_number: undefined },
    };
    expect(parseSimbriefOfp(partial).flightNumber).toBeUndefined();
  });

  it('omits aircraftType when the aircraft block has no icao_code', () => {
    const noCode = { ...fixture, aircraft: {} };
    expect(parseSimbriefOfp(noCode).aircraftType).toBeUndefined();
  });
});
