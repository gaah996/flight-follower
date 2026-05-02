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
