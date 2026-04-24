import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSettings, saveSettings } from './settings.js';

function tempFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ff-'));
  return join(dir, name);
}

describe('settings', () => {
  it('returns defaults when the file does not exist', () => {
    const path = tempFile('settings.json');
    const s = loadSettings(path);
    expect(s.simbriefUserId).toBeNull();
  });

  it('round-trips saved values', () => {
    const path = tempFile('settings.json');
    saveSettings(path, { simbriefUserId: 'gabrielcastro' });
    const s = loadSettings(path);
    expect(s.simbriefUserId).toBe('gabrielcastro');
  });

  it('returns defaults when the file is malformed', () => {
    const path = tempFile('settings.json');
    saveSettings(path, { simbriefUserId: 'x' });
    rmSync(path);
    const s = loadSettings(path);
    expect(s.simbriefUserId).toBeNull();
  });
});
