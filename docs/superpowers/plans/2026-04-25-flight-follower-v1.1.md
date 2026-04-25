# Flight Follower v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land ten polish-and-bugfix items on top of shipped v1: kill the pre-spawn 0,0 line, fix the aircraft icon rotation, stabilize the position display, make recording reliable on Windows, persist map view mode within the same browser session, declutter waypoint labels, allow zoom in Follow, show airport names, surface three UTC times (sim now + scheduled dep/arr), and add a forward replay-skip env var for dev.

**Architecture:** Purely additive. No new modules, no new endpoints, no new WS message types. Server changes are in the aggregator (filter), simbridge variables (ZULU vars), simbrief parser (name + sched times), and the entrypoint (recording UX). Frontend changes are in seven existing files plus the `fmt.ts` helper. All new shared-type fields are optional, preserving backwards compatibility with existing recordings and OFPs.

**Tech Stack:** TypeScript (strict, ESM), Vitest, Zustand 4 (persist + createJSONStorage middleware), node-simconnect, Leaflet/React-Leaflet, Zod.

**Spec:** [`docs/superpowers/specs/2026-04-25-flight-follower-v1.1-design.md`](../specs/2026-04-25-flight-follower-v1.1-design.md)

---

## File Structure

Files modified:
- `shared/types.ts`
- `server/src/state/aggregator.ts`, `server/src/state/aggregator.test.ts`
- `server/src/sim-bridge/variables.ts`
- `server/src/simbrief/parser.ts`, `server/src/simbrief/parser.test.ts`
- `server/src/simbrief/fixtures/minimal-ofp.json`
- `server/src/index.ts`
- `scripts/dev-telemetry-replay.ts`
- `web/src/store/view.ts`
- `web/src/components/Map/MapController.tsx`
- `web/src/components/Map/PlannedRoute.tsx`
- `web/src/components/Map/AircraftMarker.tsx`
- `web/src/components/DataPanel/fmt.ts`
- `web/src/components/DataPanel/PositionCard.tsx`
- `web/src/components/DataPanel/RouteCard.tsx`
- `web/src/components/DataPanel/TimeCard.tsx`
- `.env.example`, `README.md`

One new file: `server/src/sim-bridge/variables.test.ts`.

---

## Verification commands (used throughout)

- Server tests: `npm test`
- Server typecheck: `npx tsc -p server --noEmit`
- Web typecheck: `npx tsc -p web --noEmit`
- Production build: `npm run build`
- Replay manual verification: `npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl` plus `npm --workspace web run dev`, then visit `http://localhost:5173`.

---

## Task 1: Extend shared types

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Edit `shared/types.ts`**

Find the existing `Airport` type and add an optional `name` field:

```ts
export type Airport = {
  icao: string;
  lat: number;
  lon: number;
  name?: string;
};
```

Find `RawTelemetry` and add `simTimeUtc`:

```ts
export type RawTelemetry = {
  timestamp: number;
  position: LatLon;
  altitude: { msl: number };
  speed: { ground: number; indicated: number; mach: number };
  heading: { magnetic: number };
  verticalSpeed: number;
  wind: { direction: number; speed: number };
  onGround: boolean;
  simTimeUtc?: number;
};
```

Find `FlightPlan` and add the two scheduled-time fields:

```ts
export type FlightPlan = {
  fetchedAt: number;
  origin: Airport;
  destination: Airport;
  waypoints: Waypoint[];
  alternate?: Airport;
  scheduledOut?: number;
  scheduledIn?: number;
};
```

- [ ] **Step 2: Typecheck both packages**

Run: `npx tsc -p server --noEmit && npx tsc -p web --noEmit`
Expected: no errors. Adding optional fields doesn't break existing code.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(shared): add optional Airport.name, RawTelemetry.simTimeUtc, FlightPlan scheduled times"
```

---

## Task 2: Drop near-(0,0) telemetry frames in the aggregator

**Files:**
- Modify: `server/src/state/aggregator.ts`
- Test: `server/src/state/aggregator.test.ts`

- [ ] **Step 1: Add failing tests in `aggregator.test.ts`**

Add this `describe` block at the bottom of the file (after the existing `describe('Aggregator progress', …)` block):

```ts
describe('Aggregator near-(0,0) filter', () => {
  it('drops frames within 1° of the origin (MSFS pre-spawn)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0.0004, lon: 0.014 }, onGround: true }));
    const s = a.getState();
    expect(s.telemetry).toBeNull();
    expect(s.breadcrumb).toEqual([]);
  });

  it('drops a frame on the inside boundary (0.999, 0.999)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0.999, lon: 0.999 }, onGround: true }));
    expect(a.getState().telemetry).toBeNull();
  });

  it('accepts a frame on the outside boundary (1.001, 0)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 1.001, lon: 0 }, onGround: true }));
    expect(a.getState().telemetry?.position.lat).toBe(1.001);
  });

  it('accepts a real-world frame far from origin', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 52.36, lon: 13.51 }, onGround: false }));
    expect(a.getState().telemetry?.position).toEqual({ lat: 52.36, lon: 13.51 });
  });

  it('does not emit "state" for dropped frames', () => {
    const a = new Aggregator();
    let count = 0;
    a.on('state', () => count++);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0.0004, lon: 0.014 }, onGround: true }));
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, see fail**

