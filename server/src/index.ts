import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Aggregator } from './state/aggregator.js';
import { SimBridge } from './sim-bridge/client.js';
import { buildHttpApp } from './transport/http.js';
import { attachWsBroadcaster } from './transport/ws.js';

export type StartOptions = {
  configPath: string;
  staticPath: string;
  port: number;
  host?: string;
  disableSim?: boolean;  // used by dev-telemetry-replay
  recordPath?: string;   // if set, append each RawTelemetry as JSONL
};

export type RunningServer = {
  aggregator: Aggregator;
  simBridge: SimBridge | null;
  close: () => Promise<void>;
};

export async function start(opts: StartOptions): Promise<RunningServer> {
  const aggregator = new Aggregator();

  let simBridge: SimBridge | null = null;
  if (!opts.disableSim) {
    simBridge = new SimBridge();
    simBridge.on('telemetry', (t) => aggregator.ingestTelemetry(t));
    simBridge.on('open', () => aggregator.setConnected(true));
    simBridge.on('close', () => aggregator.setConnected(false));
    simBridge.on('warning', (w) => console.warn('[sim-bridge]', w));
    void simBridge.connect();
  }

  let recordStream: WriteStream | null = null;
  if (opts.recordPath && simBridge) {
    await mkdir(dirname(opts.recordPath), { recursive: true });
    recordStream = createWriteStream(opts.recordPath, { flags: 'a' });
    simBridge.on('telemetry', (t) => {
      recordStream?.write(`${JSON.stringify(t)}\n`);
    });
    console.log(`[record] appending telemetry to ${opts.recordPath}`);
  }

  const app = await buildHttpApp({
    aggregator,
    settingsPath: opts.configPath,
    staticPath: opts.staticPath,
  });

  const stopWs = attachWsBroadcaster(app, aggregator);
  await app.listen({ port: opts.port, host: opts.host ?? '0.0.0.0' });

  return {
    aggregator,
    simBridge,
    close: async () => {
      stopWs();
      simBridge?.stop();
      recordStream?.end();
      await app.close();
    },
  };
}

// CLI launcher — only runs when invoked directly.
// Use pathToFileURL on argv[1] so the comparison works on Windows,
// where the path uses backslashes and a drive letter.
const entryArg = process.argv[1];
const invokedDirectly =
  entryArg !== undefined && import.meta.url === pathToFileURL(entryArg).href;
if (invokedDirectly) {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = resolve(here, '..', '..');
  const defaults: StartOptions = {
    configPath: process.env.FF_CONFIG_PATH ?? join(repoRoot, 'server', '.data', 'settings.json'),
    staticPath: process.env.FF_STATIC_PATH ?? join(repoRoot, 'web', 'dist'),
    port: Number(process.env.FF_PORT ?? 4444),
    recordPath: process.env.FF_RECORD_PATH,
  };
  start(defaults).catch((err) => {
    console.error('failed to start', err);
    process.exit(1);
  });
}
