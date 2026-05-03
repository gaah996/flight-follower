# Flight Follower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript web app that streams live MSFS2020 telemetry to a React map UI alongside a Simbrief-imported planned route, with three map view modes, a live data panel, and graceful recovery when the sim or Simbrief is unavailable.

**Architecture:** Single Node process serves the React bundle and a WebSocket stream on one LAN port. Server is split into clean modules (`sim-bridge`, `simbrief`, `route-math`, `state`, `transport`, `config`). An aggregator produces a `FlightState` object pushed to all connected clients. Electron-future-ready: the server exposes `start({ configPath, staticPath, port })` with no hardcoded paths.

**Tech Stack:** TypeScript (strict, ESM), Node 20+, Fastify, `ws`, `node-simconnect`, Zod, Vitest; Vite, React 18, `react-leaflet`/`leaflet`, Zustand.

---

## File Structure

```
flight-follower/
├── package.json                    npm workspaces root
├── tsconfig.base.json              shared TS config (strict, ESM)
├── .gitignore
├── .node-version                   20
│
├── shared/
│   ├── package.json                @ff/shared
│   └── types.ts                    RawTelemetry, FlightPlan, FlightState, WsMessage
│
├── server/
│   ├── package.json
│   ├── tsconfig.json               extends base, paths alias @ff/shared
│   ├── vitest.config.ts
│   └── src/
│       ├── sim-bridge/
│       │   ├── client.ts           node-simconnect connection + reconnect
│       │   └── variables.ts        SimVar list + parse helpers
│       ├── simbrief/
│       │   ├── client.ts           HTTP fetch of OFP
│       │   ├── parser.ts           OFP JSON -> FlightPlan
│       │   └── parser.test.ts
│       ├── route-math/
│       │   ├── distance.ts         haversineNm, bearingDeg
│       │   ├── distance.test.ts
│       │   ├── progress.ts         nextWaypointIndex, ete
│       │   ├── progress.test.ts
│       │   ├── deviation.ts        crossTrackNm
│       │   └── deviation.test.ts
│       ├── state/
│       │   ├── aggregator.ts       Aggregator class (EventEmitter)
│       │   └── aggregator.test.ts
│       ├── transport/
│       │   ├── http.ts             Fastify app + static + /api routes
│       │   ├── ws.ts               WebSocket broadcaster
│       │   └── schemas.ts          Zod request schemas
│       ├── config/
│       │   └── settings.ts         load/save JSON settings
│       └── index.ts                export start({...}); run defaults
│
├── scripts/
│   └── dev-telemetry-replay.ts    JSONL replayer (no MSFS needed)
│
└── web/
    ├── package.json
    ├── tsconfig.json               extends base, paths alias @ff/shared
    ├── vite.config.ts              proxy /api + /ws -> server in dev
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   ├── ws.ts               WS client with backoff reconnect
        │   └── rest.ts             fetch helpers
        ├── store/
        │   ├── flight.ts           live FlightState
        │   └── view.ts             view mode + map state
        └── components/
            ├── Map/
            │   ├── Map.tsx
            │   ├── AircraftMarker.tsx
            │   ├── BreadcrumbTrail.tsx
            │   ├── PlannedRoute.tsx
            │   └── ViewModeControl.tsx
            ├── DataPanel/
            │   ├── DataPanel.tsx
            │   ├── PositionCard.tsx
            │   ├── SpeedCard.tsx
            │   ├── AltitudeCard.tsx
            │   ├── WindCard.tsx
            │   ├── TimeCard.tsx
            │   └── RouteCard.tsx
            ├── ConnectionStatus.tsx
            └── SettingsDialog.tsx
```

---

## Task 1: Repository scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.node-version`

- [ ] **Step 1: Create `.node-version`**

```
20
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules
dist
.DS_Store
*.log
.env
.env.*
coverage
*.tsbuildinfo
.vite
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "flight-follower",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "web"],
  "scripts": {
    "dev:server": "npm --workspace server run dev",
    "dev:web": "npm --workspace web run dev",
    "dev:replay": "npm --workspace server run dev:replay",
    "test": "npm --workspace server run test",
    "build": "npm --workspace web run build",
    "typecheck": "tsc -p server && tsc -p web"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 5: Install root dev deps**

Run: `npm install`
Expected: creates `package-lock.json` and `node_modules/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold npm workspaces and base tsconfig"
```

---

## Task 2: Shared types package

**Files:**
- Create: `shared/package.json`, `shared/types.ts`

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@ff/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./types.ts",
  "types": "./types.ts",
  "exports": {
    ".": "./types.ts"
  }
}
```

Note: consumers use TypeScript path aliases to resolve this — no build step needed.

- [ ] **Step 2: Create `shared/types.ts`**

```typescript
export type LatLon = { lat: number; lon: number };

export type RawTelemetry = {
  timestamp: number;
  position: LatLon;
  altitude: { msl: number };
  speed: { ground: number; indicated: number; mach: number };
  heading: { magnetic: number };
  verticalSpeed: number;
  wind: { direction: number; speed: number };
  onGround: boolean;
};

export type Waypoint = {
  ident: string;
  lat: number;
  lon: number;
  plannedAltitude?: number;
};

export type Airport = {
  icao: string;
  lat: number;
  lon: number;
};

export type FlightPlan = {
  fetchedAt: number;
  origin: Airport;
  destination: Airport;
  waypoints: Waypoint[];
  alternate?: Airport;
};

export type FlightProgress = {
  nextWaypoint: Waypoint | null;
  distanceToNextNm: number | null;
  eteToNextSec: number | null;
  distanceToDestNm: number | null;
  eteToDestSec: number | null;
  flightTimeSec: number | null;
};

export type FlightState = {
  connected: boolean;
  telemetry: RawTelemetry | null;
  plan: FlightPlan | null;
  breadcrumb: LatLon[];
  progress: FlightProgress;
};

export type WsMessage =
  | { type: 'state'; payload: FlightState }
  | { type: 'plan'; payload: FlightPlan }
  | { type: 'error'; payload: { code: string; message: string } };

export type Settings = {
  simbriefUserId: string | null;
};
```

- [ ] **Step 3: Commit**

```bash
git add shared
git commit -m "feat(shared): define cross-package types"
```

---

## Task 3: Server scaffold + Vitest

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/index.ts`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "@ff/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:replay": "tsx watch ../scripts/dev-telemetry-replay.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ff/shared": "*",
    "@fastify/static": "^7.0.0",
    "fastify": "^4.26.0",
    "node-simconnect": "^3.1.0",
    "ws": "^8.16.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.0",
    "vitest": "^1.3.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@ff/shared": ["../shared/types.ts"],
      "@ff/shared/*": ["../shared/*"]
    },
    "types": ["node"]
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@ff/shared': fileURLToPath(new URL('../shared/types.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create placeholder `server/src/index.ts`**

```typescript
export async function start(opts: { port?: number } = {}): Promise<void> {
  console.log('flight-follower server (stub) starting', opts);
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Install deps + verify typecheck**

Run: `npm install && npx tsc -p server --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server package-lock.json
git commit -m "chore(server): scaffold workspace with tsx + vitest"
```

---

## Task 4: route-math — great-circle distance and bearing (TDD)

**Files:**
- Create: `server/src/route-math/distance.ts`, `server/src/route-math/distance.test.ts`

- [ ] **Step 1: Write failing test — `server/src/route-math/distance.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { haversineNm, bearingDeg } from './distance.js';

describe('haversineNm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineNm(40, -70, 40, -70)).toBe(0);
  });

  it('returns LAX–JFK great-circle distance within 1 nm of 2145 nm', () => {
    const d = haversineNm(33.9425, -118.4081, 40.6413, -73.7781);
    expect(d).toBeGreaterThan(2144);
    expect(d).toBeLessThan(2147);
  });

  it('is symmetric', () => {
    const a = haversineNm(10, 20, 30, 40);
    const b = haversineNm(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('bearingDeg', () => {
  it('returns 0 for due north', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 4);
  });

  it('returns 90 for due east at the equator', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 4);
  });

  it('returns value in [0, 360)', () => {
    const b = bearingDeg(0, 0, -1, -1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- distance`
Expected: FAIL — module `./distance.js` not found.

- [ ] **Step 3: Implement `server/src/route-math/distance.ts`**

```typescript
const EARTH_RADIUS_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda1 = toRad(lon1);
  const lambda2 = toRad(lon2);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- distance`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/route-math
git commit -m "feat(route-math): great-circle distance and bearing"
```

---

## Task 5: route-math — progress helpers (TDD)

**Files:**
- Create: `server/src/route-math/progress.ts`, `server/src/route-math/progress.test.ts`

- [ ] **Step 1: Write failing test — `server/src/route-math/progress.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { eteSeconds, distanceToWaypointNm, advancePassedIndex } from './progress.js';

const wpts = [
  { ident: 'A', lat: 0, lon: 0 },
  { ident: 'B', lat: 0, lon: 1 },
  { ident: 'C', lat: 0, lon: 2 },
];

describe('eteSeconds', () => {
  it('computes time from distance / ground speed', () => {
    expect(eteSeconds(60, 60)).toBeCloseTo(3600, 3);
  });

  it('returns null when ground speed is below threshold', () => {
    expect(eteSeconds(100, 10)).toBeNull();
  });

  it('returns null for non-positive inputs', () => {
    expect(eteSeconds(-5, 100)).toBeNull();
    expect(eteSeconds(100, 0)).toBeNull();
  });
});

describe('distanceToWaypointNm', () => {
  it('returns distance in nautical miles', () => {
    const d = distanceToWaypointNm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 } as never);
    expect(d).toBeGreaterThan(59);
    expect(d).toBeLessThan(61);
  });
});