Run: `npm test`
Expected: the five new tests fail (they all expect the frame to be dropped/accepted, but the aggregator currently accepts every frame).

- [ ] **Step 3: Add the filter in `aggregator.ts`**

In `server/src/state/aggregator.ts`, modify the `ingestTelemetry` method. Replace the current method:

```ts
ingestTelemetry(t: RawTelemetry): void {
  const breadcrumb = this.updateBreadcrumb(t);
  this.updateTakeoffState(t);
  const progress = this.computeProgress(t, this.state.plan);

  this.state = {
    ...this.state,
    telemetry: t,
    breadcrumb,
    progress,
  };
  this.emit('state', this.state);
}
```

with this version:

```ts
ingestTelemetry(t: RawTelemetry): void {
  // MSFS reports ~(0,0) on the menu/loading screen. The 1° box around the
  // origin sits entirely in the Gulf of Guinea — no real flight goes there.
  if (Math.abs(t.position.lat) < 1 && Math.abs(t.position.lon) < 1) {
    return;
  }

  const breadcrumb = this.updateBreadcrumb(t);
  this.updateTakeoffState(t);
  const progress = this.computeProgress(t, this.state.plan);

  this.state = {
    ...this.state,
    telemetry: t,
    breadcrumb,
    progress,
  };
  this.emit('state', this.state);
}
```

- [ ] **Step 4: Run tests, see pass**

Run: `npm test`
Expected: all aggregator tests pass, including the five new ones.

- [ ] **Step 5: Commit**

```bash
git add server/src/state/aggregator.ts server/src/state/aggregator.test.ts
git commit -m "fix(aggregator): drop telemetry frames within 1° of (0,0)"
```

---

## Task 3: Add ZULU SimVars and emit `simTimeUtc`

**Files:**
- Modify: `server/src/sim-bridge/variables.ts`
- Test: `server/src/sim-bridge/variables.test.ts` (new file)

- [ ] **Step 1: Write failing test in new file `server/src/sim-bridge/variables.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildTelemetry } from './variables.js';

// Order in SIM_VARS:
//   lat, lon, alt, gs, ias, mach, hdg, vs, windDir, windVel, onGround,
//   zuluYear, zuluMonth, zuluDay, zuluTime
const baseValues = [52.36, 13.51, 1000, 200, 200, 0.3, 90, 0, 270, 12, 0];

describe('buildTelemetry', () => {
  it('composes simTimeUtc from ZULU YEAR/MONTH/DAY/TIME', () => {
    const zuluTimeSec = 12 * 3600 + 34 * 60 + 56; // 12:34:56 UTC
    const t = buildTelemetry([...baseValues, 2026, 4, 25, zuluTimeSec], 1000);
    expect(t.simTimeUtc).toBe(Date.UTC(2026, 3, 25, 12, 34, 56));
  });

  it('leaves simTimeUtc undefined when ZULU year is 0', () => {
    const t = buildTelemetry([...baseValues, 0, 0, 0, 0], 1000);
    expect(t.simTimeUtc).toBeUndefined();
  });

  it('still populates the existing telemetry fields', () => {
    const t = buildTelemetry([...baseValues, 2026, 4, 25, 0], 1000);
    expect(t.position).toEqual({ lat: 52.36, lon: 13.51 });
    expect(t.heading.magnetic).toBe(90);
    expect(t.timestamp).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test, see fail**

Run: `npm test`
Expected: the three new tests fail (build error or undefined values), since `variables.ts` does not yet read four extra values.

- [ ] **Step 3: Update `variables.ts`**

Replace the contents of `server/src/sim-bridge/variables.ts` with:

```ts
import type { RawTelemetry } from '@ff/shared';

/**
 * SimVar subscription definitions. Each row:
 *   [simvar name, units]
 * Order matters — parseDataBlock() reads floats in the same order.
 */
export const SIM_VARS = [
  ['PLANE LATITUDE', 'degrees'],
  ['PLANE LONGITUDE', 'degrees'],
  ['PLANE ALTITUDE', 'feet'],
  ['GROUND VELOCITY', 'knots'],
  ['AIRSPEED INDICATED', 'knots'],
  ['AIRSPEED MACH', 'mach'],
  ['PLANE HEADING DEGREES MAGNETIC', 'degrees'],
  ['VERTICAL SPEED', 'feet per minute'],
  ['AMBIENT WIND DIRECTION', 'degrees'],
  ['AMBIENT WIND VELOCITY', 'knots'],
  ['SIM ON GROUND', 'bool'],
  ['ZULU YEAR', 'number'],
  ['ZULU MONTH OF YEAR', 'number'],
  ['ZULU DAY OF MONTH', 'number'],
  ['ZULU TIME', 'seconds'],
] as const;

