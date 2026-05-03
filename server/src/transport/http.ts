import { writeFile } from 'node:fs/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadSettings, saveSettings } from '../config/settings.js';
import { fetchLatestOfp, loadOfpFromFile, siblingOfpPath, SimbriefError, trimOfpForFixture } from '../simbrief/client.js';
import type { Aggregator } from '../state/aggregator.js';
import { ResetBodySchema, SettingsBodySchema } from './schemas.js';

export type HttpOptions = {
  aggregator: Aggregator;
  settingsPath: string;
  staticPath: string;
  /** When set, /api/simbrief/fetch reads from this file instead of the network. Dev-only. */
  simbriefFixturePath?: string;
  /**
   * When set (and simbriefFixturePath is not), /api/simbrief/fetch writes
   * the raw OFP to a sibling of this path on success. Used during dev
   * recording so the resulting .jsonl + .ofp.json are paired.
   */
  recordPath?: string;
};

export async function buildHttpApp(opts: HttpOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(fastifyStatic, {
    root: opts.staticPath,
    prefix: '/',
  });

  app.get('/api/settings', async () => loadSettings(opts.settingsPath));

  app.post('/api/settings', async (req, reply) => {
    const parsed = SettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'INVALID_BODY', detail: parsed.error.flatten() };
    }
    saveSettings(opts.settingsPath, parsed.data);
    return parsed.data;
  });

  app.post('/api/reset', async (req, reply) => {
    const parsed = ResetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'INVALID_BODY', detail: parsed.error.flatten() };
    }
    switch (parsed.data.scope) {
      case 'aircraft':
        opts.aggregator.resetAircraft();
        break;
      case 'plan':
        opts.aggregator.resetPlan();
        break;
      case 'all':
        opts.aggregator.resetAll();
        break;
    }
    return { ok: true };
  });

  app.post('/api/simbrief/fetch', async (_req, reply) => {
    // Dev fixture mode: read the OFP from disk instead of hitting Simbrief.
    if (opts.simbriefFixturePath) {
      try {
        const { plan } = await loadOfpFromFile(opts.simbriefFixturePath);
        opts.aggregator.setPlan(plan);
        return plan;
      } catch (err) {
        const code = err instanceof SimbriefError ? err.code : 'UNKNOWN';
        reply.code(502);
        return { error: code, message: (err as Error).message };
      }
    }

    const settings = loadSettings(opts.settingsPath);
    if (!settings.simbriefUserId) {
      reply.code(400);
      return { error: 'NO_USER_ID', message: 'Simbrief user ID not configured' };
    }
    try {
      const { raw, plan } = await fetchLatestOfp(settings.simbriefUserId);
      opts.aggregator.setPlan(plan);

      // Recording-paired capture: when dev:record is active, persist the
      // raw OFP next to the .jsonl so a single recording session yields a
      // ready-to-replay fixture pair.
      if (opts.recordPath) {
        const ofpPath = siblingOfpPath(opts.recordPath);
        try {
          await writeFile(ofpPath, JSON.stringify(trimOfpForFixture(raw), null, 2), 'utf8');
        } catch (writeErr) {
          // Best-effort: don't fail the response, but warn loudly. Aligned
          // with the existing recorder's "don't crash the server" stance.
          // eslint-disable-next-line no-console
          console.warn('[record] failed to persist OFP', writeErr);
        }
      }

      return plan;
    } catch (err) {
      const code = err instanceof SimbriefError ? err.code : 'UNKNOWN';
      reply.code(502);
      return { error: code, message: (err as Error).message };
    }
  });

  // SPA fallback: any GET that isn't /api/* serves index.html
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    reply.sendFile('index.html');
  });

  return app;
}