describe('advancePassedIndex', () => {
  it('does not advance when the aircraft is far from the next waypoint', () => {
    const next = advancePassedIndex({ lat: 5, lon: 0 }, wpts, -1, 2);
    expect(next).toBe(-1);
  });

  it('advances when within threshold of the next waypoint', () => {
    const next = advancePassedIndex({ lat: 0, lon: 0.005 }, wpts, -1, 2);
    expect(next).toBe(0);
  });

  it('never goes backwards', () => {
    const next = advancePassedIndex({ lat: 0, lon: 0 }, wpts, 1, 2);
    expect(next).toBe(1);
  });

  it('stops at the last waypoint', () => {
    const next = advancePassedIndex({ lat: 0, lon: 2.001 }, wpts, 1, 2);
    expect(next).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- progress`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/route-math/progress.ts`**

```typescript
import type { LatLon, Waypoint } from '@ff/shared';
import { haversineNm } from './distance.js';

const MIN_GS_FOR_ETE_KTS = 30;

export function distanceToWaypointNm(pos: LatLon, wp: Waypoint): number {
  return haversineNm(pos.lat, pos.lon, wp.lat, wp.lon);
}

export function eteSeconds(distanceNm: number, groundSpeedKts: number): number | null {
  if (distanceNm <= 0 || groundSpeedKts < MIN_GS_FOR_ETE_KTS) return null;
  return (distanceNm / groundSpeedKts) * 3600;
}

/**
 * Advance the "passed" waypoint cursor if the aircraft is within
 * thresholdNm of the next unpassed waypoint. Cursor never moves backwards.
 */
export function advancePassedIndex(
  pos: LatLon,
  waypoints: Waypoint[],
  currentPassedIndex: number,
  thresholdNm: number,
): number {
  let idx = currentPassedIndex;
  while (idx < waypoints.length - 1) {
    const next = waypoints[idx + 1]!;
    if (distanceToWaypointNm(pos, next) <= thresholdNm) {
      idx += 1;
    } else {
      break;
    }
  }
  return idx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- progress`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/route-math/progress.ts server/src/route-math/progress.test.ts
git commit -m "feat(route-math): ETE and waypoint-passage tracking"
```

---

## Task 6: route-math — cross-track deviation (TDD)

**Files:**
- Create: `server/src/route-math/deviation.ts`, `server/src/route-math/deviation.test.ts`

- [ ] **Step 1: Write failing test — `server/src/route-math/deviation.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { crossTrackNm } from './deviation.js';

describe('crossTrackNm', () => {
  it('returns ~0 for a point directly on the segment', () => {
    const xt = crossTrackNm({ lat: 0, lon: 0.5 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(Math.abs(xt)).toBeLessThan(0.01);
  });

  it('returns a positive number for a point offset from the segment', () => {
    const xt = crossTrackNm({ lat: 0.1, lon: 0.5 }, { lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(xt).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- deviation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/route-math/deviation.ts`**

```typescript
import type { LatLon } from '@ff/shared';

const EARTH_RADIUS_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Absolute cross-track distance in nautical miles from `pos` to the great-circle through `a`-`b`. */
export function crossTrackNm(pos: LatLon, a: LatLon, b: LatLon): number {
  const d13 = greatCircleRad(a, pos);
  const brng13 = initialBearingRad(a, pos);
  const brng12 = initialBearingRad(a, b);
  const xt = Math.asin(Math.sin(d13) * Math.sin(brng13 - brng12));
  return Math.abs(xt) * EARTH_RADIUS_NM;
}

function greatCircleRad(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function initialBearingRad(a: LatLon, b: LatLon): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const lambda1 = toRad(a.lon);
  const lambda2 = toRad(b.lon);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return Math.atan2(y, x);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- deviation`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/route-math/deviation.ts server/src/route-math/deviation.test.ts
git commit -m "feat(route-math): cross-track deviation"
```

---

## Task 7: Simbrief parser (TDD)

**Files:**
- Create: `server/src/simbrief/parser.ts`, `server/src/simbrief/parser.test.ts`, `server/src/simbrief/fixtures/minimal-ofp.json`

- [ ] **Step 1: Create fixture `server/src/simbrief/fixtures/minimal-ofp.json`**

```json
{
  "params": { "time_generated": "1714000000" },
  "origin": { "icao_code": "EGLL", "pos_lat": "51.4706", "pos_long": "-0.4619" },
  "destination": { "icao_code": "LEMD", "pos_lat": "40.4936", "pos_long": "-3.5668" },
  "alternate": { "icao_code": "LEBL", "pos_lat": "41.2971", "pos_long": "2.0785" },
  "navlog": {
    "fix": [
      { "ident": "MID", "pos_lat": "51.0531", "pos_long": "-0.6250", "altitude_feet": "15000" },
      { "ident": "OKRIX", "pos_lat": "46.3333", "pos_long": "-2.0000", "altitude_feet": "37000" },
      { "ident": "BAN", "pos_lat": "42.7500", "pos_long": "-2.8500", "altitude_feet": "37000" }
    ]
  }
}
```

- [ ] **Step 2: Write failing test — `server/src/simbrief/parser.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSimbriefOfp } from './parser.js';

const fixturePath = fileURLToPath(new URL('./fixtures/minimal-ofp.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('parseSimbriefOfp', () => {
  it('extracts origin and destination ICAOs', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.origin.icao).toBe('EGLL');
    expect(plan.destination.icao).toBe('LEMD');
  });

  it('parses alternate when present', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.alternate?.icao).toBe('LEBL');
  });

  it('coerces string coordinates to numbers', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(typeof plan.origin.lat).toBe('number');
    expect(plan.origin.lat).toBeCloseTo(51.4706, 4);
  });

  it('produces a waypoint list in order', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.waypoints.map((w) => w.ident)).toEqual(['MID', 'OKRIX', 'BAN']);
  });

  it('sets fetchedAt to a timestamp around now', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(Math.abs(Date.now() - plan.fetchedAt)).toBeLessThan(2000);
  });

  it('rejects input missing required fields', () => {
    expect(() => parseSimbriefOfp({})).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --workspace server run test -- parser`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `server/src/simbrief/parser.ts`**

```typescript
import { z } from 'zod';
import type { FlightPlan } from '@ff/shared';

const numFromStr = z.union([z.number(), z.string().transform((s) => Number(s))]);

const AirportSchema = z.object({
  icao_code: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
});

const FixSchema = z.object({
  ident: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  altitude_feet: numFromStr.optional(),
});

const OfpSchema = z.object({
  origin: AirportSchema,
  destination: AirportSchema,
  alternate: AirportSchema.optional(),
  navlog: z.object({
    fix: z.array(FixSchema),
  }),
});

export function parseSimbriefOfp(raw: unknown): FlightPlan {
  const ofp = OfpSchema.parse(raw);
  return {
    fetchedAt: Date.now(),
    origin: {
      icao: ofp.origin.icao_code,
      lat: ofp.origin.pos_lat,
      lon: ofp.origin.pos_long,
    },
    destination: {
      icao: ofp.destination.icao_code,
      lat: ofp.destination.pos_lat,
      lon: ofp.destination.pos_long,
    },
    alternate: ofp.alternate
      ? {
          icao: ofp.alternate.icao_code,
          lat: ofp.alternate.pos_lat,
          lon: ofp.alternate.pos_long,
        }
      : undefined,
    waypoints: ofp.navlog.fix.map((f) => ({
      ident: f.ident,
      lat: f.pos_lat,
      lon: f.pos_long,
      plannedAltitude: f.altitude_feet,
    })),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace server run test -- parser`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/simbrief
git commit -m "feat(simbrief): Zod-validated OFP parser"
```

---

## Task 8: Simbrief HTTP client

**Files:**
- Create: `server/src/simbrief/client.ts`

- [ ] **Step 1: Implement `server/src/simbrief/client.ts`**

```typescript
import type { FlightPlan } from '@ff/shared';
import { parseSimbriefOfp } from './parser.js';

export class SimbriefError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SimbriefError';
  }
}

export async function fetchLatestOfp(userId: string): Promise<FlightPlan> {
  if (!userId.trim()) {
    throw new SimbriefError('NO_USER_ID', 'Simbrief user ID not configured');
  }
  const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(userId)}&json=1`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new SimbriefError('NETWORK', `Could not reach Simbrief: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new SimbriefError('HTTP', `Simbrief returned HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SimbriefError('BAD_JSON', 'Simbrief response was not valid JSON');
  }

  try {
    return parseSimbriefOfp(json);
  } catch (err) {
    throw new SimbriefError('BAD_OFP', `Simbrief OFP failed validation: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/simbrief/client.ts
git commit -m "feat(simbrief): HTTP fetcher with typed errors"
```

---

## Task 9: Config / settings persistence

**Files:**
- Create: `server/src/config/settings.ts`, `server/src/config/settings.test.ts`

- [ ] **Step 1: Write failing test — `server/src/config/settings.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- settings`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/config/settings.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- settings`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/config
git commit -m "feat(config): JSON-file settings persistence"
```

---

## Task 10: State aggregator — telemetry ingestion + breadcrumb + flight timer (TDD)

**Files:**
- Create: `server/src/state/aggregator.ts`, `server/src/state/aggregator.test.ts`

- [ ] **Step 1: Write failing test — `server/src/state/aggregator.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import type { RawTelemetry } from '@ff/shared';
import { Aggregator } from './aggregator.js';

function telem(partial: Partial<RawTelemetry> & Pick<RawTelemetry, 'timestamp' | 'position' | 'onGround'>): RawTelemetry {
  return {
    timestamp: partial.timestamp,
    position: partial.position,
    altitude: partial.altitude ?? { msl: 0 },
    speed: partial.speed ?? { ground: 0, indicated: 0, mach: 0 },
    heading: partial.heading ?? { magnetic: 0 },
    verticalSpeed: partial.verticalSpeed ?? 0,
    wind: partial.wind ?? { direction: 0, speed: 0 },
    onGround: partial.onGround,
  };
}

describe('Aggregator basics', () => {
  it('starts with null telemetry and empty breadcrumb', () => {
    const a = new Aggregator();
    const s = a.getState();
    expect(s.telemetry).toBeNull();
    expect(s.breadcrumb).toEqual([]);
    expect(s.progress.flightTimeSec).toBeNull();
  });

  it('reflects most recent telemetry and connected flag', () => {
    const a = new Aggregator();
    a.setConnected(true);
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 1, lon: 2 }, onGround: true }));
    const s = a.getState();
    expect(s.connected).toBe(true);
    expect(s.telemetry?.position).toEqual({ lat: 1, lon: 2 });
  });

  it('appends first breadcrumb point on first telemetry', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    expect(a.getState().breadcrumb).toHaveLength(1);
  });

  it('does not append a new breadcrumb within 5 s and <2° heading change', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true, heading: { magnetic: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 0, lon: 0.001 }, onGround: true, heading: { magnetic: 1 } }));
    expect(a.getState().breadcrumb).toHaveLength(1);
  });

  it('appends after 5 s elapsed', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 6000, position: { lat: 0, lon: 0.01 }, onGround: true }));
    expect(a.getState().breadcrumb).toHaveLength(2);
  });

  it('appends on >2° heading change even within 5 s', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true, heading: { magnetic: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 0, lon: 0.001 }, onGround: true, heading: { magnetic: 10 } }));
    expect(a.getState().breadcrumb).toHaveLength(2);
  });

  it('starts the flight timer on takeoff (onGround true -> false)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 0, lon: 0.01 }, onGround: false }));
    const s = a.getState();
    expect(s.progress.flightTimeSec).toBe(0);
  });

  it('increments flight time while airborne', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 0, lon: 0.01 }, onGround: false }));
    a.ingestTelemetry(telem({ timestamp: 70_000, position: { lat: 0, lon: 0.02 }, onGround: false }));
    expect(a.getState().progress.flightTimeSec).toBeCloseTo(60, 0);
  });

  it('emits "state" on every ingest', () => {
    const a = new Aggregator();
    let count = 0;
    a.on('state', () => count++);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 100, position: { lat: 0, lon: 0.001 }, onGround: true }));
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- aggregator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/state/aggregator.ts`**

```typescript
import { EventEmitter } from 'node:events';
import type { FlightPlan, FlightState, RawTelemetry } from '@ff/shared';