export function buildTelemetry(values: number[], timestamp: number): RawTelemetry {
  const [
    lat, lon, alt,
    gs, ias, mach,
    hdg, vs,
    windDir, windVel,
    onGround,
    zuluYear, zuluMonth, zuluDay, zuluTime,
  ] = values as number[];

  const simTimeUtc =
    zuluYear != null && zuluYear >= 1900
      ? Date.UTC(zuluYear, (zuluMonth ?? 1) - 1, zuluDay ?? 1) + (zuluTime ?? 0) * 1000
      : undefined;

  return {
    timestamp,
    position: { lat: lat ?? 0, lon: lon ?? 0 },
    altitude: { msl: alt ?? 0 },
    speed: { ground: gs ?? 0, indicated: ias ?? 0, mach: mach ?? 0 },
    heading: { magnetic: hdg ?? 0 },
    verticalSpeed: vs ?? 0,
    wind: { direction: windDir ?? 0, speed: windVel ?? 0 },
    onGround: (onGround ?? 0) > 0.5,
    simTimeUtc,
  };
}
```

- [ ] **Step 4: Run tests, see pass**

Run: `npm test`
Expected: variables tests pass; aggregator tests still pass.

- [ ] **Step 5: Server typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors. `client.ts` already loops `SIM_VARS.length` times when reading floats, so it picks up the four new vars automatically.

- [ ] **Step 6: Commit**

```bash
git add server/src/sim-bridge/variables.ts server/src/sim-bridge/variables.test.ts
git commit -m "feat(sim-bridge): subscribe to ZULU vars and emit simTimeUtc"
```

---

## Task 4: Parse airport `name` and scheduled times from Simbrief OFP

**Files:**
- Modify: `server/src/simbrief/fixtures/minimal-ofp.json`
- Modify: `server/src/simbrief/parser.ts`
- Test: `server/src/simbrief/parser.test.ts`

- [ ] **Step 1: Extend the fixture**

Replace `server/src/simbrief/fixtures/minimal-ofp.json` with:

```json
{
  "params": { "time_generated": "1714000000" },
  "origin": { "icao_code": "EGLL", "pos_lat": "51.4706", "pos_long": "-0.4619", "name": "London Heathrow" },
  "destination": { "icao_code": "LEMD", "pos_lat": "40.4936", "pos_long": "-3.5668", "name": "Madrid Barajas" },
  "alternate": { "icao_code": "LEBL", "pos_lat": "41.2971", "pos_long": "2.0785", "name": "Barcelona El Prat" },
  "times": {
    "sched_out": "1714053600",
    "sched_in": "1714060800"
  },
  "navlog": {
    "fix": [
      { "ident": "MID", "pos_lat": "51.0531", "pos_long": "-0.6250", "altitude_feet": "15000" },
      { "ident": "OKRIX", "pos_lat": "46.3333", "pos_long": "-2.0000", "altitude_feet": "37000" },
      { "ident": "BAN", "pos_lat": "42.7500", "pos_long": "-2.8500", "altitude_feet": "37000" }
    ]
  }
}
```

- [ ] **Step 2: Add failing tests in `parser.test.ts`**

Add these tests at the end of the existing `describe('parseSimbriefOfp', …)` block, before the closing `});`:

```ts
  it('extracts airport names when present', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.origin.name).toBe('London Heathrow');
    expect(plan.destination.name).toBe('Madrid Barajas');
    expect(plan.alternate?.name).toBe('Barcelona El Prat');
  });

  it('parses scheduled out/in as epoch ms', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.scheduledOut).toBe(1714053600 * 1000);
    expect(plan.scheduledIn).toBe(1714060800 * 1000);
  });

  it('omits scheduled times when the OFP lacks a times block', () => {
    const { times: _ignored, ...withoutTimes } = fixture;
    const plan = parseSimbriefOfp(withoutTimes);
    expect(plan.scheduledOut).toBeUndefined();
    expect(plan.scheduledIn).toBeUndefined();
  });
```

- [ ] **Step 3: Run tests, see fail**

Run: `npm test`
Expected: the three new parser tests fail (parser does not yet read `name` or `times`).

- [ ] **Step 4: Update `parser.ts`**

Replace the contents of `server/src/simbrief/parser.ts` with:

```ts
import { z } from 'zod';
import type { FlightPlan } from '@ff/shared';

const numFromStr = z.union([z.number(), z.string().transform((s) => Number(s))]);

const AirportSchema = z.object({
  icao_code: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  name: z.string().optional(),
});

const FixSchema = z.object({
  ident: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  altitude_feet: numFromStr.optional(),
});

const TimesSchema = z
  .object({
    sched_out: numFromStr.optional(),
    sched_in: numFromStr.optional(),
  })
  .optional();

const OfpSchema = z.object({
  origin: AirportSchema,
  destination: AirportSchema,
  alternate: AirportSchema.optional(),
  times: TimesSchema,
  navlog: z.object({
    fix: z.array(FixSchema),
  }),
});

