import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadOfpFromFile, siblingOfpPath, SimbriefError } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const minimalOfp = resolve(here, 'fixtures', 'minimal-ofp.json');

describe('siblingOfpPath', () => {
  it('replaces a .jsonl extension with .ofp.json', () => {
    expect(siblingOfpPath('/abs/path/replay-foo.jsonl')).toBe('/abs/path/replay-foo.ofp.json');
  });

  it('appends .ofp.json when no extension is present', () => {
    expect(siblingOfpPath('/abs/path/replay-foo')).toBe('/abs/path/replay-foo.ofp.json');
  });

  it('replaces any extension, not only .jsonl', () => {
    expect(siblingOfpPath('/abs/path/replay-foo.bin')).toBe('/abs/path/replay-foo.ofp.json');
  });
});

describe('loadOfpFromFile', () => {
  it('parses a real Simbrief fixture from disk', async () => {
    const { plan } = await loadOfpFromFile(minimalOfp);
    expect(plan.origin.icao).toBeTruthy();
    expect(plan.destination.icao).toBeTruthy();
  });

  it('throws SimbriefError(FIXTURE_NOT_FOUND) for a missing file', async () => {
    await expect(loadOfpFromFile('/nonexistent/path.json')).rejects.toMatchObject({
      name: 'SimbriefError',
      code: 'FIXTURE_NOT_FOUND',
    });
  });

  it('throws SimbriefError(FIXTURE_BAD_JSON) for invalid JSON', async () => {
    // package.json is valid JSON; use a file we know parses OK to anchor
    // the negative case via a temp inline file.
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'ff-test-'));
    const bad = join(dir, 'bad.json');
    await writeFile(bad, '{ this is not json', 'utf8');
    await expect(loadOfpFromFile(bad)).rejects.toMatchObject({
      name: 'SimbriefError',
      code: 'FIXTURE_BAD_JSON',
    });
    await rm(dir, { recursive: true });
  });
});