const BREADCRUMB_INTERVAL_MS = 5000;
const HEADING_DELTA_DEG = 2;

export class Aggregator extends EventEmitter {
  private state: FlightState = {
    connected: false,
    telemetry: null,
    plan: null,
    breadcrumb: [],
    progress: {
      nextWaypoint: null,
      distanceToNextNm: null,
      eteToNextSec: null,
      distanceToDestNm: null,
      eteToDestSec: null,
      flightTimeSec: null,
    },
  };
  private lastBreadcrumbAt = 0;
  private lastBreadcrumbHeading: number | null = null;
  private takeoffAt: number | null = null;
  private wasOnGround: boolean | null = null;

  setConnected(connected: boolean): void {
    if (this.state.connected === connected) return;
    this.state = { ...this.state, connected };
    this.emit('state', this.state);
  }

  setPlan(plan: FlightPlan): void {
    this.state = { ...this.state, plan };
    this.emit('state', this.state);
    this.emit('plan', plan);
  }

  ingestTelemetry(t: RawTelemetry): void {
    const breadcrumb = this.updateBreadcrumb(t);
    this.updateTakeoffState(t);
    const flightTimeSec =
      this.takeoffAt == null ? null : Math.max(0, (t.timestamp - this.takeoffAt) / 1000);

    this.state = {
      ...this.state,
      telemetry: t,
      breadcrumb,
      progress: { ...this.state.progress, flightTimeSec },
    };
    this.emit('state', this.state);
  }

  getState(): FlightState {
    return this.state;
  }

