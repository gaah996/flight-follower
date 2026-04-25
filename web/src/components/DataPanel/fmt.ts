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

export function fmtLatHemi(v: number | null | undefined): string {
  if (v == null) return dash;
  const hemi = v >= 0 ? 'N' : 'S';
  return `${Math.abs(v).toFixed(2)}° ${hemi}`;
}

export function fmtLonHemi(v: number | null | undefined): string {
  if (v == null) return dash;
  const hemi = v >= 0 ? 'E' : 'W';
  return `${Math.abs(v).toFixed(2)}° ${hemi}`;
}