export function parseSimbriefOfp(raw: unknown): FlightPlan {
  const ofp = OfpSchema.parse(raw);
  const schedOutSec = ofp.times?.sched_out;
  const schedInSec = ofp.times?.sched_in;
  return {
    fetchedAt: Date.now(),
    origin: {
      icao: ofp.origin.icao_code,
      lat: ofp.origin.pos_lat,
      lon: ofp.origin.pos_long,
      name: ofp.origin.name,
    },
    destination: {
      icao: ofp.destination.icao_code,
      lat: ofp.destination.pos_lat,
      lon: ofp.destination.pos_long,
      name: ofp.destination.name,
    },
    alternate: ofp.alternate
      ? {
          icao: ofp.alternate.icao_code,
          lat: ofp.alternate.pos_lat,
          lon: ofp.alternate.pos_long,
          name: ofp.alternate.name,
        }
      : undefined,
    waypoints: ofp.navlog.fix.map((f) => ({
      ident: f.ident,
      lat: f.pos_lat,
      lon: f.pos_long,
      plannedAltitude: f.altitude_feet,
    })),
    scheduledOut: schedOutSec != null ? schedOutSec * 1000 : undefined,
    scheduledIn: schedInSec != null ? schedInSec * 1000 : undefined,
  };
}
```

- [ ] **Step 5: Run tests, see pass**

Run: `npm test`
Expected: all parser tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/simbrief/parser.ts server/src/simbrief/parser.test.ts server/src/simbrief/fixtures/minimal-ofp.json
git commit -m "feat(simbrief): parse airport names and scheduled out/in times"
```

---

## Task 5: Recording UX — resolve absolute path, log clearly, add 30 s heartbeat

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Update `start()` in `server/src/index.ts`**

Replace the entire contents of `server/src/index.ts` with:

```ts
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Aggregator } from './state/aggregator.js';
import { SimBridge } from './sim-bridge/client.js';
import { buildHttpApp } from './transport/http.js';
import { attachWsBroadcaster } from './transport/ws.js';

const RECORD_HEARTBEAT_MS = 30_000;

export type StartOptions = {
  configPath: string;
  staticPath: string;
  port: number;
  host?: string;
  disableSim?: boolean;
  recordPath?: string;
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
  let recordHeartbeat: NodeJS.Timeout | null = null;
  let recordTotal = 0;
  let absRecordPath: string | null = null;
  if (opts.recordPath && simBridge) {
    absRecordPath = resolve(opts.recordPath);
    await mkdir(dirname(absRecordPath), { recursive: true });
    recordStream = createWriteStream(absRecordPath, { flags: 'a' });
    let sinceLast = 0;
    let firstHeartbeat = true;
    simBridge.on('telemetry', (t) => {
      recordStream?.write(`${JSON.stringify(t)}\n`);
      sinceLast++;
      recordTotal++;
    });
    console.log(`[record] writing to ${absRecordPath}`);
    recordHeartbeat = setInterval(() => {
      if (firstHeartbeat && sinceLast === 0) {
        console.warn('[record] no telemetry received in the first 30s — is MSFS running and a flight loaded?');
      } else {
        console.log(`[record] +${sinceLast} events (${recordTotal} total)`);
      }
      firstHeartbeat = false;
      sinceLast = 0;
    }, RECORD_HEARTBEAT_MS);
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
      if (recordHeartbeat) clearInterval(recordHeartbeat);
      if (recordStream && absRecordPath) {
        console.log(`[record] flushed ${recordTotal} total events to ${absRecordPath}`);
      }
      simBridge?.stop();
      recordStream?.end();
      await app.close();
    },
  };
}

// CLI launcher — only runs when invoked directly.
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
```

The behavioral changes vs. the previous version:
- `absRecordPath` resolves whatever the caller passes against `process.cwd()` and is the only path actually used after that.
- The startup log line uses the absolute path (no more "I told you it was at ./foo.jsonl but actually it's not there").
- Telemetry counter + 30 s heartbeat. First heartbeat with zero events emits a warning instead of a noisy "+0".
- On shutdown, the total event count and absolute path are logged.

- [ ] **Step 2: Server typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors.

- [ ] **Step 3: Server tests still pass**

Run: `npm test`
Expected: all tests pass (no behavior change in the test paths).

- [ ] **Step 4: Manual sanity check**

Start the server with a relative record path and observe the log line:

```bash
FF_RECORD_PATH=./tmp-rec.jsonl FF_STATIC_PATH=/tmp npm --workspace server run start
```