  private updateBreadcrumb(t: RawTelemetry): typeof this.state.breadcrumb {
    if (this.state.breadcrumb.length === 0) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [{ lat: t.position.lat, lon: t.position.lon }];
    }
    const elapsed = t.timestamp - this.lastBreadcrumbAt;
    const headingDelta =
      this.lastBreadcrumbHeading == null
        ? 0
        : Math.abs(((t.heading.magnetic - this.lastBreadcrumbHeading + 540) % 360) - 180);
    if (elapsed >= BREADCRUMB_INTERVAL_MS || headingDelta >= HEADING_DELTA_DEG) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [...this.state.breadcrumb, { lat: t.position.lat, lon: t.position.lon }];
    }
    return this.state.breadcrumb;
  }

  private updateTakeoffState(t: RawTelemetry): void {
    if (this.wasOnGround === true && t.onGround === false && this.takeoffAt == null) {
      this.takeoffAt = t.timestamp;
    }
    this.wasOnGround = t.onGround;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- aggregator`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/state
git commit -m "feat(state): aggregator with breadcrumb + flight timer"
```

---

## Task 11: State aggregator — progress fields (TDD)

**Files:**
- Modify: `server/src/state/aggregator.ts`, `server/src/state/aggregator.test.ts`

- [ ] **Step 1: Add failing tests to `server/src/state/aggregator.test.ts` (append)**

```typescript
import type { FlightPlan } from '@ff/shared';

const PLAN: FlightPlan = {
  fetchedAt: 0,
  origin: { icao: 'AAAA', lat: 0, lon: 0 },
  destination: { icao: 'BBBB', lat: 0, lon: 10 },
  waypoints: [
    { ident: 'W1', lat: 0, lon: 2 },
    { ident: 'W2', lat: 0, lon: 5 },
    { ident: 'W3', lat: 0, lon: 8 },
  ],
};

describe('Aggregator progress', () => {
  it('has null progress when no plan is set', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }));
    const s = a.getState();
    expect(s.progress.nextWaypoint).toBeNull();
    expect(s.progress.distanceToNextNm).toBeNull();
    expect(s.progress.distanceToDestNm).toBeNull();
  });

  it('picks the first unpassed waypoint when a plan is set', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }));
    const s = a.getState();
    expect(s.progress.nextWaypoint?.ident).toBe('W1');
    expect(s.progress.distanceToNextNm).toBeGreaterThan(0);
    expect(s.progress.distanceToDestNm).toBeGreaterThan(s.progress.distanceToNextNm ?? 0);
  });

  it('advances nextWaypoint after passing W1', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 2.001 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }));
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W2');
  });

  it('computes ETE using ground speed', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: false, speed: { ground: 600, indicated: 600, mach: 0.9 } }));
    const s = a.getState();
    expect(s.progress.eteToDestSec).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to see new tests fail**

Run: `npm --workspace server run test -- aggregator`
Expected: 9 pass (from Task 10), 4 fail (new progress tests).

- [ ] **Step 3: Extend `server/src/state/aggregator.ts`** — replace file contents with:

```typescript
import { EventEmitter } from 'node:events';
import type { FlightPlan, FlightProgress, FlightState, RawTelemetry } from '@ff/shared';
import { haversineNm } from '../route-math/distance.js';
import { advancePassedIndex, distanceToWaypointNm, eteSeconds } from '../route-math/progress.js';

const BREADCRUMB_INTERVAL_MS = 5000;
const HEADING_DELTA_DEG = 2;
const WAYPOINT_PASS_THRESHOLD_NM = 2;

const EMPTY_PROGRESS: FlightProgress = {
  nextWaypoint: null,
  distanceToNextNm: null,
  eteToNextSec: null,
  distanceToDestNm: null,
  eteToDestSec: null,
  flightTimeSec: null,
};

export class Aggregator extends EventEmitter {
  private state: FlightState = {
    connected: false,
    telemetry: null,
    plan: null,
    breadcrumb: [],
    progress: { ...EMPTY_PROGRESS },
  };
  private lastBreadcrumbAt = 0;
  private lastBreadcrumbHeading: number | null = null;
  private takeoffAt: number | null = null;
  private wasOnGround: boolean | null = null;
  private passedIndex = -1;

  setConnected(connected: boolean): void {
    if (this.state.connected === connected) return;
    this.state = { ...this.state, connected };
    this.emit('state', this.state);
  }

  setPlan(plan: FlightPlan): void {
    this.passedIndex = -1;
    this.state = { ...this.state, plan, progress: this.computeProgress(this.state.telemetry, plan) };
    this.emit('state', this.state);
    this.emit('plan', plan);
  }

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

  getState(): FlightState {
    return this.state;
  }

  private computeProgress(t: RawTelemetry | null, plan: FlightPlan | null): FlightProgress {
    const flightTimeSec =
      t == null || this.takeoffAt == null ? null : Math.max(0, (t.timestamp - this.takeoffAt) / 1000);
    if (t == null || plan == null) {
      return { ...EMPTY_PROGRESS, flightTimeSec };
    }
    this.passedIndex = advancePassedIndex(t.position, plan.waypoints, this.passedIndex, WAYPOINT_PASS_THRESHOLD_NM);
    const nextIdx = this.passedIndex + 1;
    const nextWp = plan.waypoints[nextIdx] ?? null;
    const distNext = nextWp ? distanceToWaypointNm(t.position, nextWp) : null;
    const distDest = haversineNm(t.position.lat, t.position.lon, plan.destination.lat, plan.destination.lon);
    const gs = t.speed.ground;
    return {
      nextWaypoint: nextWp,
      distanceToNextNm: distNext,
      eteToNextSec: distNext == null ? null : eteSeconds(distNext, gs),
      distanceToDestNm: distDest,
      eteToDestSec: eteSeconds(distDest, gs),
      flightTimeSec,
    };
  }

  private updateBreadcrumb(t: RawTelemetry): typeof this.state.breadcrumb {
    if (this.state.breadcrumb.length === 0) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [{ lat: t.position.lat, lon: t.position.lon }];
    }
    const elapsed = t.timestamp - this.lastBreadcrumbAt;
    const headingDelta =
      this.lastBreadcrumbHeading == null
        ? 0
        : Math.abs(((t.heading.magnetic - this.lastBreadcrumbHeading + 540) % 360) - 180);
    if (elapsed >= BREADCRUMB_INTERVAL_MS || headingDelta >= HEADING_DELTA_DEG) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [...this.state.breadcrumb, { lat: t.position.lat, lon: t.position.lon }];
    }
    return this.state.breadcrumb;
  }

  private updateTakeoffState(t: RawTelemetry): void {
    if (this.wasOnGround === true && t.onGround === false && this.takeoffAt == null) {
      this.takeoffAt = t.timestamp;
    }
    this.wasOnGround = t.onGround;
  }
}
```

- [ ] **Step 4: Run all aggregator tests**

Run: `npm --workspace server run test -- aggregator`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
git add server/src/state
git commit -m "feat(state): plan-aware progress (next waypoint, distances, ETE)"
```

---

## Task 12: sim-bridge — node-simconnect client

**Files:**
- Create: `server/src/sim-bridge/variables.ts`, `server/src/sim-bridge/client.ts`

Note: this module is integration code. It has no unit tests — validation happens via the replay harness (Task 17) and live with MSFS running.

- [ ] **Step 1: Create `server/src/sim-bridge/variables.ts`**

```typescript
import type { RawTelemetry } from '@ff/shared';

/**
 * SimVar subscription definitions. Each row:
 *   [simvar name, units, type]
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
] as const;

export function buildTelemetry(values: number[], timestamp: number): RawTelemetry {
  const [lat, lon, alt, gs, ias, mach, hdg, vs, windDir, windVel, onGround] = values as number[];
  return {
    timestamp,
    position: { lat: lat ?? 0, lon: lon ?? 0 },
    altitude: { msl: alt ?? 0 },
    speed: { ground: gs ?? 0, indicated: ias ?? 0, mach: mach ?? 0 },
    heading: { magnetic: hdg ?? 0 },
    verticalSpeed: vs ?? 0,
    wind: { direction: windDir ?? 0, speed: windVel ?? 0 },
    onGround: (onGround ?? 0) > 0.5,
  };
}
```

- [ ] **Step 2: Create `server/src/sim-bridge/client.ts`**

