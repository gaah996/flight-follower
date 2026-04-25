import type { ReactNode } from 'react';

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

export function fmtUtcTime(epochMs: number | null | undefined): string {
  if (epochMs == null) return dash;
  const d = new Date(epochMs);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function splitMajorMinor(v: number, majorDigits = 2, totalDigits = 4): { major: string; minor: string } {
  const abs = Math.abs(v);
  const major = abs.toFixed(majorDigits);
  const minor = abs.toFixed(totalDigits).slice(major.length);
  return { major, minor };
}

export function fmtLatHemi(v: number | null | undefined): ReactNode {
  if (v == null) return dash;
  const { major, minor } = splitMajorMinor(v);
  const hemi = v >= 0 ? 'N' : 'S';
  return (
    <span>
      <span className="major">{major}</span>
      <span className="minor">{minor}</span>
      ° {hemi}
    </span>
  );
}

export function fmtLonHemi(v: number | null | undefined): ReactNode {
  if (v == null) return dash;
  const { major, minor } = splitMajorMinor(v);
  const hemi = v >= 0 ? 'E' : 'W';
  return (
    <span>
      <span className="major">{major}</span>
      <span className="minor">{minor}</span>
      ° {hemi}
    </span>
  );
}
