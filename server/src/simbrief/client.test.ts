import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadOfpFromFile, siblingOfpPath, SimbriefError, trimOfpForFixture } from './client.js';
import { parseSimbriefOfp } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const minimalOfp = resolve(here, 'fixtures', 'minimal-ofp.json');

describe('siblingOfpPath', () => {
  it('replaces a .jsonl extension with .ofp.json', () => {
    expect(siblingOfpPath('/abs/path/replay-foo.jsonl')).toBe('/abs/path/replay-foo.ofp.json');
  });

  it('appends .ofp.json when no extension is present', () => {
    expect(siblingOfpPath('/abs/path/replay-foo')).toBe('/abs/path/replay-foo.ofp.json');
  });

  it('replaces any extension, not only .jsonl', () => {
    expect(siblingOfpPath('/abs/path/replay-foo.bin')).toBe('/abs/path/replay-foo.ofp.json');
  });
});

describe('loadOfpFromFile', () => {
  it('parses a real Simbrief fixture from disk', async () => {
    const { plan } = await loadOfpFromFile(minimalOfp);
    expect(plan.origin.icao).toBeTruthy();
    expect(plan.destination.icao).toBeTruthy();
  });

  it('throws SimbriefError(FIXTURE_NOT_FOUND) for a missing file', async () => {
    await expect(loadOfpFromFile('/nonexistent/path.json')).rejects.toMatchObject({
      name: 'SimbriefError',
      code: 'FIXTURE_NOT_FOUND',
    });
  });

  it('throws SimbriefError(FIXTURE_BAD_JSON) for invalid JSON', async () => {
    // package.json is valid JSON; use a file we know parses OK to anchor
    // the negative case via a temp inline file.
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'ff-test-'));
    const bad = join(dir, 'bad.json');
    await writeFile(bad, '{ this is not json', 'utf8');
    await expect(loadOfpFromFile(bad)).rejects.toMatchObject({
      name: 'SimbriefError',
      code: 'FIXTURE_BAD_JSON',
    });
    await rm(dir, { recursive: true });
  });
});

describe('trimOfpForFixture', () => {
  const fullOfp = {
    fetch: { userid: '957291', static_id: {}, status: 'Success', time: '0.0071' },
    params: {
      request_id: '171443871',
      sequence_id: '1c6e4d1c13d1',
      user_id: '957291',
      time_generated: '1777720939',
      xml_file: 'https://www.simbrief.com/ofp/flightplans/xml/LFPGLEPA_XML_1777720939.xml',
    },
    general: {
      icao_airline: 'EWG',
      flight_number: '1658',
      initial_altitude: '36000',
      air_distance: '659',
      route_distance: '700',
      route: 'X Y Z',
      route_navigraph: 'LFPG X Y Z LEPA',
      // unused fields:
      release: '1',
      is_etops: '0',
      cruise_profile: 'CI 10',
    },
    aircraft: { icao_code: 'A320', registration: 'D-AGWZ' },
    origin: { icao_code: 'LFPG', pos_lat: '49.01', pos_long: '2.55', name: 'CDG', extra: 'drop me' },
    destination: { icao_code: 'LEPA', pos_lat: '39.55', pos_long: '2.74', name: 'PMI' },
    alternate: { icao_code: 'LEBL', pos_lat: '41.30', pos_long: '2.08', name: 'BCN' },
    times: { sched_out: '1', sched_in: '7201', sched_block: '7200', est_block: '7100', extra: 'drop me' },
    navlog: {
      fix: [
        { ident: 'DE27R', pos_lat: '49.0', pos_long: '2.5', altitude_feet: '5000', via_airway: 'SID', drop: 'me' },
        { ident: 'PG270', pos_lat: '48.9', pos_long: '2.4', altitude_feet: '15000' },
      ],
    },
  };

  it('drops personal identifiers (userid, request_id, xml_file, etc.)', () => {
    const trimmed = trimOfpForFixture(fullOfp) as Record<string, unknown>;
    expect(trimmed.fetch).toBeUndefined();
    expect(trimmed.params).toBeUndefined();
  });

  it('keeps only parser-consumed keys at the top level', () => {
    const trimmed = trimOfpForFixture(fullOfp) as Record<string, unknown>;
    expect(Object.keys(trimmed).sort()).toEqual(
      ['aircraft', 'alternate', 'destination', 'general', 'navlog', 'origin', 'times'].sort(),
    );
  });

  it('keeps only parser-consumed keys per block', () => {
    const trimmed = trimOfpForFixture(fullOfp) as Record<string, Record<string, unknown>>;
    expect(Object.keys(trimmed.general!).sort()).toEqual(
      ['air_distance', 'flight_number', 'icao_airline', 'initial_altitude', 'route', 'route_distance', 'route_navigraph'].sort(),
    );
    expect(Object.keys(trimmed.aircraft!).sort()).toEqual(['icao_code']);
    expect(Object.keys(trimmed.origin!).sort()).toEqual(['icao_code', 'name', 'pos_lat', 'pos_long']);
    expect(Object.keys(trimmed.times!).sort()).toEqual(['est_block', 'sched_block', 'sched_in', 'sched_out']);
  });

  it('keeps only parser-consumed keys per navlog fix', () => {
    const trimmed = trimOfpForFixture(fullOfp) as { navlog: { fix: Record<string, unknown>[] } };
    expect(Object.keys(trimmed.navlog.fix[0]!).sort()).toEqual(
      ['altitude_feet', 'ident', 'pos_lat', 'pos_long'].sort(),
    );
    expect(Object.keys(trimmed.navlog.fix[1]!).sort()).toEqual(['altitude_feet', 'ident', 'pos_lat', 'pos_long']);
  });

  it('result still parses cleanly via parseSimbriefOfp', () => {
    const trimmed = trimOfpForFixture(fullOfp);
    const plan = parseSimbriefOfp(trimmed);
    expect(plan.origin.icao).toBe('LFPG');
    expect(plan.destination.icao).toBe('LEPA');
    expect(plan.waypoints.map((w) => w.ident)).toEqual(['DE27R', 'PG270']);
  });

  it('omits optional blocks that are absent from the input', () => {
    const minimal = {
      origin: { icao_code: 'A', pos_lat: 0, pos_long: 0 },
      destination: { icao_code: 'B', pos_lat: 1, pos_long: 1 },
      navlog: { fix: [{ ident: 'X', pos_lat: 0.5, pos_long: 0.5 }] },
    };
    const trimmed = trimOfpForFixture(minimal) as Record<string, unknown>;
    expect(trimmed.general).toBeUndefined();
    expect(trimmed.aircraft).toBeUndefined();
    expect(trimmed.alternate).toBeUndefined();
    expect(trimmed.times).toBeUndefined();
  });

  it('returns the input unchanged for non-object inputs', () => {
    expect(trimOfpForFixture(null)).toBeNull();
    expect(trimOfpForFixture('string')).toBe('string');
  });
});