```typescript
import { EventEmitter } from 'node:events';
import {
  open,
  Protocol,
  SimConnectDataType,
  SimConnectPeriod,
  type RecvSimObjectData,
  type SimConnectConnection,
} from 'node-simconnect';
import type { RawTelemetry } from '@ff/shared';
import { SIM_VARS, buildTelemetry } from './variables.js';

const APP_NAME = 'flight-follower';
const DATA_DEF_ID = 0;
const REQUEST_ID = 0;
const USER_OBJECT = 0; // SIMCONNECT_OBJECT_ID_USER
const RECONNECT_DELAY_MS = 5000;

export class SimBridge extends EventEmitter {
  private handle: SimConnectConnection | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  async connect(): Promise<void> {
    this.stopped = false;
    try {
      const { handle } = await open(APP_NAME, Protocol.FSX_SP2);
      this.handle = handle;
      this.registerDefinitions(handle);
      handle.on('simObjectData', (msg: RecvSimObjectData) => this.onData(msg));
      handle.on('close', () => this.onClose());
      handle.on('exception', (ex) => this.emit('warning', { source: 'simconnect', message: String(ex.exception) }));
      handle.requestDataOnSimObject(
        REQUEST_ID,
        DATA_DEF_ID,
        USER_OBJECT,
        SimConnectPeriod.SIM_FRAME,
        0,
        0,
        30, // Every ~30 frames ~= 2 Hz at 60 fps
        0,
      );
      this.emit('open');
    } catch (err) {
      this.emit('warning', { source: 'simconnect', message: `connect failed: ${(err as Error).message}` });
      this.scheduleReconnect();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.handle?.close();
    this.handle = null;
  }

  private registerDefinitions(handle: SimConnectConnection): void {
    for (const [name, units] of SIM_VARS) {
      handle.addToDataDefinition(DATA_DEF_ID, name, units, SimConnectDataType.FLOAT64);
    }
  }

  private onData(msg: RecvSimObjectData): void {
    if (msg.requestID !== REQUEST_ID) return;
    const values: number[] = [];
    for (let i = 0; i < SIM_VARS.length; i++) {
      values.push(msg.data.readFloat64());
    }
    const telemetry: RawTelemetry = buildTelemetry(values, Date.now());
    this.emit('telemetry', telemetry);
  }

  private onClose(): void {
    this.handle = null;
    this.emit('close');
    if (!this.stopped) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_DELAY_MS);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors. If `node-simconnect` exports differ, adjust the import list using `npx tsc -p server --noEmit 2>&1 | head -30` and fix names against the library's published `dist/index.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add server/src/sim-bridge
git commit -m "feat(sim-bridge): SimConnect client with reconnect loop"
```

---

## Task 13: Transport — Fastify app + settings + Simbrief routes

**Files:**
- Create: `server/src/transport/schemas.ts`, `server/src/transport/http.ts`

- [ ] **Step 1: Create `server/src/transport/schemas.ts`**

```typescript
import { z } from 'zod';

export const SettingsBodySchema = z.object({
  simbriefUserId: z.string().nullable(),
});
```

- [ ] **Step 2: Create `server/src/transport/http.ts`**

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadSettings, saveSettings } from '../config/settings.js';
import { fetchLatestOfp, SimbriefError } from '../simbrief/client.js';
import type { Aggregator } from '../state/aggregator.js';
import { SettingsBodySchema } from './schemas.js';

export type HttpOptions = {
  aggregator: Aggregator;
  settingsPath: string;
  staticPath: string;
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

  app.post('/api/simbrief/fetch', async (_req, reply) => {
    const settings = loadSettings(opts.settingsPath);
    if (!settings.simbriefUserId) {
      reply.code(400);
      return { error: 'NO_USER_ID', message: 'Simbrief user ID not configured' };
    }
    try {
      const plan = await fetchLatestOfp(settings.simbriefUserId);
      opts.aggregator.setPlan(plan);
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/transport/schemas.ts server/src/transport/http.ts
git commit -m "feat(transport): Fastify app with settings and simbrief routes"
```

---

## Task 14: Transport — WebSocket broadcaster

**Files:**
- Create: `server/src/transport/ws.ts`

- [ ] **Step 1: Create `server/src/transport/ws.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import type { FlightPlan, WsMessage } from '@ff/shared';
import type { Aggregator } from '../state/aggregator.js';

const BROADCAST_INTERVAL_MS = 500; // 2 Hz

export function attachWsBroadcaster(app: FastifyInstance, aggregator: Aggregator): () => void {
  const wss = new WebSocketServer({ noServer: true });

  app.server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    send(ws, { type: 'state', payload: aggregator.getState() });
    const plan = aggregator.getState().plan;
    if (plan) send(ws, { type: 'plan', payload: plan });
  });

  const planHandler = (plan: FlightPlan) => {
    broadcast(wss, { type: 'plan', payload: plan });
  };
  aggregator.on('plan', planHandler);

  const timer = setInterval(() => {
    broadcast(wss, { type: 'state', payload: aggregator.getState() });
  }, BROADCAST_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    aggregator.off('plan', planHandler);
    wss.close();
  };
}

function send(ws: WebSocket, msg: WsMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(wss: WebSocketServer, msg: WsMessage): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/transport/ws.ts
git commit -m "feat(transport): WebSocket broadcast of flight state at 2 Hz"
```

---

## Task 15: Server entry — `start({ configPath, staticPath, port })`

**Files:**
- Modify: `server/src/index.ts`

Electron constraint: no hardcoded paths inside `start()`. Defaults are resolved in the CLI launcher below `start()`, not inside it.

- [ ] **Step 1: Replace `server/src/index.ts`** with:

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p server --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke-run (no MSFS, no web bundle yet)**

Run: `FF_STATIC_PATH=/tmp FF_CONFIG_PATH=/tmp/ff-settings.json npm --workspace server run start`
Expected: log lines "Server listening" on `0.0.0.0:4444`. Control-C to stop. (MSFS connection will fail and retry every 5 s — that's fine.)

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): Electron-ready start() entry + default CLI launcher"
```

---

## Task 16: dev-telemetry-replay CLI

**Files:**
- Create: `scripts/dev-telemetry-replay.ts`, `scripts/fixtures/replay-short.jsonl`

- [ ] **Step 1: Create a short replay fixture `scripts/fixtures/replay-short.jsonl`**

One RawTelemetry JSON object per line. Coordinates walk eastward from 0°E at ~200 kts.

```
{"timestamp":0,"position":{"lat":0,"lon":0},"altitude":{"msl":0},"speed":{"ground":0,"indicated":0,"mach":0},"heading":{"magnetic":90},"verticalSpeed":0,"wind":{"direction":0,"speed":0},"onGround":true}
{"timestamp":5000,"position":{"lat":0,"lon":0.05},"altitude":{"msl":500},"speed":{"ground":180,"indicated":160,"mach":0.25},"heading":{"magnetic":90},"verticalSpeed":1800,"wind":{"direction":10,"speed":15},"onGround":false}
{"timestamp":10000,"position":{"lat":0,"lon":0.15},"altitude":{"msl":3000},"speed":{"ground":220,"indicated":200,"mach":0.33},"heading":{"magnetic":90},"verticalSpeed":1500,"wind":{"direction":10,"speed":15},"onGround":false}
{"timestamp":15000,"position":{"lat":0,"lon":0.30},"altitude":{"msl":8000},"speed":{"ground":300,"indicated":250,"mach":0.45},"heading":{"magnetic":90},"verticalSpeed":1200,"wind":{"direction":20,"speed":20},"onGround":false}
{"timestamp":20000,"position":{"lat":0,"lon":0.50},"altitude":{"msl":15000},"speed":{"ground":400,"indicated":280,"mach":0.62},"heading":{"magnetic":88},"verticalSpeed":1000,"wind":{"direction":25,"speed":25},"onGround":false}
{"timestamp":25000,"position":{"lat":0,"lon":0.80},"altitude":{"msl":25000},"speed":{"ground":450,"indicated":290,"mach":0.75},"heading":{"magnetic":92},"verticalSpeed":800,"wind":{"direction":30,"speed":30},"onGround":false}
{"timestamp":30000,"position":{"lat":0,"lon":1.20},"altitude":{"msl":35000},"speed":{"ground":470,"indicated":280,"mach":0.79},"heading":{"magnetic":90},"verticalSpeed":0,"wind":{"direction":30,"speed":40},"onGround":false}
```

- [ ] **Step 2: Create `scripts/dev-telemetry-replay.ts`**

```typescript
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
```

- [ ] **Step 3: Smoke-run replay**

Run: `FF_STATIC_PATH=/tmp npm run dev:replay`
Expected: server listens on `0.0.0.0:4444`; log message "replay running". Open `ws://localhost:4444/ws` with any WS client and confirm `{"type":"state",...}` messages flow every 500 ms. Control-C to stop.

