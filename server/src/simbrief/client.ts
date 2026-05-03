import type { FlightPlan } from '@ff/shared';
import { readFile } from 'node:fs/promises';
import { parseSimbriefOfp } from './parser.js';

export class SimbriefError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SimbriefError';
  }
}

export async function fetchLatestOfp(userId: string): Promise<{ raw: unknown; plan: FlightPlan }> {
  if (!userId.trim()) {
    throw new SimbriefError('NO_USER_ID', 'Simbrief user ID not configured');
  }
  const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(userId)}&json=1`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new SimbriefError('NETWORK', `Could not reach Simbrief: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new SimbriefError('HTTP', `Simbrief returned HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SimbriefError('BAD_JSON', 'Simbrief response was not valid JSON');
  }

  try {
    return { raw: json, plan: parseSimbriefOfp(json) };
  } catch (err) {
    throw new SimbriefError('BAD_OFP', `Simbrief OFP failed validation: ${(err as Error).message}`);
  }
}

/**
 * Load a Simbrief OFP from a file on disk and parse it. Mirrors
 * fetchLatestOfp's return shape so the HTTP handler can use either source
 * interchangeably.
 *
 * Errors are wrapped in SimbriefError with code:
 *   FIXTURE_NOT_FOUND — file does not exist or cannot be read.
 *   FIXTURE_BAD_JSON  — file contents fail JSON.parse.
 *   FIXTURE_BAD_OFP   — JSON parsed but failed parseSimbriefOfp validation.
 */
export async function loadOfpFromFile(path: string): Promise<{ raw: unknown; plan: FlightPlan }> {
  let buf: string;
  try {
    buf = await readFile(path, 'utf8');
  } catch (err) {
    throw new SimbriefError('FIXTURE_NOT_FOUND', `OFP fixture not readable at ${path}: ${(err as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(buf);
  } catch {
    throw new SimbriefError('FIXTURE_BAD_JSON', `OFP fixture at ${path} is not valid JSON`);
  }
  try {
    return { raw, plan: parseSimbriefOfp(raw) };
  } catch (err) {
    throw new SimbriefError('FIXTURE_BAD_OFP', `OFP fixture at ${path} failed validation: ${(err as Error).message}`);
  }
}

/**
 * Return the sibling .ofp.json path for a given recording or replay file.
 *   /abs/path/replay-foo.jsonl  → /abs/path/replay-foo.ofp.json
 *   /abs/path/replay-foo        → /abs/path/replay-foo.ofp.json
 *   /abs/path/replay-foo.bin    → /abs/path/replay-foo.ofp.json
 */
export function siblingOfpPath(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const dir = filePath.slice(0, lastSlash + 1);
  const base = filePath.slice(lastSlash + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${dir}${stem}.ofp.json`;
}

type RawObj = Record<string, unknown>;

function pickFields<T extends string>(obj: unknown, keys: readonly T[]): RawObj | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const o = obj as RawObj;
  const out: RawObj = {};
  let any = false;
  for (const k of keys) {
    if (k in o) {
      out[k] = o[k];
      any = true;
    }
  }
  return any ? out : undefined;
}

const GENERAL_KEYS = [
  'icao_airline',
  'flight_number',
  'initial_altitude',
  'air_distance',
  'route_distance',
  'route',
  'route_navigraph',
] as const;
const AIRCRAFT_KEYS = ['icao_code'] as const;
const AIRPORT_KEYS = ['icao_code', 'pos_lat', 'pos_long', 'name'] as const;
const TIMES_KEYS = ['sched_out', 'sched_in', 'sched_block', 'est_block'] as const;
const FIX_KEYS = ['ident', 'pos_lat', 'pos_long', 'altitude_feet'] as const;

/**
 * Reduce a raw Simbrief OFP to only the fields parseSimbriefOfp consumes.
 * Used when persisting OFPs as fixtures (during dev recording or as
 * checked-in test fixtures) to:
 *   - drop personal identifiers (userid, user_id, request_id, sequence_id,
 *     xml_file URL containing the userid, etc.) that Simbrief returns;
 *   - shrink the file from hundreds of kB to a few kB;
 *   - keep the saved file shape parser-compatible: the result still parses
 *     cleanly via parseSimbriefOfp(...) because every field consumed by
 *     the parser is preserved.
 */
export function trimOfpForFixture(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const r = raw as RawObj;
  const trimmed: RawObj = {};

  const general = pickFields(r.general, GENERAL_KEYS);
  if (general) trimmed.general = general;

  const aircraft = pickFields(r.aircraft, AIRCRAFT_KEYS);
  if (aircraft) trimmed.aircraft = aircraft;

  const origin = pickFields(r.origin, AIRPORT_KEYS);
  if (origin) trimmed.origin = origin;
  const destination = pickFields(r.destination, AIRPORT_KEYS);
  if (destination) trimmed.destination = destination;
  const alternate = pickFields(r.alternate, AIRPORT_KEYS);
  if (alternate) trimmed.alternate = alternate;

  const times = pickFields(r.times, TIMES_KEYS);
  if (times) trimmed.times = times;

  if (typeof r.navlog === 'object' && r.navlog !== null) {
    const fixRaw = (r.navlog as RawObj).fix;
    if (Array.isArray(fixRaw)) {
      trimmed.navlog = {
        fix: fixRaw.map((f) => pickFields(f, FIX_KEYS) ?? {}),
      };
    }
  }

  return trimmed;
}
