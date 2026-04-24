import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Aggregator } from './state/aggregator.js';
import { SimBridge } from './sim-bridge/client.js';
import { buildHttpApp } from './transport/http.js';
import { attachWsBroadcaster } from './transport/ws.js';

export type StartOptions = {
  configPath: string;
  staticPath: string;
  port: number;
  host?: string;
  disableSim?: boolean; // used by dev-telemetry-replay
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
      await app.close();
    },
  };
}

// CLI launcher — only runs when invoked directly.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = resolve(here, '..', '..');
  const defaults: StartOptions = {
    configPath: process.env.FF_CONFIG_PATH ?? join(repoRoot, 'server', '.data', 'settings.json'),
    staticPath: process.env.FF_STATIC_PATH ?? join(repoRoot, 'web', 'dist'),
    port: Number(process.env.FF_PORT ?? 4444),
  };
  start(defaults).catch((err) => {
    console.error('failed to start', err);
    process.exit(1);
  });
}