- [ ] **Step 4: Commit**

```bash
git add scripts
git commit -m "feat(scripts): dev-telemetry-replay for local dev without MSFS"
```

---

## Task 17: Frontend scaffold (Vite + React + deps)

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "@ff/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p . && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ff/shared": "*",
    "leaflet": "^1.9.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-leaflet": "^4.2.1",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.8",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.4.0",
    "vite": "^5.1.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "moduleResolution": "bundler",
    "module": "ESNext",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@ff/shared": ["../shared/types.ts"]
    }
  },
  "include": ["src", "../shared/types.ts"]
}
```

- [ ] **Step 3: Create `web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ff/shared': fileURLToPath(new URL('../shared/types.ts', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4444',
      '/ws': { target: 'ws://localhost:4444', ws: true },
    },
  },
});
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flight Follower</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      html, body, #root { height: 100%; margin: 0; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Create placeholder `web/src/App.tsx`**

```typescript
export function App() {
  return <div style={{ padding: 16 }}>Flight Follower — scaffold</div>;
}
```

- [ ] **Step 7: Install + build**

Run: `npm install && npm --workspace web run build`
Expected: builds into `web/dist/` with no errors.

- [ ] **Step 8: Commit**

```bash
git add web package-lock.json
git commit -m "chore(web): scaffold Vite + React + Leaflet"
```

---

## Task 18: Frontend Zustand stores

**Files:**
- Create: `web/src/store/flight.ts`, `web/src/store/view.ts`

- [ ] **Step 1: Create `web/src/store/flight.ts`**

```typescript
import { create } from 'zustand';
import type { FlightPlan, FlightState } from '@ff/shared';

const emptyState: FlightState = {
  connected: false,
  telemetry: null,
  plan: null,
  breadcrumb: [],
  progress: {
    nextWaypoint: null,
    distanceToNextNm: null,
    eteToNextSec: null,
    distanceToDestNm: null,
    eteToDestSec: null,
    flightTimeSec: null,
  },
};

type FlightStore = {
  state: FlightState;
  wsConnected: boolean;
  setFlightState: (s: FlightState) => void;
  setPlan: (p: FlightPlan) => void;
  setWsConnected: (v: boolean) => void;
};

export const useFlightStore = create<FlightStore>((set) => ({
  state: emptyState,
  wsConnected: false,
  setFlightState: (s) => set({ state: s }),
  setPlan: (p) => set((prev) => ({ state: { ...prev.state, plan: p } })),
  setWsConnected: (v) => set({ wsConnected: v }),
}));
```

- [ ] **Step 2: Create `web/src/store/view.ts`**

```typescript
import { create } from 'zustand';

export type ViewMode = 'overview' | 'follow' | 'manual';

type ViewStore = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
};

export const useViewStore = create<ViewStore>((set) => ({
  mode: 'overview',
  setMode: (m) => set({ mode: m }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add web/src/store
git commit -m "feat(web): Zustand stores for flight state and view mode"
```

---

## Task 19: Frontend WebSocket client

**Files:**
- Create: `web/src/api/ws.ts`

- [ ] **Step 1: Create `web/src/api/ws.ts`**

```typescript
import type { WsMessage } from '@ff/shared';
import { useFlightStore } from '../store/flight.js';
import { useViewStore } from '../store/view.js';

const MAX_BACKOFF_MS = 10_000;

export function connectWebSocket(): () => void {
  let backoff = 1000;
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let stopped = false;

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      backoff = 1000;
      useFlightStore.getState().setWsConnected(true);
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as WsMessage;
      const store = useFlightStore.getState();
      if (msg.type === 'state') {
        store.setFlightState(msg.payload);
      } else if (msg.type === 'plan') {
        store.setPlan(msg.payload);
        // Spec §10: Overview is the default view mode on plan import.
        useViewStore.getState().setMode('overview');
      } else if (msg.type === 'error') {
        console.warn('[ws error]', msg.payload);
      }
    };

    ws.onclose = () => {
      useFlightStore.getState().setWsConnected(false);
      if (stopped) return;
      reconnectTimer = window.setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };

    ws.onerror = () => ws?.close();
  };

  open();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api/ws.ts
git commit -m "feat(web): WebSocket client with exponential backoff reconnect"
```

---

## Task 20: Frontend REST client

**Files:**
- Create: `web/src/api/rest.ts`

- [ ] **Step 1: Create `web/src/api/rest.ts`**

```typescript
import type { FlightPlan, Settings } from '@ff/shared';

export async function getSettings(): Promise<Settings> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
  return (await res.json()) as Settings;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`POST /api/settings ${res.status}`);
  return (await res.json()) as Settings;
}

export async function fetchSimbriefPlan(): Promise<FlightPlan> {
  const res = await fetch('/api/simbrief/fetch', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) {
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return body as FlightPlan;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api/rest.ts
git commit -m "feat(web): REST client for settings and simbrief fetch"
```

---

## Task 21: Map core + AircraftMarker + BreadcrumbTrail

**Files:**
- Create: `web/src/components/Map/Map.tsx`, `web/src/components/Map/AircraftMarker.tsx`, `web/src/components/Map/BreadcrumbTrail.tsx`

- [ ] **Step 1: Create `web/src/components/Map/AircraftMarker.tsx`**

```typescript
import { divIcon } from 'leaflet';
import { Marker } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

export function AircraftMarker() {
  const t = useFlightStore((s) => s.state.telemetry);
  if (!t) return null;
  const heading = t.heading.magnetic;
  const icon = divIcon({
    className: 'ff-aircraft',
    html: `<div style="transform: rotate(${heading}deg); width:24px; height:24px; font-size:24px; line-height:24px; text-align:center;">✈</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  return <Marker position={[t.position.lat, t.position.lon]} icon={icon} interactive={false} />;
}
```

- [ ] **Step 2: Create `web/src/components/Map/BreadcrumbTrail.tsx`**

```typescript
import { Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;
  const positions: [number, number][] = crumbs.map((c) => [c.lat, c.lon]);
  return <Polyline positions={positions} pathOptions={{ color: '#f59e0b', weight: 3 }} />;
}
```

- [ ] **Step 3: Create `web/src/components/Map/Map.tsx`**

```typescript
import { MapContainer, TileLayer } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';

export function Map() {
  return (
    <MapContainer
      center={[40, 0]}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BreadcrumbTrail />
      <AircraftMarker />
    </MapContainer>
  );
}
```

- [ ] **Step 4: Wire Map into `web/src/App.tsx`** — replace contents:

```typescript
import { useEffect } from 'react';
import { Map } from './components/Map/Map.js';
import { connectWebSocket } from './api/ws.js';

export function App() {
  useEffect(() => connectWebSocket(), []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100vh' }}>
      <Map />
      <aside style={{ borderLeft: '1px solid #ddd', padding: 12 }}>Panel (coming soon)</aside>
    </div>
  );
}
```

- [ ] **Step 5: Manual verify**

Run in two terminals:
- Terminal A: `FF_STATIC_PATH=/tmp npm run dev:replay`
- Terminal B: `npm --workspace web run dev` — opens Vite on `:5173` with `/api` + `/ws` proxied to `:4444`

Open `http://localhost:5173` in a browser. Expected: OSM tiles render; aircraft icon appears near 0°N 0°E and moves eastward; breadcrumb line extends behind it.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): map with aircraft marker and breadcrumb"
```

---

## Task 22: PlannedRoute component

**Files:**
- Create: `web/src/components/Map/PlannedRoute.tsx`
- Modify: `web/src/components/Map/Map.tsx`

- [ ] **Step 1: Create `web/src/components/Map/PlannedRoute.tsx`**

```typescript
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

