import type { FlightPlan, Settings } from '@ff/shared';

export async function getSettings(): Promise<Settings> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
  return (await res.json()) as Settings;
}

export type ResetScope = 'aircraft' | 'plan' | 'all';

export async function resetSession(scope: ResetScope): Promise<void> {
  const res = await fetch('/api/reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  if (!res.ok) throw new Error(`POST /api/reset ${res.status}`);
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`POST /api/settings ${res.status}`);
  return (await res.json()) as Settings;
}

export class SimbriefFetchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SimbriefFetchError';
  }
}

export async function fetchSimbriefPlan(): Promise<FlightPlan> {
  const res = await fetch('/api/simbrief/fetch', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) {
    const err = body as { error?: string; message?: string };
    throw new SimbriefFetchError(err.error ?? 'UNKNOWN', err.message ?? `HTTP ${res.status}`);
  }
  return body as FlightPlan;
}
