import type { FlightPlan } from '@ff/shared';
import { parseSimbriefOfp } from './parser.js';

export class SimbriefError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SimbriefError';
  }
}

export async function fetchLatestOfp(userId: string): Promise<FlightPlan> {
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
    return parseSimbriefOfp(json);
  } catch (err) {
    throw new SimbriefError('BAD_OFP', `Simbrief OFP failed validation: ${(err as Error).message}`);
  }
}
