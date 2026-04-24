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
});