Expected: the first line of recording-related output is `[record] writing to /<absolute>/tmp-rec.jsonl` (the absolute path of the file relative to your shell's CWD, not the workspace dir). After 30s, expect either a `[record] +N events (M total)` line or a "no telemetry received" warning. Hit Ctrl+C; expect a `[record] flushed M total events to /<abs>/tmp-rec.jsonl` line.

Clean up: `rm -f tmp-rec.jsonl`

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): resolve FF_RECORD_PATH absolute and log heartbeat / totals"
```

---

## Task 6: Forward replay seek via `REPLAY_START_MS`

**Files:**
- Modify: `scripts/dev-telemetry-replay.ts`

- [ ] **Step 1: Update the replay script**

Replace the contents of `scripts/dev-telemetry-replay.ts` with:

```ts
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
  const startMs = Number(process.env.REPLAY_START_MS ?? 0);

  const lines = readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
  const allEvents: RawTelemetry[] = lines.map((l) => JSON.parse(l) as RawTelemetry);
  const firstTs = allEvents[0]?.timestamp ?? 0;
  const skipIdx = startMs > 0
    ? allEvents.findIndex((e) => e.timestamp - firstTs >= startMs)
    : 0;
  const events = skipIdx > 0 ? allEvents.slice(skipIdx) : allEvents;
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
```

- [ ] **Step 2: Server typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Run the replay against the new fixture, skipping the first 30 seconds (which contains 56 stationary frames):

```bash
REPLAY_START_MS=30000 npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl
```

Expected log: `replay running at tick=500ms, events=2098, skipped=56`. Hit Ctrl+C.

Run again without the env var to confirm default behavior is unchanged:

```bash
npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl
```

Expected log: `replay running at tick=500ms, events=2154` (no `skipped=` clause).

- [ ] **Step 4: Commit**

```bash
git add scripts/dev-telemetry-replay.ts
git commit -m "feat(replay): support REPLAY_START_MS to skip ahead in the fixture"
```

---

## Task 7: Persist view mode in `sessionStorage`

**Files:**
- Modify: `web/src/store/view.ts`

- [ ] **Step 1: Rewrite the view store with the `persist` middleware**

Replace the contents of `web/src/store/view.ts` with:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ViewMode = 'overview' | 'follow' | 'manual';

type ViewStore = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
};

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      mode: 'overview',
      setMode: (m) => set({ mode: m }),
    }),
    {
      name: 'ff:view-mode',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ mode: s.mode }),
    },
  ),
);
```

Notes:
- `create<ViewStore>()` (with the empty parens) is the curried form Zustand v4 needs when middleware is composed.
- `partialize` ensures only `mode` is persisted — even if we add transient state to the store later, it won't accidentally bleed into `sessionStorage`.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

In one terminal: `npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl`
In another: `npm --workspace web run dev`

Open `http://localhost:5173`. Switch to **Follow**. Reload the tab — mode should still read **Follow**. Open `http://localhost:5173` in a new tab (or close and reopen) — should reset to **Overview**.

To inspect the storage in DevTools: Application tab → Session Storage → `http://localhost:5173` → key `ff:view-mode` should look like `{"state":{"mode":"follow"},"version":0}`.

- [ ] **Step 4: Commit**

```bash
git add web/src/store/view.ts
git commit -m "feat(web): persist map view mode in sessionStorage across reloads"
```

---

## Task 8: Allow zoom in Follow mode

**Files:**
- Modify: `web/src/components/Map/MapController.tsx`

- [ ] **Step 1: Remove the `zoomstart` handler**

In `web/src/components/Map/MapController.tsx`, replace the `useMapEvents` block:

```tsx
useMapEvents({
  dragstart: () => {
    if (programmatic.current) return;
    if (mode !== 'manual') setMode('manual');
  },
  zoomstart: () => {
    if (programmatic.current) return;
    if (mode !== 'manual') setMode('manual');
  },
});
```

with:

```tsx
useMapEvents({
  dragstart: () => {
    if (programmatic.current) return;
    if (mode !== 'manual') setMode('manual');
  },
});
```

The follow-mode `useEffect` already uses `map.panTo(...)`, which preserves the user's zoom, so zoom now sticks across telemetry updates while in Follow.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running in another terminal. Open the app, switch to **Follow**. Use the mouse wheel or the `+/-` buttons to zoom in/out. The mode indicator should stay on **Follow** and the aircraft should remain centered. Drag the map — should still flip to **Manual**.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/MapController.tsx
git commit -m "fix(map): keep Follow mode when the user zooms"
```

---

## Task 9: Show waypoint labels only on hover

**Files:**
- Modify: `web/src/components/Map/PlannedRoute.tsx`

- [ ] **Step 1: Change waypoint tooltip from permanent to hover**

In `web/src/components/Map/PlannedRoute.tsx`, replace the entire `plan.waypoints.map(...)` block:

```tsx
{plan.waypoints.map((w) => (
  <CircleMarker
    key={`${w.ident}-${w.lat}-${w.lon}`}
    center={[w.lat, w.lon]}
    radius={4}
    pathOptions={{ color: '#a855f7', fillColor: '#fff', fillOpacity: 1 }}
  >
    <Tooltip permanent direction="top" offset={[0, -6]}>{w.ident}</Tooltip>
  </CircleMarker>
))}
```

with:

```tsx
{plan.waypoints.map((w) => (
  <CircleMarker
    key={`${w.ident}-${w.lat}-${w.lon}`}
    center={[w.lat, w.lon]}
    radius={4}
    pathOptions={{ color: '#a855f7', fillColor: '#fff', fillOpacity: 1 }}
  >
    <Tooltip direction="top" offset={[0, -6]}>{w.ident}</Tooltip>
  </CircleMarker>
))}
```

Origin and destination tooltips still have `permanent` — they're route anchors and remain useful at a glance.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running. Click "Fetch latest" on the Settings dialog (or whatever pulls the plan in your local setup) so the planned route appears. Waypoint markers should be visible but **without** their idents drawn on top of each other; hovering a marker should reveal its ident. Origin (green) and destination (red) markers still show their ICAO permanently.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/PlannedRoute.tsx
git commit -m "fix(map): show waypoint labels on hover only to reduce clutter"
```

