import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawTelemetry } from '@ff/shared';
import { start } from '../server/src/index.js';

async function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = resolve(here, '..');
  const fixturePath = process.argv[2] ?? join(here, 'fixtures', 'replay-short.jsonl');
  const tickMs = Number(process.env.REPLAY_TICK_MS ?? 500);

  const lines = readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
  const events: RawTelemetry[] = lines.map((l) => JSON.parse(l) as RawTelemetry);

  const running = await start({
    configPath: join(repoRoot, 'server', '.data', 'settings.json'),
    staticPath: join(repoRoot, 'web', 'dist'),
    port: Number(process.env.FF_PORT ?? 4444),
    disableSim: true,
  });

  running.aggregator.setConnected(true);

  const start0 = Date.now();
  let i = 0;
  const timer = setInterval(() => {
    const ev = events[i % events.length]!;
    const shifted: RawTelemetry = { ...ev, timestamp: Date.now() - start0 + ev.timestamp };
    running.aggregator.ingestTelemetry(shifted);
    i++;
  }, tickMs);

  const shutdown = async () => {
    clearInterval(timer);
    await running.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`replay running at tick=${tickMs}ms, events=${events.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