export function PlannedRoute() {
  const plan = useFlightStore((s) => s.state.plan);
  if (!plan) return null;

  const all = [
    [plan.origin.lat, plan.origin.lon] as [number, number],
    ...plan.waypoints.map((w) => [w.lat, w.lon] as [number, number]),
    [plan.destination.lat, plan.destination.lon] as [number, number],
  ];

  return (
    <>
      <Polyline positions={all} pathOptions={{ color: '#a855f7', weight: 2, dashArray: '6 4' }} />
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
      <CircleMarker center={[plan.origin.lat, plan.origin.lon]} radius={6} pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>{plan.origin.icao}</Tooltip>
      </CircleMarker>
      <CircleMarker center={[plan.destination.lat, plan.destination.lon]} radius={6} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>{plan.destination.icao}</Tooltip>
      </CircleMarker>
    </>
  );
}
```

- [ ] **Step 2: Add `<PlannedRoute />` to `web/src/components/Map/Map.tsx`** — update render block to include it between the TileLayer and BreadcrumbTrail:

```typescript
import { MapContainer, TileLayer } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';
import { PlannedRoute } from './PlannedRoute.js';

export function Map() {
  return (
    <MapContainer center={[40, 0]} zoom={4} style={{ height: '100%', width: '100%' }} worldCopyJump>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <PlannedRoute />
      <BreadcrumbTrail />
      <AircraftMarker />
    </MapContainer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Map
git commit -m "feat(web): planned route polyline with waypoint markers"
```

---

## Task 23: ViewModeControl + map view behavior

**Files:**
- Create: `web/src/components/Map/ViewModeControl.tsx`, `web/src/components/Map/MapController.tsx`
- Modify: `web/src/components/Map/Map.tsx`

- [ ] **Step 1: Create `web/src/components/Map/MapController.tsx`** — handles mode side effects:

```typescript
import { useEffect, useRef } from 'react';
import { LatLngBounds, latLng } from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { useViewStore } from '../../store/view.js';

export function MapController() {
  const map = useMap();
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  const telemetry = useFlightStore((s) => s.state.telemetry);
  const plan = useFlightStore((s) => s.state.plan);
  const hasOverviewFitted = useRef(false);
  const programmatic = useRef(false);

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

  // Fit to origin+destination on plan load or explicit overview.
  useEffect(() => {
    if (mode !== 'overview' || !plan) return;
    const bounds = new LatLngBounds(
      latLng(plan.origin.lat, plan.origin.lon),
      latLng(plan.destination.lat, plan.destination.lon),
    );
    programmatic.current = true;
    map.fitBounds(bounds, { padding: [40, 40] });
    programmatic.current = false;
    hasOverviewFitted.current = true;
  }, [mode, plan, map]);

  // Center on aircraft in follow mode.
  useEffect(() => {
    if (mode !== 'follow' || !telemetry) return;
    programmatic.current = true;
    map.panTo([telemetry.position.lat, telemetry.position.lon], { animate: true });
    programmatic.current = false;
  }, [mode, telemetry, map]);

  return null;
}
```

- [ ] **Step 2: Create `web/src/components/Map/ViewModeControl.tsx`**

```typescript
import { useViewStore, type ViewMode } from '../../store/view.js';

const MODES: ViewMode[] = ['overview', 'follow', 'manual'];

export function ViewModeControl() {
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, background: 'white', borderRadius: 6, boxShadow: '0 1px 3px rgba(0,0,0,.15)', padding: 4, display: 'flex', gap: 4 }}>
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '4px 10px',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            background: mode === m ? '#2563eb' : 'transparent',
            color: mode === m ? 'white' : '#111',
            textTransform: 'capitalize',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add to `web/src/components/Map/Map.tsx`** — final version:

```typescript
import { MapContainer, TileLayer } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';
import { MapController } from './MapController.js';
import { PlannedRoute } from './PlannedRoute.js';
import { ViewModeControl } from './ViewModeControl.js';

export function Map() {
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={[40, 0]} zoom={4} style={{ height: '100%', width: '100%' }} worldCopyJump>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PlannedRoute />
        <BreadcrumbTrail />
        <AircraftMarker />
        <MapController />
      </MapContainer>
      <ViewModeControl />
    </div>
  );
}
```

- [ ] **Step 4: Manual verify**

With `npm run dev:replay` + `npm --workspace web run dev` running:
- Default mode is "overview" — but since no plan is loaded, nothing fits yet. Click "Follow": map should pan to aircraft every tick. Drag the map: mode switches to "Manual"; map stops auto-panning. Click "Follow" again: pans resume.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Map
git commit -m "feat(web): overview/follow/manual view modes"
```

---

## Task 24: DataPanel cards

**Files:**
- Create: `web/src/components/DataPanel/DataPanel.tsx`, plus `PositionCard.tsx`, `SpeedCard.tsx`, `AltitudeCard.tsx`, `WindCard.tsx`, `TimeCard.tsx`, `RouteCard.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create shared `fmt` helper inline in each card OR a helper file — use `web/src/components/DataPanel/fmt.ts`**

```typescript
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

export function fmtLatLon(v: number | null | undefined): string {
  return v == null ? dash : v.toFixed(4);
}
```

- [ ] **Step 2: Create `web/src/components/DataPanel/PositionCard.tsx`**

```typescript
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

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}>
      <h3 style={{ margin: 0, fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</h3>
      <div style={{ marginTop: 4, fontSize: 14 }}>{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create the remaining cards — `SpeedCard.tsx`**

```typescript
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';

export function SpeedCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Speed">
      <Row label="GS">{t ? `${fmtNum(t.speed.ground, 0)} kt` : dash}</Row>
      <Row label="IAS">{t ? `${fmtNum(t.speed.indicated, 0)} kt` : dash}</Row>
      <Row label="Mach">{t ? fmtNum(t.speed.mach, 2) : dash}</Row>
    </Card>
  );
}
```

- [ ] **Step 4: Create `AltitudeCard.tsx`**

```typescript
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';

export function AltitudeCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Altitude">
      <Row label="MSL">{t ? `${fmtNum(t.altitude.msl, 0)} ft` : dash}</Row>
      <Row label="V/S">{t ? `${fmtNum(t.verticalSpeed, 0)} fpm` : dash}</Row>
      <Row label="HDG">{t ? `${fmtNum(t.heading.magnetic, 0)}°` : dash}</Row>
    </Card>
  );
}
```

- [ ] **Step 5: Create `WindCard.tsx`**

```typescript
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';

export function WindCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Wind">
      <Row label="Dir">{t ? `${fmtNum(t.wind.direction, 0)}°` : dash}</Row>
      <Row label="Speed">{t ? `${fmtNum(t.wind.speed, 0)} kt` : dash}</Row>
    </Card>
  );
}
```

- [ ] **Step 6: Create `TimeCard.tsx`**

```typescript
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtDurationSec } from './fmt.js';

export function TimeCard() {
  const ft = useFlightStore((s) => s.state.progress.flightTimeSec);
  return (
    <Card title="Time">
      <Row label="Elapsed">{fmtDurationSec(ft)}</Row>
    </Card>
  );
}
```

- [ ] **Step 7: Create `RouteCard.tsx`**

```typescript
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, fmtDurationSec, dash } from './fmt.js';

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
      <Row label="Next WP">{p.nextWaypoint?.ident ?? dash}</Row>
      <Row label="Dist. to next">{p.distanceToNextNm != null ? `${fmtNum(p.distanceToNextNm, 1)} nm` : dash}</Row>
      <Row label="ETE next">{fmtDurationSec(p.eteToNextSec)}</Row>
      <Row label="Dist. to dest">{p.distanceToDestNm != null ? `${fmtNum(p.distanceToDestNm, 0)} nm` : dash}</Row>
      <Row label="ETE dest">{fmtDurationSec(p.eteToDestSec)}</Row>
    </Card>
  );
}
```

- [ ] **Step 8: Create `DataPanel.tsx`**

```typescript
import { AltitudeCard } from './AltitudeCard.js';
import { PositionCard } from './PositionCard.js';
import { RouteCard } from './RouteCard.js';
import { SpeedCard } from './SpeedCard.js';
import { TimeCard } from './TimeCard.js';
import { WindCard } from './WindCard.js';

