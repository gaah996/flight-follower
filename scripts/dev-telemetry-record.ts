import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../server/src/index.js';

async function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = resolve(here, '..');
  const outArg = process.argv[2] ?? process.env.FF_RECORD_PATH;
  if (!outArg) {
    console.error('Usage: npm run dev:record -- <output.jsonl>');
    console.error('   or: FF_RECORD_PATH=<path> npm --workspace server run dev:record');
    process.exit(1);
  }
  const outPath = resolve(outArg);

  const running = await start({
    configPath: join(repoRoot, 'server', '.data', 'settings.json'),
    staticPath: join(repoRoot, 'web', 'dist'),
    port: Number(process.env.FF_PORT ?? 4444),
    recordPath: outPath,
  });

  console.log(`Recording to ${outPath}`);
  console.log('Start MSFS and fly; Ctrl+C to stop.');

  const shutdown = async () => {
    console.log('\nStopping recorder...');
    await running.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