---

## Task 10: Replace aircraft-icon glyph with a north-pointing SVG

**Files:**
- Modify: `web/src/components/Map/AircraftMarker.tsx`

- [ ] **Step 1: Swap the divIcon HTML for an inline SVG**

Replace the contents of `web/src/components/Map/AircraftMarker.tsx` with:

```tsx
import { divIcon } from 'leaflet';
import { Marker } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.7 12.3 2 11.5 2S10 2.7 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

export function AircraftMarker() {
  const t = useFlightStore((s) => s.state.telemetry);
  if (!t) return null;
  const heading = t.heading.magnetic;
  const html = `
    <div style="width:24px;height:24px;color:#2563eb;transform:rotate(${heading}deg);transform-origin:center;display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
        <path fill="currentColor" d="${PLANE_PATH}" />
      </svg>
    </div>
  `;
  const icon = divIcon({
    className: 'ff-aircraft',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  return <Marker position={[t.position.lat, t.position.lon]} icon={icon} interactive={false} />;
}
```

The path is the standard Material "flight" silhouette pointing **up** (i.e. north at heading 0°), so we rotate by the raw magnetic heading without any 90° offset. `currentColor` keeps the fill themable for v1.2.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running with `replay-eddb-circuit.jsonl`. The aircraft icon should be a clean blue silhouette and should rotate to point in the direction of the breadcrumb trail. As the aircraft turns through a circuit, the nose should track the new heading; previously it sat ~90° clockwise of the actual heading.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/AircraftMarker.tsx
git commit -m "fix(map): use north-pointing SVG aircraft icon (correct heading)"
```

---

## Task 11: Two-decimal hemispheric position formatting

**Files:**
- Modify: `web/src/components/DataPanel/fmt.ts`
- Modify: `web/src/components/DataPanel/PositionCard.tsx`

- [ ] **Step 1: Replace `fmtLatLon` with hemisphere-aware helpers**

In `web/src/components/DataPanel/fmt.ts`, replace the file with:

```ts
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

export function fmtLatHemi(v: number | null | undefined): string {
  if (v == null) return dash;
  const hemi = v >= 0 ? 'N' : 'S';
  return `${Math.abs(v).toFixed(2)}° ${hemi}`;
}

export function fmtLonHemi(v: number | null | undefined): string {
  if (v == null) return dash;
  const hemi = v >= 0 ? 'E' : 'W';
  return `${Math.abs(v).toFixed(2)}° ${hemi}`;
}
```

The previous `fmtLatLon` is gone — `PositionCard` is the only caller and is updated next.

- [ ] **Step 2: Update `PositionCard`**

In `web/src/components/DataPanel/PositionCard.tsx`, change the import and body. Replace:

```tsx
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtLatLon } from './fmt.js';

export function PositionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const lat = t ? fmtLatLon(t.position.lat) : dash;
  const lon = t ? fmtLatLon(t.position.lon) : dash;
  return (
    <Card title="Position">
      <Row label="Lat">{lat}</Row>
      <Row label="Lon">{lon}</Row>
    </Card>
  );
}
```

with:

```tsx
import { useFlightStore } from '../../store/flight.js';
import { fmtLatHemi, fmtLonHemi } from './fmt.js';

export function PositionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const lat = fmtLatHemi(t?.position.lat);
  const lon = fmtLonHemi(t?.position.lon);
  return (
    <Card title="Position">
      <Row label="Lat">{lat}</Row>
      <Row label="Lon">{lon}</Row>
    </Card>
  );
}
```

The exported `Card` and `Row` further down the file are unchanged.

- [ ] **Step 3: Search for stale `fmtLatLon` references**

Run: `grep -r "fmtLatLon" web/src` (in the repo root)
Expected: no results. If anything turns up, update those callers to `fmtLatHemi` / `fmtLonHemi` as appropriate.

- [ ] **Step 4: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verify**

Replay running. Position card should read e.g. `52.36° N` and `13.51° E`, and the values should change far less frequently than before (every ~5 s while taxiing, on the minute mark while cruising) instead of flickering on every 2 Hz update.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/DataPanel/fmt.ts web/src/components/DataPanel/PositionCard.tsx
git commit -m "feat(web): show position with 2 decimals and hemisphere"
```