export function DataPanel() {
  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: 12 }}>
      <PositionCard />
      <SpeedCard />
      <AltitudeCard />
      <WindCard />
      <TimeCard />
      <RouteCard />
    </div>
  );
}
```

- [ ] **Step 9: Update `web/src/App.tsx`** to use DataPanel:

```typescript
import { useEffect } from 'react';
import { Map } from './components/Map/Map.js';
import { DataPanel } from './components/DataPanel/DataPanel.js';
import { connectWebSocket } from './api/ws.js';

export function App() {
  useEffect(() => connectWebSocket(), []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100vh' }}>
      <Map />
      <aside style={{ borderLeft: '1px solid #e5e7eb' }}>
        <DataPanel />
      </aside>
    </div>
  );
}
```

- [ ] **Step 10: Manual verify**

With both dev servers running, confirm panel shows live values that update every 500 ms. Route card shows "Import a plan…" since no plan has been imported.

- [ ] **Step 11: Commit**

```bash
git add web/src
git commit -m "feat(web): DataPanel with all v0.1.0 cards"
```

---

## Task 25: ConnectionStatus + SettingsDialog

**Files:**
- Create: `web/src/components/ConnectionStatus.tsx`, `web/src/components/SettingsDialog.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/components/ConnectionStatus.tsx`**

```typescript
import { useFlightStore } from '../store/flight.js';

export function ConnectionStatus() {
  const simConnected = useFlightStore((s) => s.state.connected);
  const wsConnected = useFlightStore((s) => s.wsConnected);

  const wsText = wsConnected ? 'WS connected' : 'Reconnecting…';
  const simText = simConnected ? 'Sim connected' : 'Sim disconnected';
  const simColor = simConnected ? '#059669' : '#dc2626';
  const wsColor = wsConnected ? '#059669' : '#f59e0b';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
      <Dot color={simColor} /> {simText}
      <Dot color={wsColor} /> {wsText}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color }} />;
}
```

- [ ] **Step 2: Create `web/src/components/SettingsDialog.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { fetchSimbriefPlan, getSettings, saveSettings } from '../api/rest.js';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setUserId(s.simbriefUserId ?? ''));
  }, []);

  async function onSave() {
    setBusy(true);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      setStatus('Saved.');
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFetch() {
    setBusy(true);
    setStatus(null);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      await fetchSimbriefPlan();
      setStatus('Plan fetched.');
    } catch (err) {
      setStatus(`Fetch failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={dialog}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Simbrief user ID</div>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} style={input} />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onSave} disabled={busy} style={btn}>Save</button>
          <button onClick={onFetch} disabled={busy || !userId.trim()} style={{ ...btn, background: '#2563eb', color: 'white' }}>
            Fetch latest plan
          </button>
          <button onClick={onClose} style={btn}>Close</button>
        </div>
        {status && <p style={{ marginTop: 12, color: status.startsWith('Save') || status === 'Plan fetched.' ? '#059669' : '#dc2626' }}>{status}</p>}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center', zIndex: 2000,
};
const dialog: React.CSSProperties = {
  background: 'white', padding: 20, borderRadius: 8, minWidth: 360, boxShadow: '0 10px 30px rgba(0,0,0,.2)',
};
const input: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14,
};
const btn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer',
};
```

- [ ] **Step 3: Update `web/src/App.tsx`** — add header with status + settings button:

```typescript
import { useEffect, useState } from 'react';
import { Map } from './components/Map/Map.js';
import { DataPanel } from './components/DataPanel/DataPanel.js';
import { ConnectionStatus } from './components/ConnectionStatus.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { connectWebSocket } from './api/ws.js';

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => connectWebSocket(), []);
  return (
    <div style={{ display: 'grid', gridTemplateRows: '40px 1fr', height: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
        <strong style={{ fontSize: 14 }}>Flight Follower</strong>
        <ConnectionStatus />
        <button onClick={() => setShowSettings(true)} style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: 'white', cursor: 'pointer' }}>
          Settings
        </button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: 0 }}>
        <Map />
        <aside style={{ borderLeft: '1px solid #e5e7eb', minHeight: 0 }}>
          <DataPanel />
        </aside>
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: Manual verify**

With replay running: header shows green "Sim connected" (we call `setConnected(true)` in the replay script) and green "WS connected". Open Settings, enter any string into user ID, click Save — see "Saved.". "Fetch latest plan" will fail with Simbrief unless you enter a real user ID — expected failure message shows.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): connection status and settings dialog"
```

---

## Task 26: End-to-end smoke with replay + real Simbrief

**Files:** no new files.

- [ ] **Step 1: Full-stack smoke with replay**

Run:
- Terminal A: `FF_STATIC_PATH=/tmp npm run dev:replay`
- Terminal B: `npm --workspace web run dev`

Open `http://localhost:5173`. Expected (all together):
- Header: green sim + WS indicators.
- Map: aircraft icon moving eastward from 0°E; rotated to ~90°.
- Breadcrumb trail extends behind the aircraft.
- DataPanel: values update every 500 ms; flight timer starts after first onGround→airborne transition.
- Click Follow: map auto-centers on aircraft.
- Drag map: mode flips to Manual; map stays put.

- [ ] **Step 2: Simbrief integration test (requires a valid Simbrief user ID)**

Stop the replay (it runs `disableSim: true`; Simbrief fetch calls the server but doesn't need the sim). With `npm --workspace server run start` on Terminal A and `npm --workspace web run dev` on Terminal B:
- Open Settings, enter your Simbrief pilot ID, click **Save**, then **Fetch latest plan**.
- Expected: status becomes "Plan fetched."; map draws dashed purple polyline from origin ICAO through waypoints to destination ICAO; Route card in DataPanel populates next-waypoint info.

If you don't have a dispatched Simbrief plan right now, skip this step; the parser is unit-tested already.

- [ ] **Step 3: Production build smoke**

Run: `npm run build`
Expected: `web/dist/` is populated. Then run the server pointed at the built assets:

```bash
FF_STATIC_PATH="$(pwd)/web/dist" FF_CONFIG_PATH="$(pwd)/server/.data/settings.json" FF_PORT=4444 npm --workspace server run start
```

Open `http://localhost:4444` (no Vite dev server). Expected: same UI, served by Node. Confirm another device on your LAN can load `http://<your-ip>:4444`.

- [ ] **Step 4: Final commit (if any doc tweaks)**

If nothing changed, skip. Otherwise:

```bash
git commit -am "docs: smoke-test notes"
```

---

## Post-implementation checklist

- [ ] `npm test` passes (server unit tests).
- [ ] `npm run typecheck` passes (both workspaces).
- [ ] `npm run build` succeeds.
- [ ] Replay harness produces a moving aircraft + breadcrumb in the browser.
- [ ] Simbrief import (with real ID) draws the planned route.
- [ ] View mode toggling (Overview / Follow / Manual) behaves as specified in §10 of the spec.
- [ ] Opening from another device on the LAN works.

---

## Notes on Electron future-proofing

The design constraints from §12 of the spec are already honored in this plan:

- `start({ configPath, staticPath, port })` takes paths as explicit inputs (Task 15). The CLI launcher that resolves defaults is separate from `start()` itself — an Electron main process would call `start()` directly with `app.getPath('userData')` for `configPath` and a `path.join(__dirname, 'dist-web')` for `staticPath`.
- No hardcoded `process.cwd()` usage anywhere in the server.
- `node-simconnect` is pure TypeScript — no native addons needing Electron rebuild.

When you're ready to package, the wrapper is ~50 lines of Electron main-process code plus `electron-builder` config.
