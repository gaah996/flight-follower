import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawTelemetry } from '@ff/shared';
import { start } from '../server/src/index.js';

async function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = resolve(here, '..');
  // npm --workspace server cd's into <repo>/server before running the script,
  // so process.cwd() is the workspace dir, not where the user typed the
  // command. INIT_CWD is npm's stash of the original CWD; resolving against
  // it makes user-supplied relative paths behave intuitively.
  const userCwd = process.env.INIT_CWD ?? process.cwd();
  const fixtureArg = process.argv[2];
  const fixturePath = fixtureArg
    ? resolve(userCwd, fixtureArg)
    : join(here, 'fixtures', 'replay-eddb-circuit.jsonl');
  const tickMs = Number(process.env.REPLAY_TICK_MS ?? 500);
  const startMs = Number(process.env.REPLAY_START_MS ?? 0);

  if (Number.isNaN(startMs)) {
    console.error(`replay: REPLAY_START_MS="${process.env.REPLAY_START_MS}" is not a number.`);
    process.exit(1);
  }

  if (startMs < 0) {
    console.warn(`replay: REPLAY_START_MS=${startMs} is negative; ignoring (forward-only seek).`);
  }

  const lines = readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
  const allEvents: RawTelemetry[] = lines.map((l) => JSON.parse(l) as RawTelemetry);
  const firstTs = allEvents[0]?.timestamp ?? 0;
  const skipIdx = startMs > 0
    ? allEvents.findIndex((e) => e.timestamp - firstTs >= startMs)
    : 0;
  // findIndex returns -1 if startMs is past the end of the fixture; treat that
  // as an empty event list so the "skipped past end" guard below fires.
  const events = skipIdx >= 0 ? allEvents.slice(skipIdx) : [];
  const skipped = allEvents.length - events.length;

  if (events.length === 0) {
    console.error(`replay: REPLAY_START_MS=${startMs} skipped past the end of the fixture (${allEvents.length} events).`);
    process.exit(1);
  }

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
  console.log(`replay running at tick=${tickMs}ms, events=${events.length}${skipped ? `, skipped=${skipped}` : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