---

## Task 12: Show airport names in the route card and on map tooltips

**Files:**
- Modify: `web/src/components/DataPanel/RouteCard.tsx`
- Modify: `web/src/components/Map/PlannedRoute.tsx`

- [ ] **Step 1: Add From / To rows to the route card**

Replace the contents of `web/src/components/DataPanel/RouteCard.tsx` with:

```tsx
import type { Airport } from '@ff/shared';
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, fmtDurationSec, dash } from './fmt.js';

function fmtAirport(a: Airport): string {
  return a.name ? `${a.icao} · ${a.name}` : a.icao;
}

export function RouteCard() {
  const plan = useFlightStore((s) => s.state.plan);
  const p = useFlightStore((s) => s.state.progress);
  if (!plan) {
    return (
      <Card title="Route">
        <div style={{ color: '#6b7280' }}>Import a plan to see route info.</div>
      </Card>
    );
  }
  return (
    <Card title="Route">
      <Row label="From">{fmtAirport(plan.origin)}</Row>
      <Row label="To">{fmtAirport(plan.destination)}</Row>
      <Row label="Next WP">{p.nextWaypoint?.ident ?? dash}</Row>
      <Row label="Dist. to next">{p.distanceToNextNm != null ? `${fmtNum(p.distanceToNextNm, 1)} nm` : dash}</Row>
      <Row label="ETE next">{fmtDurationSec(p.eteToNextSec)}</Row>
      <Row label="Dist. to dest">{p.distanceToDestNm != null ? `${fmtNum(p.distanceToDestNm, 0)} nm` : dash}</Row>
      <Row label="ETE dest">{fmtDurationSec(p.eteToDestSec)}</Row>
    </Card>
  );
}
```

- [ ] **Step 2: Show ICAO + name on origin/destination map tooltips**

In `web/src/components/Map/PlannedRoute.tsx`, replace the two origin/destination `<CircleMarker>` blocks at the bottom of the JSX:

```tsx
<CircleMarker center={[plan.origin.lat, plan.origin.lon]} radius={6} pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 1 }}>
  <Tooltip permanent direction="top" offset={[0, -8]}>{plan.origin.icao}</Tooltip>
</CircleMarker>
<CircleMarker center={[plan.destination.lat, plan.destination.lon]} radius={6} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 }}>
  <Tooltip permanent direction="top" offset={[0, -8]}>{plan.destination.icao}</Tooltip>
</CircleMarker>
```

with:

```tsx
<CircleMarker center={[plan.origin.lat, plan.origin.lon]} radius={6} pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 1 }}>
  <Tooltip permanent direction="top" offset={[0, -8]}>
    <strong>{plan.origin.icao}</strong>
    {plan.origin.name && <div style={{ fontSize: '0.85em', opacity: 0.85 }}>{plan.origin.name}</div>}
  </Tooltip>
</CircleMarker>
<CircleMarker center={[plan.destination.lat, plan.destination.lon]} radius={6} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 }}>
  <Tooltip permanent direction="top" offset={[0, -8]}>
    <strong>{plan.destination.icao}</strong>
    {plan.destination.name && <div style={{ fontSize: '0.85em', opacity: 0.85 }}>{plan.destination.name}</div>}
  </Tooltip>
</CircleMarker>
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verify**

Replay running plus a Simbrief plan loaded for an OFP that includes `name` (any standard OFP). The route card's first two rows should read e.g. `EGLL · London Heathrow` / `LEMD · Madrid Barajas`. The map's origin/destination tooltips should show ICAO bold on top and the airport name in smaller text below. Plans without `name` (older saved fixtures) gracefully fall back to ICAO only.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/RouteCard.tsx web/src/components/Map/PlannedRoute.tsx
git commit -m "feat(web): show airport name beside ICAO in route card and map tooltips"
```

---

## Task 13: Rewrite TimeCard to show three UTC times plus elapsed

**Files:**
- Modify: `web/src/components/DataPanel/fmt.ts`
- Modify: `web/src/components/DataPanel/TimeCard.tsx`

- [ ] **Step 1: Add `fmtUtcTime` to `fmt.ts`**

Append this function to `web/src/components/DataPanel/fmt.ts`:

```ts
export function fmtUtcTime(epochMs: number | null | undefined): string {
  if (epochMs == null) return dash;
  const d = new Date(epochMs);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}
```

- [ ] **Step 2: Rewrite `TimeCard.tsx`**

