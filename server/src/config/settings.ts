import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Settings } from '@ff/shared';

const DEFAULTS: Settings = { simbriefUserId: null };

const SettingsSchema = z.object({
  simbriefUserId: z.string().nullable(),
});

export function loadSettings(path: string): Settings {
  if (!existsSync(path)) return { ...DEFAULTS };
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = SettingsSchema.parse(JSON.parse(raw));
    return parsed;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), 'utf8');
}
