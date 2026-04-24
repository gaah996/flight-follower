export const dash = '—';

export function fmtNum(v: number | null | undefined, digits = 0): string {
  return v == null ? dash : v.toFixed(digits);
}

export function fmtDurationSec(sec: number | null | undefined): string {
  if (sec == null) return dash;
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600).toString().padStart(2, '0');
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function fmtLatLon(v: number | null | undefined): string {
  return v == null ? dash : v.toFixed(4);
}