Replace the contents of `web/src/components/DataPanel/TimeCard.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtDurationSec, fmtUtcTime } from './fmt.js';

export function TimeCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const plan = useFlightStore((s) => s.state.plan);
  const ft = useFlightStore((s) => s.state.progress.flightTimeSec);

  // Force a re-render every 30s so the wall-clock fallback for "Now" still
  // ticks even when no telemetry is arriving (e.g., on the menu).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const usingSimTime = t?.simTimeUtc != null;
  const now = t?.simTimeUtc ?? Date.now();

  return (
    <Card title="Time">
      <Row label="UTC now">{`${fmtUtcTime(now)}${usingSimTime ? ' (sim)' : ''}`}</Row>
      <Row label="UTC dep">{fmtUtcTime(plan?.scheduledOut)}</Row>
      <Row label="UTC arr">{fmtUtcTime(plan?.scheduledIn)}</Row>
      <Row label="Elapsed">{fmtDurationSec(ft)}</Row>
    </Card>
  );
}
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verify**

Replay running with `replay-eddb-circuit.jsonl` (has no `simTimeUtc`):
- "UTC now" shows the current wall-clock time, **without** the `(sim)` tag.
- "UTC dep" / "UTC arr" show `—` if no plan is loaded; with a Simbrief OFP loaded, they show `HH:mm` UTC values from `sched_out` / `sched_in`.
- "Elapsed" still increments after takeoff.

When connected to MSFS (or after re-recording a fresh fixture once SimVars include ZULU vars):
- "UTC now" shows the simulator's clock, **with** the `(sim)` tag.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/fmt.ts web/src/components/DataPanel/TimeCard.tsx
git commit -m "feat(web): show UTC now/dep/arr plus elapsed in TimeCard"
```

---

## Task 14: Update docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Document `REPLAY_START_MS` in `.env.example`**

Append this section to `.env.example` (right after the existing `REPLAY_TICK_MS` block):

```
# How many milliseconds of fixture wall-clock to skip before starting the
# replay broadcast. Useful when a recording starts with a long stationary
# pre-flight (cockpit setup) — set REPLAY_START_MS=120000 to skip the first
# two minutes. Forward-only.
# Default: 0
# REPLAY_START_MS=0
```

- [ ] **Step 2: Update the recording section in `README.md`**

In `README.md`, find the "Recording and replaying flights" section. Append (after the existing "To replay a saved file later" example):

```markdown
The recording log on startup shows the **resolved absolute path** the file is
being written to — relative `FF_RECORD_PATH` values are resolved against your
shell's current directory, not the workspace root. While recording, the
server prints a heartbeat every 30 s with the number of events appended; if
the first heartbeat fires with zero events, you'll get a warning suggesting
MSFS may not be running.

To skip the long stationary preamble of a recording during replay, set
`REPLAY_START_MS`:

```bash
REPLAY_START_MS=30000 npm run dev:replay -- recordings/<your-flight>.jsonl
```
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document recording log behavior and REPLAY_START_MS"
```

---

## Final verification

- [ ] **Step 1: Full server test suite**

Run: `npm test`
Expected: all tests pass (aggregator filter tests, parser airport/times tests, buildTelemetry tests, plus all pre-existing tests).

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: no errors in either workspace.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: web bundle builds without errors.

- [ ] **Step 4: End-to-end replay walkthrough**

In one terminal: `npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl`
In another: `npm --workspace web run dev`
Open `http://localhost:5173`.

Walk through every v1.1 behavior in one session:
1. **No 0,0 line** — on first paint there should be no orange polyline crossing from (0,0) to EDDB; the breadcrumb starts at the EDDB ramp.
2. **Aircraft icon** — points along the breadcrumb's direction of travel.
3. **Position card** — `52.36° N · 13.51° E`-style values that change slowly.
4. **TimeCard** — UTC now (no `(sim)` tag, since the fixture has no `simTimeUtc`), UTC dep / arr (or `—` if no plan), elapsed.
5. **Map mode persistence** — switch to Follow, reload tab, mode stays Follow; close and reopen the tab, mode resets to Overview.
6. **Hover-only waypoints** — load a Simbrief plan; waypoint idents only appear on hover; origin/dest stay visible.
7. **Zoom in Follow** — switch to Follow, scroll the wheel, mode does not flip; aircraft stays centered.
8. **Airport name** — RouteCard's From/To rows show ICAO + name; map origin/dest tooltips have name beneath ICAO.

- [ ] **Step 5: Replay-skip walkthrough**

Stop replay, restart with: `REPLAY_START_MS=30000 npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl`

Console line should read: `replay running at tick=500ms, events=2098, skipped=56`. The aircraft should appear near EDDB and start moving without the long pre-flight wait.

- [ ] **Step 6: Recording walkthrough**

Stop replay. Run with a relative record path:

```bash
FF_RECORD_PATH=./tmp-rec.jsonl FF_STATIC_PATH=/tmp npm --workspace server run start
```

Confirm the first recording log line is the **absolute** path. Wait 30 s. Confirm the heartbeat (or the no-telemetry warning, if not connected to MSFS). Hit Ctrl+C; confirm the `flushed N total events to /<abs>/tmp-rec.jsonl` line. Clean up with `rm -f tmp-rec.jsonl`.

- [ ] **Step 7: Final commit (if any tweaks needed)**

If anything was missed and required a follow-up, commit it with a descriptive message. Otherwise, the plan is complete.
