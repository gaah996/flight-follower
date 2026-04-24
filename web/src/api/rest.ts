import type { FlightPlan, Settings } from '@ff/shared';

export async function getSettings(): Promise<Settings> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
  return (await res.json()) as Settings;
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

export async function fetchSimbriefPlan(): Promise<FlightPlan> {
  const res = await fetch('/api/simbrief/fetch', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) {
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return body as FlightPlan;
}
