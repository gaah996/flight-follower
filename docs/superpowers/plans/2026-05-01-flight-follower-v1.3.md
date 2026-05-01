# Flight Follower v1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the flight-progress release: breadcrumb altitude gradient, plan-driven TOC/TOD markers and Clock countdown, manual skip-waypoint with auto-resync, origin → destination progress timeline, live ETA, alternate on map, FlightPlanCard glyph progress overlay, plus the bug-fix pass on the surfaces those features touch (FlightPlanCard collapse/wrap, map mode promotion, true-vs-magnetic for the map plane icon, altitude SimVar correctness, TRK row, min-zoom, light-mode tooltip, times vocabulary).

**Architecture:** Most work lives in the frontend. The server gains a small pure module (`route-math/cruise-points.ts`) and minor extensions to the aggregator, Simbrief parser, and sim-bridge. Shared types add `heading.true`, `track`, optional `altitude.indicated`, a `BreadcrumbSample` shape, four `FlightProgress` fields, an optional `FlightPlan.blockTimeSec`, and conditionally `Waypoint.altConstraint`/`speedConstraint` if the spike succeeds. Skip-waypoint state lives in a new FE store; an `activeWaypoint` selector falls through to server-derived values when no override is set.

**Tech Stack:** Same as v1.2 — TypeScript end-to-end, Node 20 + Fastify + node-simconnect + Zod + Vitest on the server; Vite + React 19 + react-leaflet + Zustand + HeroUI + Tailwind v4 on the web.

**Spec:** [`docs/superpowers/specs/2026-05-01-flight-follower-v1.3-design.md`](../specs/2026-05-01-flight-follower-v1.3-design.md)

**Branch:** Implementation runs on a new feature branch: `feat/v1.3-implementation`. Create it as the first action before Task 1.

```bash
git checkout -b feat/v1.3-implementation
```

---

## File Structure

### New files
- `server/src/route-math/cruise-points.ts` — pure functions `findTOC` / `findTOD`. Name match primary, altitude scan fallback.
- `server/src/route-math/cruise-points.test.ts` — unit tests for both paths.
- `web/src/lib/altitudePalette.ts` — shared palette mapping function and stops.
- `web/src/lib/activeWaypoint.ts` — selector that resolves the active "next" waypoint from server state + optional FE override.
- `web/src/components/Map/CruisePoints.tsx` — TOC/TOD map markers.
- `web/src/components/DataPanel/ProgressBar.tsx` — origin → destination timeline bar with TOC / current / TOD ticks.
- `docs/notes/times-vocabulary.md` — block / flight / ETE / ETA conventions.
- `docs/notes/altitude-vocabulary.md` — indicated vs MSL, where each is used.

### Modified files (shared)
- `shared/types.ts` — type extensions (heading shape, track, altitude.indicated, BreadcrumbSample, FlightProgress TOC/TOD, FlightPlan.blockTimeSec, optional Waypoint constraints).

### Modified files (server)
- `server/src/sim-bridge/variables.ts` — three new SimVars: `PLANE HEADING DEGREES TRUE`, `GPS GROUND TRUE TRACK`, `INDICATED ALTITUDE`.
- `server/src/state/aggregator.ts` — breadcrumb samples carry altitude; compute `tocPosition` / `todPosition` / `eteToTocSec` / `eteToTodSec`.
- `server/src/state/aggregator.test.ts` — extend tests for new shapes and TOC/TOD math.
- `server/src/simbrief/parser.ts` — extract `blockTimeSec`; conditionally extract waypoint constraints if spike succeeds.
- `server/src/simbrief/parser.test.ts` — assertions for the new extractions and absence cases.
- `server/src/simbrief/fixtures/minimal-ofp.json` — extend with named TOC/TOD fixes, block time field, and (if spike succeeds) constraint fields.

### Modified files (web)
- `web/src/store/flight.ts` — add `manualNextIndex` to the FE state with setters; auto-reset on `plan.fetchedAt` change.
- `web/src/components/Map/AircraftMarker.tsx` — rotation reads `heading.true`.
- `web/src/components/Map/BreadcrumbTrail.tsx` — per-segment polylines colored via the palette.
- `web/src/components/Map/Map.tsx` — `minZoom={3}` on `<MapContainer>`; mount `<CruisePoints />`.
- `web/src/components/Map/MapController.tsx` — promote to Manual on `zoomstart` user gestures (in addition to existing `dragstart`).
- `web/src/components/Map/PlannedRoute.tsx` — filter `TOC` / `TOD` idents from waypoint list; render alternate marker (blue) with hover-only tooltip.
- `web/src/components/Map/ViewModeControl.tsx` — guard `setMode` when the click target equals the current mode.
- `web/src/components/DataPanel/TripCard.tsx` — skip-waypoint arrows on the "Next:" line + auto link; ProgressBar; ETA `(live)` vs `(sched)` label.
- `web/src/components/DataPanel/ClockCard.tsx` — use `progress.eteToTocSec` / `eteToTodSec` when present, fall back to legacy estimator otherwise.
- `web/src/components/DataPanel/FlightPlanCard.tsx` — collapsed-view two-line clamp; expanded-view word-break fix; use `plan.blockTimeSec` directly; glyph progress overlay.
- `web/src/components/DataPanel/PositionCard.tsx` — add TRK row; HDG row keeps reading `heading.magnetic`.
- `web/src/components/DataPanel/MotionCard.tsx` — Alt row reads `altitude.indicated ?? altitude.msl`.
- `web/src/components/DataPanel/WindCompass.tsx` — confirm `heading.magnetic` stays (no functional change).
- `web/src/index.css` — add `--ff-alternate` token in both themes; reduce light-mode tooltip transparency.

### Modified files (docs)
- `README.md` — under "Features", note the v1.3 additions (breadcrumb gradient, TOC/TOD markers, progress timeline, skip-waypoint, alternate, live ETA).
- `docs/backlog.md` — mark v1.3 items as completed-from-backlog when the release ships (final task).

---

## Verification commands (used throughout)

- Server tests: `npm test`
- Server typecheck: `npx tsc -p server --noEmit`
- Web typecheck: `npx tsc -p web --noEmit`
- Production build: `npm run build`
- Replay manual verification: `npm run dev:replay -- scripts/fixtures/replay-eddb-lipz.jsonl` (or `replay-nzqn-nzwn.jsonl`) plus `npm --workspace web run dev`, then visit `http://localhost:5173`.

---

## Milestone 1 — Server foundations (Tasks 1–4)

Pure logic and types. No I/O changes yet. Independent of frontend work.

---

## Task 1: Spike — Simbrief waypoint constraint availability

**Files:**
- Read-only: live Simbrief OFP for any flight with a published SID/STAR (e.g. EDDB → LIPZ generated in Simbrief).
- Write: `docs/notes/spike-waypoint-constraints.md` (new — short note recording the decision).

This task is exploratory and gates whether constraint extraction lands in Task 4 and constraint rendering lands later. The decision rule is in spec § 6.

- [ ] **Step 1: Generate or retrieve a Simbrief OFP**

If you don't have a current OFP handy, generate one in Simbrief for any flight with a busy SID or STAR (e.g. KLAX departure, EHAM arrival, anything Class B). Use the **JSON** export. Save the JSON locally (don't commit it — fixtures stay synthetic).

- [ ] **Step 2: Inspect the navlog for per-fix constraint fields**

Run:

```bash
jq '.navlog.fix[0] | keys' /path/to/your-ofp.json
jq '.navlog.fix | map(keys) | unique[]' /path/to/your-ofp.json
```

Look for fields with names like `altitude_constraint`, `speed_constraint`, `alt_min`, `alt_max`, `mach_max`, `ias_max`. Note the **shape** — strings, objects, present-on-some-fixes-only, etc.

- [ ] **Step 3: Decide and document**

Create `docs/notes/spike-waypoint-constraints.md`:

```markdown
# Spike — Simbrief waypoint constraints (2026-05-01)

## Question
Does Simbrief's OFP expose hard waypoint constraints cleanly per-fix in the navlog?

## Result
[CLEAN / NOT CLEAN]

## Evidence
[paste the relevant key list and a sample fix object]

## Decision
- [If CLEAN]: Extract `altConstraint` / `speedConstraint` in v1.3 (Task 4 + later rendering).
- [If NOT CLEAN]: Defer to v1.4. Skip the constraint-related sub-steps in Task 4 and skip the (later, conditional) rendering work.
```

- [ ] **Step 4: Commit the note**

```bash
git add docs/notes/spike-waypoint-constraints.md
git commit -m "docs: spike — Simbrief waypoint constraint availability

Outcome: [CLEAN | NOT CLEAN]. [One-line evidence summary.]
Decision recorded; gates v1.3 Task 4 sub-steps."
```

---

## Task 2: Extend `shared/types.ts`

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add `BreadcrumbSample` and update `FlightState`**

Replace `shared/types.ts` with:

```ts
export type LatLon = { lat: number; lon: number };

export type RawTelemetry = {
  timestamp: number;
  position: LatLon;
  altitude: { msl: number; indicated?: number };
  speed: { ground: number; indicated: number; mach: number };
  heading: { magnetic: number; true: number };
  track: { true: number };
  verticalSpeed: number;
  wind: { direction: number; speed: number };
  onGround: boolean;
  simTimeUtc?: number;
};

export type Waypoint = {
  ident: string;
  lat: number;
  lon: number;
  plannedAltitude?: number;
  altConstraint?: { type: 'at' | 'at-or-above' | 'at-or-below'; ft: number };
  speedConstraint?: { type: 'at-or-below'; kt: number };
};

export type Airport = {
  icao: string;
  lat: number;
  lon: number;
  name?: string;
};

export type FlightPlan = {
  fetchedAt: number;
  origin: Airport;
  destination: Airport;
  waypoints: Waypoint[];
  alternate?: Airport;
  scheduledOut?: number;
  scheduledIn?: number;
  flightNumber?: string;
  aircraftType?: string;
  cruiseAltitudeFt?: number;
  totalDistanceNm?: number;
  routeString?: string;
  blockTimeSec?: number;
};

export type FlightProgress = {
  nextWaypoint: Waypoint | null;
  distanceToNextNm: number | null;
  eteToNextSec: number | null;
  distanceToDestNm: number | null;
  eteToDestSec: number | null;
  flightTimeSec: number | null;
  tocPosition: LatLon | null;
  todPosition: LatLon | null;
  eteToTocSec: number | null;
  eteToTodSec: number | null;
};

export type BreadcrumbSample = { lat: number; lon: number; altMsl: number };

export type FlightState = {
  connected: boolean;
  telemetry: RawTelemetry | null;
  plan: FlightPlan | null;
  breadcrumb: BreadcrumbSample[];
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

- [ ] **Step 2: Run typechecks (expect breakage)**

Run:

```bash
npx tsc -p server --noEmit
npx tsc -p web --noEmit
```

Expected: a list of errors in `aggregator.ts`, `aggregator.test.ts`, `parser.ts`, `variables.ts`, `BreadcrumbTrail.tsx`, `AircraftMarker.tsx`, `WindCompass.tsx`, `PositionCard.tsx` etc. — every consumer of the changed shapes. This is expected. Subsequent tasks resolve them.

- [ ] **Step 3: Commit the type changes**

```bash
git add shared/types.ts
git commit -m "feat(shared): extend types for v1.3

- BreadcrumbSample shape with altitude on each crumb
- RawTelemetry: heading.true, track.true, optional altitude.indicated
- FlightProgress: tocPosition, todPosition, eteToTocSec, eteToTodSec
- FlightPlan: optional blockTimeSec
- Waypoint: optional altConstraint, speedConstraint (used iff Task 1 spike succeeded)

Subsequent tasks fix the resulting compile errors."
```

---

## Task 3: TOC / TOD detection module

**Files:**
- Create: `server/src/route-math/cruise-points.ts`
- Create: `server/src/route-math/cruise-points.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/route-math/cruise-points.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Waypoint } from '@ff/shared';
import { findTOC, findTOD } from './cruise-points.js';

const wp = (ident: string, plannedAltitude?: number): Waypoint => ({
  ident,
  lat: 0,
  lon: 0,
  plannedAltitude,
});

describe('findTOC — name match (primary)', () => {
  it('returns the position of the waypoint with ident "TOC"', () => {
    const wps: Waypoint[] = [
      { ident: 'A', lat: 1, lon: 1 },
      { ident: 'TOC', lat: 5, lon: 5 },
      { ident: 'B', lat: 9, lon: 9 },
    ];
    expect(findTOC(wps)).toEqual({ lat: 5, lon: 5 });
  });
});

describe('findTOD — name match (primary)', () => {
  it('returns the position of the waypoint with ident "TOD"', () => {
    const wps: Waypoint[] = [
      { ident: 'A', lat: 1, lon: 1 },
      { ident: 'TOD', lat: 7, lon: 7 },
      { ident: 'B', lat: 9, lon: 9 },
    ];
    expect(findTOD(wps)).toEqual({ lat: 7, lon: 7 });
  });
});

describe('findTOC — altitude scan fallback', () => {
  it('returns the first waypoint at the given cruise altitude', () => {
    const wps: Waypoint[] = [
      wp('A', 5000),
      wp('B', 18000),
      wp('C', 36000),
      wp('D', 36000),
    ];
    wps[0].lat = 0; wps[1].lat = 1; wps[2].lat = 2; wps[3].lat = 3;
    expect(findTOC(wps, 36000)).toEqual({ lat: 2, lon: 0 });
  });

  it('uses the highest plannedAltitude when no cruise altitude is provided', () => {
    const wps: Waypoint[] = [
      wp('A', 5000),
      wp('B', 18000),
      wp('C', 36000),
      wp('D', 36000),
    ];
    wps[2].lat = 2;
    expect(findTOC(wps)).toEqual({ lat: 2, lon: 0 });
  });

  it('handles stepped climbs by returning the first waypoint at cruise', () => {
    const wps: Waypoint[] = [
      wp('A', 8000),
      wp('B', 24000),
      wp('C', 36000),
      wp('D', 36000),
    ];
    wps[2].lat = 2;
    expect(findTOC(wps, 36000)).toEqual({ lat: 2, lon: 0 });
  });
});

describe('findTOD — altitude scan fallback', () => {
  it('returns the last waypoint at cruise altitude before descent', () => {
    const wps: Waypoint[] = [
      wp('A', 5000),
      wp('B', 36000),
      wp('C', 36000),
      wp('D', 18000),
      wp('E', 5000),
    ];
    wps[2].lat = 2;
    expect(findTOD(wps, 36000)).toEqual({ lat: 2, lon: 0 });
  });
});

describe('null cases', () => {
  it('findTOC returns null when no plannedAltitude data and no name match', () => {
    const wps: Waypoint[] = [wp('A'), wp('B'), wp('C')];
    expect(findTOC(wps, 36000)).toBeNull();
  });

  it('findTOD returns null when no plannedAltitude data and no name match', () => {
    const wps: Waypoint[] = [wp('A'), wp('B'), wp('C')];
    expect(findTOD(wps, 36000)).toBeNull();
  });

  it('findTOC returns null on empty waypoints', () => {
    expect(findTOC([])).toBeNull();
  });

  it('findTOD returns null on empty waypoints', () => {
    expect(findTOD([])).toBeNull();
  });

  it('findTOC returns null when plan stays at 0', () => {
    const wps: Waypoint[] = [wp('A', 0), wp('B', 0)];
    expect(findTOC(wps)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, see fail**

Run: `npm test -- cruise-points`
Expected: all tests fail with "Cannot find module './cruise-points.js'" or similar.

- [ ] **Step 3: Implement `cruise-points.ts`**

Create `server/src/route-math/cruise-points.ts`:

```ts
import type { LatLon, Waypoint } from '@ff/shared';

function namedPosition(waypoints: Waypoint[], ident: 'TOC' | 'TOD'): LatLon | null {
  const w = waypoints.find((x) => x.ident === ident);
  return w ? { lat: w.lat, lon: w.lon } : null;
}

function effectiveCruiseAltitude(
  waypoints: Waypoint[],
  cruiseAltitudeFt: number | undefined,
): number | null {
  if (cruiseAltitudeFt != null && cruiseAltitudeFt > 0) return cruiseAltitudeFt;
  const max = waypoints.reduce(
    (m, w) => (w.plannedAltitude != null && w.plannedAltitude > m ? w.plannedAltitude : m),
    0,
  );
  return max > 0 ? max : null;
}

export function findTOC(waypoints: Waypoint[], cruiseAltitudeFt?: number): LatLon | null {
  const named = namedPosition(waypoints, 'TOC');
  if (named) return named;

  const cruise = effectiveCruiseAltitude(waypoints, cruiseAltitudeFt);
  if (cruise == null) return null;

  for (const w of waypoints) {
    if (w.plannedAltitude != null && w.plannedAltitude >= cruise) {
      return { lat: w.lat, lon: w.lon };
    }
  }
  return null;
}

export function findTOD(waypoints: Waypoint[], cruiseAltitudeFt?: number): LatLon | null {
  const named = namedPosition(waypoints, 'TOD');
  if (named) return named;

  const cruise = effectiveCruiseAltitude(waypoints, cruiseAltitudeFt);
  if (cruise == null) return null;

  let lastAtCruiseIdx = -1;
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i]!;
    if (w.plannedAltitude != null && w.plannedAltitude >= cruise) {
      lastAtCruiseIdx = i;
    }
  }
  if (lastAtCruiseIdx < 0) return null;
  const w = waypoints[lastAtCruiseIdx]!;
  return { lat: w.lat, lon: w.lon };
}
```

- [ ] **Step 4: Run tests, see pass**

Run: `npm test -- cruise-points`
Expected: all 11 tests pass.

- [ ] **Step 5: Run full server typecheck and tests**

Run:

```bash
npm test
npx tsc -p server --noEmit
```

Expected: cruise-points tests pass; other tests / typecheck still show pre-existing breakage from Task 2 (will be fixed in Task 5+).

- [ ] **Step 6: Commit**

```bash
git add server/src/route-math/cruise-points.ts server/src/route-math/cruise-points.test.ts
git commit -m "feat(server): cruise-points module — TOC/TOD detection

Name match (primary): waypoint with ident 'TOC' / 'TOD' from Simbrief.
Altitude scan fallback: first/last waypoint at cruise altitude.
Returns null when neither path yields a position."
```

---

## Task 4: Simbrief parser — block time + (conditional) constraints

**Files:**
- Modify: `server/src/simbrief/parser.ts`
- Modify: `server/src/simbrief/parser.test.ts`
- Modify: `server/src/simbrief/fixtures/minimal-ofp.json`

This task has a conditional sub-section. Skip the constraint sub-steps if Task 1 returned NOT CLEAN.

- [ ] **Step 1: Extend the OFP fixture with TOC/TOD waypoints + block time**

Replace `server/src/simbrief/fixtures/minimal-ofp.json` with:

```json
{
  "params": { "time_generated": "1714000000" },
  "general": {
    "icao_airline": "BAW",
    "flight_number": "123",
    "initial_altitude": "36000",
    "air_distance": "1085",
    "route_distance": "1101",
    "route": "MID OKRIX BAN",
    "route_navigraph": "EGLL DCT MID UN160 OKRIX UM601 BAN LEMD"
  },
  "aircraft": {
    "icao_code": "A320"
  },
  "origin": { "icao_code": "EGLL", "pos_lat": "51.4706", "pos_long": "-0.4619", "name": "London Heathrow" },
  "destination": { "icao_code": "LEMD", "pos_lat": "40.4936", "pos_long": "-3.5668", "name": "Madrid Barajas" },
  "alternate": { "icao_code": "LEBL", "pos_lat": "41.2971", "pos_long": "2.0785", "name": "Barcelona El Prat" },
  "times": {
    "sched_out": "1714053600",
    "sched_in": "1714060800",
    "est_time_enroute": "7200"
  },
  "navlog": {
    "fix": [
      { "ident": "MID", "pos_lat": "51.0531", "pos_long": "-0.6250", "altitude_feet": "15000" },
      { "ident": "TOC", "pos_lat": "49.5000", "pos_long": "-1.5000", "altitude_feet": "36000" },
      { "ident": "OKRIX", "pos_lat": "46.3333", "pos_long": "-2.0000", "altitude_feet": "37000" },
      { "ident": "TOD", "pos_lat": "43.5000", "pos_long": "-2.5000", "altitude_feet": "36000" },
      { "ident": "BAN", "pos_lat": "42.7500", "pos_long": "-2.8500", "altitude_feet": "37000" }
    ]
  }
}
```

If Task 1 spike returned **CLEAN**, also add the constraint fields to a couple of fixes (use whatever shape the spike confirmed Simbrief uses — placeholder example below; substitute real field names):

```json
      { "ident": "MID", "pos_lat": "51.0531", "pos_long": "-0.6250", "altitude_feet": "15000",
        "alt_const": "+5000", "speed_const": "-250" },
```

- [ ] **Step 2: Add failing tests in `parser.test.ts`**

Inside the existing `describe('parseSimbriefOfp', …)` block, before its closing `});`, append:

```ts
  it('extracts blockTimeSec from times.est_time_enroute (seconds)', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.blockTimeSec).toBe(7200);
  });

  it('omits blockTimeSec when est_time_enroute is absent', () => {
    const { times: _t, ...rest } = fixture;
    const without = { ...rest, times: { sched_out: '1714053600', sched_in: '1714060800' } };
    const plan = parseSimbriefOfp(without);
    expect(plan.blockTimeSec).toBeUndefined();
  });

  it('keeps TOC and TOD waypoints in the parsed waypoint list', () => {
    const plan = parseSimbriefOfp(fixture);
    const idents = plan.waypoints.map((w) => w.ident);
    expect(idents).toContain('TOC');
    expect(idents).toContain('TOD');
  });
```

If the spike returned **CLEAN**, also append (substituting real field names):

```ts
  it('extracts altConstraint when present on a fix', () => {
    const plan = parseSimbriefOfp(fixture);
    const mid = plan.waypoints.find((w) => w.ident === 'MID');
    expect(mid?.altConstraint).toEqual({ type: 'at-or-above', ft: 5000 });
  });

  it('extracts speedConstraint when present on a fix', () => {
    const plan = parseSimbriefOfp(fixture);
    const mid = plan.waypoints.find((w) => w.ident === 'MID');
    expect(mid?.speedConstraint).toEqual({ type: 'at-or-below', kt: 250 });
  });

  it('omits altConstraint / speedConstraint when fields are absent', () => {
    const plan = parseSimbriefOfp(fixture);
    const tod = plan.waypoints.find((w) => w.ident === 'TOD');
    expect(tod?.altConstraint).toBeUndefined();
    expect(tod?.speedConstraint).toBeUndefined();
  });
```

- [ ] **Step 3: Run tests, see fail**

Run: `npm test -- simbrief`
Expected: the new tests fail; existing tests still pass.

- [ ] **Step 4: Update `parser.ts`**

Replace `server/src/simbrief/parser.ts` with:

```ts
import { z } from 'zod';
import type { FlightPlan, Waypoint } from '@ff/shared';

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
  // Constraint fields (added in v1.3 if spike confirmed availability).
  alt_const: z.string().optional(),
  speed_const: z.string().optional(),
});

const TimesSchema = z.object({
  sched_out: numFromStr.optional(),
  sched_in: numFromStr.optional(),
  est_time_enroute: numFromStr.optional(),
});

const GeneralSchema = z.object({
  icao_airline: z.string().optional(),
  flight_number: z.string().optional(),
  initial_altitude: numFromStr.optional(),
  air_distance: numFromStr.optional(),
  route_distance: numFromStr.optional(),
  route: z.string().optional(),
  route_navigraph: z.string().optional(),
});

const AircraftSchema = z.object({
  icao_code: z.string().optional(),
});

const OfpSchema = z.object({
  general: GeneralSchema.optional(),
  aircraft: AircraftSchema.optional(),
  origin: AirportSchema,
  destination: AirportSchema,
  alternate: AirportSchema.optional(),
  times: TimesSchema.optional(),
  navlog: z.object({
    fix: z.array(FixSchema),
  }),
});

function parseAltConstraint(s: string | undefined): Waypoint['altConstraint'] {
  if (!s) return undefined;
  const m = s.match(/^([+\-]?)(\d+)$/);
  if (!m) return undefined;
  const ft = Number(m[2]);
  if (!Number.isFinite(ft)) return undefined;
  if (m[1] === '+') return { type: 'at-or-above', ft };
  if (m[1] === '-') return { type: 'at-or-below', ft };
  return { type: 'at', ft };
}

function parseSpeedConstraint(s: string | undefined): Waypoint['speedConstraint'] {
  if (!s) return undefined;
  const m = s.match(/^-?(\d+)$/);
  if (!m) return undefined;
  const kt = Number(m[1]);
  if (!Number.isFinite(kt)) return undefined;
  return { type: 'at-or-below', kt };
}

export function parseSimbriefOfp(raw: unknown): FlightPlan {
  const ofp = OfpSchema.parse(raw);
  const schedOutSec = ofp.times?.sched_out;
  const schedInSec = ofp.times?.sched_in;
  const blockTimeSec = ofp.times?.est_time_enroute;

  const flightNumber =
    ofp.general?.icao_airline && ofp.general?.flight_number
      ? `${ofp.general.icao_airline}${ofp.general.flight_number}`
      : undefined;

  const totalDistanceNm = ofp.general?.air_distance ?? ofp.general?.route_distance;
  const routeString = ofp.general?.route_navigraph ?? ofp.general?.route;

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
      altConstraint: parseAltConstraint(f.alt_const),
      speedConstraint: parseSpeedConstraint(f.speed_const),
    })),
    scheduledOut: schedOutSec != null ? schedOutSec * 1000 : undefined,
    scheduledIn: schedInSec != null ? schedInSec * 1000 : undefined,
    flightNumber,
    aircraftType: ofp.aircraft?.icao_code,
    cruiseAltitudeFt: ofp.general?.initial_altitude,
    totalDistanceNm,
    routeString,
    blockTimeSec,
  };
}
```

(If spike was NOT CLEAN, drop the `alt_const` / `speed_const` schema fields and the two parse helpers. The `Waypoint` shape still allows the optional fields to be undefined.)

- [ ] **Step 5: Run tests, see pass**

Run: `npm test -- simbrief`
Expected: all parser tests pass.

- [ ] **Step 6: Update existing waypoint-list assertion if needed**

The existing test `produces a waypoint list in order` asserts `['MID', 'OKRIX', 'BAN']`. With the fixture extended to include TOC and TOD between them, update the expectation:

```ts
  it('produces a waypoint list in order', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.waypoints.map((w) => w.ident)).toEqual(['MID', 'TOC', 'OKRIX', 'TOD', 'BAN']);
  });
```

Run: `npm test -- simbrief`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/simbrief/parser.ts server/src/simbrief/parser.test.ts server/src/simbrief/fixtures/minimal-ofp.json
git commit -m "feat(server): Simbrief parser — blockTimeSec + waypoint constraints

- Extracts plan.blockTimeSec from times.est_time_enroute (seconds).
- Fixture now includes named TOC / TOD waypoints (used by cruise-points).
- Parser accepts optional alt_const / speed_const per fix [if spike succeeded]."
```

---

## Milestone 1 checkpoint

End of pure server work. Verify:

```bash
npm test
npx tsc -p server --noEmit
```

Expected: all server tests pass; **server typecheck still fails** because `aggregator.ts` and `variables.ts` haven't been updated for the new shapes — those are Tasks 5–7. Do not move on to Milestone 2 until you've confirmed every server test passes (including `cruise-points`, `simbrief/parser`, the existing `aggregator`, `progress`, `distance`, `deviation`).

---

## Milestone 2 — Server I/O updates (Tasks 5–8)

Sim-bridge SimVar additions, aggregator extensions, and notes documentation.

---

## Task 5: Sim-bridge — new SimVars

**Files:**
- Modify: `server/src/sim-bridge/variables.ts`
- Modify: `server/src/sim-bridge/variables.test.ts`

- [ ] **Step 1: Read the existing test to learn the shape**

Read: `server/src/sim-bridge/variables.test.ts`

Note: The test asserts `SIM_VARS` length and `buildTelemetry` order. We're adding three new variables, so the test counts and value arrays change.

- [ ] **Step 2: Update the test to expect the new SimVars**

Edit `server/src/sim-bridge/variables.test.ts`. Find the test that exercises `buildTelemetry` with a values array and update the array to include three more numbers (heading-true, track-true, indicated-altitude). Update the assertion to check the new fields on the result. The exact change depends on the current test shape — read carefully and adjust.

For any test that asserts the SimVar list length, update the expected length.

Add at least these two assertions to a builder test:

```ts
    expect(t.heading.true).toBeCloseTo(/* the value at the new heading-true index */);
    expect(t.track.true).toBeCloseTo(/* the value at the new track-true index */);
    expect(t.altitude.indicated).toBeCloseTo(/* the value at the new indicated-altitude index */);
```

- [ ] **Step 3: Run, see fail**

Run: `npm test -- variables`
Expected: failures around new field expectations and possibly array-length mismatches.

- [ ] **Step 4: Update `variables.ts`**

Replace `server/src/sim-bridge/variables.ts` with:

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
  ['INDICATED ALTITUDE', 'feet'],
  ['GROUND VELOCITY', 'knots'],
  ['AIRSPEED INDICATED', 'knots'],
  ['AIRSPEED MACH', 'mach'],
  ['PLANE HEADING DEGREES MAGNETIC', 'degrees'],
  ['PLANE HEADING DEGREES TRUE', 'degrees'],
  ['GPS GROUND TRUE TRACK', 'degrees'],
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
    lat, lon,
    altMsl, altIndicated,
    gs, ias, mach,
    hdgMag, hdgTrue, trackTrue,
    vs,
    windDir, windVel,
    onGround,
    zuluYear, zuluMonth, zuluDay, zuluTime,
  ] = values as number[];

  const simTimeUtc =
    Number.isFinite(zuluYear) && (zuluYear as number) >= 1900
      ? Date.UTC(zuluYear as number, (zuluMonth ?? 1) - 1, zuluDay ?? 1) + (zuluTime ?? 0) * 1000
      : undefined;

  return {
    timestamp,
    position: { lat: lat ?? 0, lon: lon ?? 0 },
    altitude: { msl: altMsl ?? 0, indicated: altIndicated },
    speed: { ground: gs ?? 0, indicated: ias ?? 0, mach: mach ?? 0 },
    heading: { magnetic: hdgMag ?? 0, true: hdgTrue ?? 0 },
    track: { true: trackTrue ?? 0 },
    verticalSpeed: vs ?? 0,
    wind: { direction: windDir ?? 0, speed: windVel ?? 0 },
    onGround: (onGround ?? 0) > 0.5,
    simTimeUtc,
  };
}
```

- [ ] **Step 5: Backfill missing fields in the replay loader for older fixtures**

The fixtures in `scripts/fixtures/*.jsonl` were captured before this change and lack `heading.true`, `track.true`, and `altitude.indicated`. The replay loader feeds raw `RawTelemetry` JSON straight into the aggregator, so we backfill at parse time with sensible defaults (true heading defaults to magnetic; track defaults to magnetic; indicated stays undefined).

In `scripts/dev-telemetry-replay.ts`, find:

```ts
  const allEvents: RawTelemetry[] = lines.map((l) => JSON.parse(l) as RawTelemetry);
```

Replace with:

```ts
  // Backfill v1.3 fields when replaying fixtures captured pre-v1.3. Older
  // fixtures only have heading.magnetic; map true / track to it as a sensible
  // default. altitude.indicated stays undefined; the FE Alt row falls back
  // to MSL when indicated is absent.
  type LegacyTelemetry = Omit<RawTelemetry, 'heading' | 'track'> & {
    heading: { magnetic: number; true?: number };
    track?: { true?: number };
  };
  const allEvents: RawTelemetry[] = lines.map((l) => {
    const raw = JSON.parse(l) as LegacyTelemetry;
    return {
      ...raw,
      heading: { magnetic: raw.heading.magnetic, true: raw.heading.true ?? raw.heading.magnetic },
      track: { true: raw.track?.true ?? raw.heading.magnetic },
    };
  });
```

- [ ] **Step 6: Run tests, see pass**

Run: `npm test`
Expected: all server tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/sim-bridge/variables.ts server/src/sim-bridge/variables.test.ts scripts/dev-telemetry-replay.ts
git commit -m "feat(server): sim-bridge reads true-heading, track, indicated altitude

- Adds PLANE HEADING DEGREES TRUE, GPS GROUND TRUE TRACK, INDICATED ALTITUDE.
- Replay loader backfills heading.true / track.true from heading.magnetic
  for older fixtures that lack the fields."
```

---

## Task 6: Aggregator — breadcrumb sample shape

**Files:**
- Modify: `server/src/state/aggregator.ts`
- Modify: `server/src/state/aggregator.test.ts`

- [ ] **Step 1: Update the test helper and expectations**

In `server/src/state/aggregator.test.ts`, update the `telem` helper's defaults if needed (the new `heading.true` and `track.true` fields) and the breadcrumb-shape assertions.

Find the test:

```ts
  it('appends first breadcrumb point on first telemetry', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    expect(a.getState().breadcrumb).toHaveLength(1);
  });
```

Add an assertion that the sample carries altitude:

```ts
  it('appends first breadcrumb point with altitude', () => {
    const a = new Aggregator();
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 50, lon: 10 },
        onGround: true,
        altitude: { msl: 1234 },
      }),
    );
    const crumb = a.getState().breadcrumb[0];
    expect(crumb).toEqual({ lat: 50, lon: 10, altMsl: 1234 });
  });
```

Update the `telem` helper to include the new required fields:

```ts
function telem(partial: Partial<RawTelemetry> & Pick<RawTelemetry, 'timestamp' | 'position' | 'onGround'>): RawTelemetry {
  return {
    timestamp: partial.timestamp,
    position: partial.position,
    altitude: partial.altitude ?? { msl: 0 },
    speed: partial.speed ?? { ground: 0, indicated: 0, mach: 0 },
    heading: partial.heading ?? { magnetic: 0, true: 0 },
    track: partial.track ?? { true: 0 },
    verticalSpeed: partial.verticalSpeed ?? 0,
    wind: partial.wind ?? { direction: 0, speed: 0 },
    onGround: partial.onGround,
  };
}
```

- [ ] **Step 2: Run tests, see fail**

Run: `npm test -- aggregator`
Expected: failures because breadcrumb is currently `{lat, lon}` and we're asserting `{lat, lon, altMsl}`.

- [ ] **Step 3: Update aggregator's breadcrumb writes**

In `server/src/state/aggregator.ts`, update both `updateBreadcrumb` branches to write `altMsl`:

Find:

```ts
      return [{ lat: t.position.lat, lon: t.position.lon }];
```

Replace with:

```ts
      return [{ lat: t.position.lat, lon: t.position.lon, altMsl: t.altitude.msl }];
```

Find:

```ts
      return [...this.state.breadcrumb, { lat: t.position.lat, lon: t.position.lon }];
```

Replace with:

```ts
      return [...this.state.breadcrumb, { lat: t.position.lat, lon: t.position.lon, altMsl: t.altitude.msl }];
```

- [ ] **Step 4: Run tests, see pass**

Run: `npm test -- aggregator`
Expected: all aggregator tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/state/aggregator.ts server/src/state/aggregator.test.ts
git commit -m "feat(server): breadcrumb samples carry altitude (msl)

Foundation for v1.3's altitude-coded breadcrumb gradient on the map."
```

---

## Task 7: Aggregator — TOC / TOD positions and ETEs

**Files:**
- Modify: `server/src/state/aggregator.ts`
- Modify: `server/src/state/aggregator.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `server/src/state/aggregator.test.ts`:

```ts
describe('Aggregator TOC/TOD', () => {
  const PLAN_WITH_NAMED: FlightPlan = {
    fetchedAt: 0,
    origin: { icao: 'AAAA', lat: 0, lon: 0 },
    destination: { icao: 'BBBB', lat: 0, lon: 10 },
    waypoints: [
      { ident: 'W1', lat: 0, lon: 1, plannedAltitude: 10000 },
      { ident: 'TOC', lat: 0, lon: 2, plannedAltitude: 36000 },
      { ident: 'W2', lat: 0, lon: 5, plannedAltitude: 36000 },
      { ident: 'TOD', lat: 0, lon: 8, plannedAltitude: 36000 },
      { ident: 'W3', lat: 0, lon: 9, plannedAltitude: 10000 },
    ],
    cruiseAltitudeFt: 36000,
  };

  it('exposes tocPosition and todPosition once a plan loads', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    const s = a.getState();
    expect(s.progress.tocPosition).toEqual({ lat: 0, lon: 2 });
    expect(s.progress.todPosition).toEqual({ lat: 0, lon: 8 });
  });

  it('computes eteToTocSec from current GS and distance to TOC', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 0, lon: 0 },
        onGround: false,
        speed: { ground: 60, indicated: 60, mach: 0.1 },
      }),
    );
    const s = a.getState();
    expect(s.progress.eteToTocSec).not.toBeNull();
    expect(s.progress.eteToTocSec!).toBeGreaterThan(0);
  });

  it('returns null tocPosition / todPosition when no plan is loaded', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: false }));
    const s = a.getState();
    expect(s.progress.tocPosition).toBeNull();
    expect(s.progress.todPosition).toBeNull();
    expect(s.progress.eteToTocSec).toBeNull();
    expect(s.progress.eteToTodSec).toBeNull();
  });

  it('clears TOC/TOD on resetPlan', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    a.resetPlan();
    expect(a.getState().progress.tocPosition).toBeNull();
    expect(a.getState().progress.todPosition).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, see fail**

Run: `npm test -- aggregator`
Expected: the four new tests fail.

- [ ] **Step 3: Update `aggregator.ts`**

In `server/src/state/aggregator.ts`:

Add the import:

```ts
import { findTOC, findTOD } from '../route-math/cruise-points.js';
```

Update `EMPTY_PROGRESS`:

```ts
const EMPTY_PROGRESS: FlightProgress = {
  nextWaypoint: null,
  distanceToNextNm: null,
  eteToNextSec: null,
  distanceToDestNm: null,
  eteToDestSec: null,
  flightTimeSec: null,
  tocPosition: null,
  todPosition: null,
  eteToTocSec: null,
  eteToTodSec: null,
};
```

Update `computeProgress` to include TOC/TOD math:

```ts
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

    const tocPosition = findTOC(plan.waypoints, plan.cruiseAltitudeFt);
    const todPosition = findTOD(plan.waypoints, plan.cruiseAltitudeFt);
    const distToToc =
      tocPosition == null
        ? null
        : haversineNm(t.position.lat, t.position.lon, tocPosition.lat, tocPosition.lon);
    const distToTod =
      todPosition == null
        ? null
        : haversineNm(t.position.lat, t.position.lon, todPosition.lat, todPosition.lon);

    return {
      nextWaypoint: nextWp,
      distanceToNextNm: distNext,
      eteToNextSec: distNext == null ? null : eteSeconds(distNext, gs),
      distanceToDestNm: distDest,
      eteToDestSec: eteSeconds(distDest, gs),
      flightTimeSec,
      tocPosition,
      todPosition,
      eteToTocSec: distToToc == null ? null : eteSeconds(distToToc, gs),
      eteToTodSec: distToTod == null ? null : eteSeconds(distToTod, gs),
    };
  }
```

- [ ] **Step 4: Update `setPlan` to surface TOC/TOD even without telemetry**

`setPlan` already calls `computeProgress(this.state.telemetry, plan)`. With telemetry null, the early return uses `EMPTY_PROGRESS` which now has null TOC/TOD. We want the TOC/TOD positions to be visible **as soon as the plan loads**, even before telemetry arrives. Update the early-return branch:

Find:

```ts
    if (t == null || plan == null) {
      return { ...EMPTY_PROGRESS, flightTimeSec };
    }
```

Replace with:

```ts
    if (plan == null) {
      return { ...EMPTY_PROGRESS, flightTimeSec };
    }
    if (t == null) {
      return {
        ...EMPTY_PROGRESS,
        flightTimeSec,
        tocPosition: findTOC(plan.waypoints, plan.cruiseAltitudeFt),
        todPosition: findTOD(plan.waypoints, plan.cruiseAltitudeFt),
      };
    }
```

- [ ] **Step 5: Run tests, see pass**

Run: `npm test -- aggregator`
Expected: all aggregator tests pass.

- [ ] **Step 6: Run full server check**

```bash
npm test
npx tsc -p server --noEmit
```

Expected: all server tests pass; server typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/state/aggregator.ts server/src/state/aggregator.test.ts
git commit -m "feat(server): aggregator computes TOC/TOD positions and ETEs

Plan-driven: derives positions via cruise-points (name match → altitude scan).
Surfaces them on FlightProgress as soon as a plan loads, even before
telemetry; ETE values follow once GS is available."
```

---

## Task 8: Times and altitude vocabulary notes

**Files:**
- Create: `docs/notes/times-vocabulary.md`
- Create: `docs/notes/altitude-vocabulary.md`

- [ ] **Step 1: Create `docs/notes/times-vocabulary.md`**

```markdown
# Times vocabulary

This is the canonical mapping for every duration / wall-clock value in flight-follower. Cards must label times so users (and future-us) know exactly what they mean.

## Duration kinds

| Term | Meaning | Source |
|---|---|---|
| Block time | Gate-to-gate, OUT → IN | `plan.blockTimeSec` (Simbrief `times.est_time_enroute`) |
| Flight time | Wheels-off to wheels-on, OFF → ON | `progress.flightTimeSec` (server-computed from on-ground edge) |
| ETE | Estimated time enroute remaining to destination | `progress.eteToDestSec` (live, derived from GS) |
| ETE-to-next | Estimated time to next waypoint | `progress.eteToNextSec` |
| ETE-to-TOC / TOD | Estimated time to top of climb / descent | `progress.eteToTocSec` / `eteToTodSec` |

## Wall-clock kinds

| Term | Meaning | Source |
|---|---|---|
| ETA (live) | `now + eteToDestSec`, formatted as UTC `HH:MMz` | derived in TripCard from `progress.eteToDestSec` |
| ETA (sched) | Simbrief STA, formatted as UTC `HH:MMz` | `plan.scheduledIn` |
| Sched dep | Simbrief `sched_out` | `plan.scheduledOut` |
| Sched arr | Simbrief `sched_in` | `plan.scheduledIn` |
| Sim time | UTC time as exposed by MSFS while connected | `telemetry.simTimeUtc` |
| Wall clock | Browser's UTC clock | `Date.now()` |

## Suffixes

- All UTC wall-clock displays are suffixed with `z` (Zulu): `12:34z`.
- All durations format as `HH:MM` major + `:SS` minor, via `fmtDurationTier`.
```

- [ ] **Step 2: Create `docs/notes/altitude-vocabulary.md`**

```markdown
# Altitude vocabulary

Two altitude SimVars are read; each is used where it best matches the user's mental model.

## SimVars

| SimVar | Field | Meaning |
|---|---|---|
| `PLANE ALTITUDE` | `altitude.msl` | True MSL altitude — independent of altimeter setting. Stable across flights. |
| `INDICATED ALTITUDE` | `altitude.indicated` | What the cockpit altimeter shows — respects the local pressure setting (QNH/QFE/STD as set in the sim). |

## Use sites

| Surface | Field | Why |
|---|---|---|
| Panel "Alt" row (MotionCard) | `altitude.indicated ?? altitude.msl` | Mirrors what the pilot sees on the PFD. Falls back to MSL if indicated is unavailable. |
| Map breadcrumb gradient | `altitude.msl` | Geographic / cross-flight comparison — independent of altimeter setting. |
| Plan glyph (FlightPlanCard) | Plan altitude (Simbrief `altitude_feet`) | Plan-side, not telemetry — already MSL-equivalent in Simbrief output. |

## Heading parallel

The same dual-source pattern applies to heading: panel HDG mirrors the cockpit (magnetic), map plane icon rotation uses true (the map renders in true geographic bearings). See `times-vocabulary.md` for the times analog.
```

- [ ] **Step 3: Commit**

```bash
git add docs/notes/times-vocabulary.md docs/notes/altitude-vocabulary.md
git commit -m "docs: times and altitude vocabulary notes

Single source of truth for which time / altitude value goes where.
Referenced by TripCard, FlightPlanCard, ClockCard, MotionCard, BreadcrumbTrail."
```

---

## Milestone 2 checkpoint

End of server work. Verify:

```bash
npm test
npx tsc -p server --noEmit
```

Expected: all server tests pass; server typecheck clean. **Web typecheck still fails** — that's Milestone 3+.

---

## Milestone 3 — Frontend map work (Tasks 9–13)

Breadcrumb gradient, TOC/TOD markers, plane icon true-heading, alternate marker, map mode promotion.

---

## Task 9: Altitude palette + breadcrumb gradient

**Files:**
- Create: `web/src/lib/altitudePalette.ts`
- Modify: `web/src/components/Map/BreadcrumbTrail.tsx`

- [ ] **Step 1: Create the palette module**

Create `web/src/lib/altitudePalette.ts`:

```ts
// Maps altitude in feet (MSL) to a color, shared between BreadcrumbTrail and
// FlightPlanCard's altitude-profile glyph.
//
// Stops are chosen to make the climb/cruise/descent phases visually distinct:
// ground = neutral, low-altitude warm tones, mid-altitude greens, high-cruise
// cool tones. Bucketing keeps consecutive same-altitude segments collapsible
// into a single polyline so the breadcrumb stays cheap.

export const ALTITUDE_STOPS: ReadonlyArray<{ ft: number; color: string }> = [
  { ft: 0,      color: '#9ca3af' }, // ground / taxi — gray
  { ft: 5000,   color: '#f59e0b' }, // low climb — amber
  { ft: 10000,  color: '#eab308' }, // pattern altitudes — yellow
  { ft: 18000,  color: '#84cc16' }, // mid-climb — lime
  { ft: 28000,  color: '#22c55e' }, // upper climb — green
  { ft: 36000,  color: '#06b6d4' }, // typical cruise — cyan
  { ft: 42000,  color: '#3b82f6' }, // high cruise — blue
];

export function altitudeBucket(altMsl: number): number {
  let idx = 0;
  for (let i = 0; i < ALTITUDE_STOPS.length; i++) {
    if (altMsl >= ALTITUDE_STOPS[i]!.ft) idx = i;
    else break;
  }
  return idx;
}

export function altitudeToColor(altMsl: number): string {
  return ALTITUDE_STOPS[altitudeBucket(altMsl)]!.color;
}
```

- [ ] **Step 2: Rewrite `BreadcrumbTrail.tsx` to render per-bucket polylines**

Replace `web/src/components/Map/BreadcrumbTrail.tsx` with:

```tsx
import { Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { altitudeBucket, altitudeToColor } from '../../lib/altitudePalette.js';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;

  // Bucket consecutive samples that share an altitude bucket into a single
  // polyline. Each segment includes the previous sample's last point so
  // adjacent buckets stay visually connected on the map.
  const segments: Array<{ bucket: number; points: [number, number][] }> = [];
  let current: { bucket: number; points: [number, number][] } | null = null;
  for (let i = 0; i < crumbs.length; i++) {
    const c = crumbs[i]!;
    const b = altitudeBucket(c.altMsl);
    if (!current || current.bucket !== b) {
      // Start a new segment, but include the previous crumb (if any) so the
      // visual transition between buckets is continuous.
      const prev = i > 0 ? crumbs[i - 1]! : null;
      current = { bucket: b, points: prev ? [[prev.lat, prev.lon]] : [] };
      segments.push(current);
    }
    current.points.push([c.lat, c.lon]);
  }

  return (
    <>
      {segments.map((seg, idx) => (
        <Polyline
          key={idx}
          positions={seg.points}
          pathOptions={{ color: altitudeToColor(ALTITUDE_STOPS_REF[seg.bucket]), weight: 3 }}
        />
      ))}
    </>
  );
}

// Bucket → ft helper for the renderer above. We could have called
// altitudeToColor(stops[bucket].ft) but reading the stop directly stays
// honest about the data flow.
import { ALTITUDE_STOPS } from '../../lib/altitudePalette.js';
const ALTITUDE_STOPS_REF: number[] = ALTITUDE_STOPS.map((s) => s.ft);
```

Note the import-at-bottom is awkward; clean it up: move both imports to the top:

```tsx
import { Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { ALTITUDE_STOPS, altitudeBucket, altitudeToColor } from '../../lib/altitudePalette.js';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;

  const segments: Array<{ bucketFt: number; points: [number, number][] }> = [];
  let current: { bucketFt: number; points: [number, number][] } | null = null;
  for (let i = 0; i < crumbs.length; i++) {
    const c = crumbs[i]!;
    const b = altitudeBucket(c.altMsl);
    const bucketFt = ALTITUDE_STOPS[b]!.ft;
    if (!current || current.bucketFt !== bucketFt) {
      const prev = i > 0 ? crumbs[i - 1]! : null;
      current = { bucketFt, points: prev ? [[prev.lat, prev.lon]] : [] };
      segments.push(current);
    }
    current.points.push([c.lat, c.lon]);
  }

  return (
    <>
      {segments.map((seg, idx) => (
        <Polyline
          key={idx}
          positions={seg.points}
          pathOptions={{ color: altitudeToColor(seg.bucketFt), weight: 3 }}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 3: Run web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors related to other files (still uncovered) — but `BreadcrumbTrail.tsx` and `altitudePalette.ts` should be clean. If the breadcrumb file errors, fix.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/altitudePalette.ts web/src/components/Map/BreadcrumbTrail.tsx
git commit -m "feat(web): breadcrumb altitude gradient

Shared altitude palette in web/src/lib/altitudePalette.ts.
BreadcrumbTrail renders one polyline per altitude bucket; consecutive
samples in the same bucket share a polyline (DOM-cheap on long flights)."
```

---

## Task 10: Cruise points map layer (TOC / TOD markers)

**Files:**
- Create: `web/src/components/Map/CruisePoints.tsx`
- Modify: `web/src/components/Map/Map.tsx`
- Modify: `web/src/components/Map/PlannedRoute.tsx`

- [ ] **Step 1: Create `CruisePoints.tsx`**

```tsx
import { divIcon } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

const TOC_GLYPH = `
  <svg viewBox="0 0 16 16" width="16" height="16" style="display:block;">
    <path d="M2 12 L8 4 L14 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="8" cy="4" r="1.5" fill="currentColor"/>
  </svg>
`;

const TOD_GLYPH = `
  <svg viewBox="0 0 16 16" width="16" height="16" style="display:block;">
    <path d="M2 4 L8 12 L14 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
  </svg>
`;

function makeIcon(label: 'TOC' | 'TOD'): ReturnType<typeof divIcon> {
  return divIcon({
    className: 'ff-cruise-point',
    html: `<div style="color:var(--ff-fg-muted);">${label === 'TOC' ? TOC_GLYPH : TOD_GLYPH}</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function CruisePoints() {
  const toc = useFlightStore((s) => s.state.progress.tocPosition);
  const tod = useFlightStore((s) => s.state.progress.todPosition);

  return (
    <>
      {toc && (
        <Marker position={[toc.lat, toc.lon]} icon={makeIcon('TOC')} interactive>
          <Tooltip direction="top" offset={[0, -10]}>Top of climb</Tooltip>
        </Marker>
      )}
      {tod && (
        <Marker position={[tod.lat, tod.lon]} icon={makeIcon('TOD')} interactive>
          <Tooltip direction="top" offset={[0, -10]}>Top of descent</Tooltip>
        </Marker>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount the layer in `Map.tsx`**

In `web/src/components/Map/Map.tsx`, add the import:

```tsx
import { CruisePoints } from './CruisePoints.js';
```

Add `<CruisePoints />` after `<PlannedRoute />`:

```tsx
        <PlannedRoute />
        <CruisePoints />
        <BreadcrumbTrail />
```

- [ ] **Step 3: Filter named TOC/TOD from `PlannedRoute.tsx`**

In `web/src/components/Map/PlannedRoute.tsx`, replace the all-waypoints array with one that filters TOC/TOD:

Find:

```tsx
  const all = [
    [plan.origin.lat, plan.origin.lon] as [number, number],
    ...plan.waypoints.map((w) => [w.lat, w.lon] as [number, number]),
    [plan.destination.lat, plan.destination.lon] as [number, number],
  ];
```

Leave it. The polyline through the named TOC/TOD positions is fine — they're real points on the route. Only the **markers** in the waypoint loop need filtering. Find:

```tsx
      {plan.waypoints.map((w) => (
        <CircleMarker
```

Replace the line above with:

```tsx
      {plan.waypoints
        .filter((w) => w.ident !== 'TOC' && w.ident !== 'TOD')
        .map((w) => (
        <CircleMarker
```

(The closing parens stay the same — only the source array changes.)

- [ ] **Step 4: Run web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; map files clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Map/CruisePoints.tsx web/src/components/Map/Map.tsx web/src/components/Map/PlannedRoute.tsx
git commit -m "feat(web): TOC/TOD map markers

CruisePoints layer renders distinct chevron icons at progress.tocPosition
and progress.todPosition. PlannedRoute filters TOC/TOD waypoints from its
marker loop so they don't double-render."
```

---

## Task 11: Aircraft marker — true heading rotation

**Files:**
- Modify: `web/src/components/Map/AircraftMarker.tsx`

- [ ] **Step 1: Switch the rotation source**

In `web/src/components/Map/AircraftMarker.tsx`, find:

```tsx
  const heading = t.heading.magnetic;
```

Replace with:

```tsx
  // Map renders in true geographic bearings; the icon rotation must use TRUE
  // heading. The cockpit-mimicking HDG row in PositionCard / MotionCard keeps
  // showing magnetic. See docs/notes/altitude-vocabulary.md.
  const heading = t.heading.true;
```

- [ ] **Step 2: Verify WindCompass stays magnetic (no change)**

The WindCompass widget is panel-only and mimics a cockpit instrument; its heading reference should remain magnetic. Open `web/src/components/DataPanel/WindCompass.tsx` and confirm:

```tsx
  const heading = t?.heading.magnetic ?? null;
```

Leave it. No change.

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; AircraftMarker clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/AircraftMarker.tsx
git commit -m "fix(web): map plane icon rotates by true heading

Was using heading.magnetic, which caused the icon to point sideways at
high-magvar latitudes (e.g. NZQN, magvar ~22°E). Map renders in true
bearings, so true heading is the right reference.

Panel HDG row remains magnetic to mirror the cockpit instrument."
```

---

## Task 12: Map polish — minZoom, alternate marker, CSS tokens

**Files:**
- Modify: `web/src/components/Map/Map.tsx`
- Modify: `web/src/components/Map/PlannedRoute.tsx`
- Modify: `web/src/index.css`

- [ ] **Step 1: Add `minZoom` to `<MapContainer>`**

In `web/src/components/Map/Map.tsx`, find:

```tsx
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} worldCopyJump>
```

Replace with:

```tsx
      <MapContainer center={center} zoom={zoom} minZoom={3} style={{ height: '100%', width: '100%' }} worldCopyJump>
```

- [ ] **Step 2: Add `--ff-alternate` token + light-mode tooltip opacity tweak**

In `web/src/index.css`, find the `:root` block (light mode) — around line 15-28 — and add:

```css
  --ff-alternate: #2563eb;
```

In the `.dark` block, add:

```css
  --ff-alternate: #60a5fa;
```

Tooltip opacity tweak — find `--ff-bg-tooltip-translucent: rgba(255, 255, 255, 0.6);` in `:root` and increase opacity to `0.85`:

```css
  --ff-bg-tooltip-translucent: rgba(255, 255, 255, 0.85);
```

Leave the dark-mode tooltip opacity unchanged.

- [ ] **Step 3: Add the alternate marker in `PlannedRoute.tsx`**

In `web/src/components/Map/PlannedRoute.tsx`, after the destination `<CircleMarker>` block, append the alternate marker:

```tsx
      {plan.alternate && (
        <CircleMarker
          center={[plan.alternate.lat, plan.alternate.lon]}
          radius={5}
          pathOptions={{ color: 'var(--ff-alternate)', fillColor: '#fff', fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{plan.alternate.icao}</strong>
            {plan.alternate.name && (
              <div style={{ fontSize: '0.8em', opacity: 0.7 }}>{plan.alternate.name}</div>
            )}
          </Tooltip>
        </CircleMarker>
      )}
```

Note: **no `permanent` flag** on the alternate's `<Tooltip>`. Origin and destination keep `permanent`; alternate is hover-only by design.

Also: Leaflet's `pathOptions.color` must be a string, not a CSS variable, on some versions of `react-leaflet`. If `'var(--ff-alternate)'` doesn't resolve at the SVG level, swap to a literal hex per theme by reading the theme store:

```tsx
import { useThemeStore } from '../../store/theme.js';
// ...
const theme = useThemeStore((s) => s.theme);
const ALT_COLOR = theme === 'dark' ? '#60a5fa' : '#2563eb';
// use ALT_COLOR in pathOptions.color
```

Try the CSS variable first; if it renders gray/transparent, swap to the literal pattern.

- [ ] **Step 4: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; map polish files clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Map/Map.tsx web/src/components/Map/PlannedRoute.tsx web/src/index.css
git commit -m "feat(web): map polish — minZoom, alternate marker, lighter-mode tooltip

- minZoom=3 prevents tile-grid wraparound on extreme zoom-out.
- Alternate airport renders in blue (--ff-alternate) with hover-only tooltip;
  origin and destination keep their existing permanent labels.
- Light-mode tooltip opacity bumped 0.6 → 0.85 for legibility on light tiles."
```

---

## Task 13: Map mode — Overview→Manual on user gestures, click-self no-op

**Files:**
- Modify: `web/src/components/Map/MapController.tsx`
- Modify: `web/src/components/Map/ViewModeControl.tsx`

- [ ] **Step 1: Extend `MapController.tsx` user-gesture handlers**

In `web/src/components/Map/MapController.tsx`, find:

```tsx
  useMapEvents({
    dragstart: () => {
      if (programmatic.current) return;
      if (mode !== 'manual') setMode('manual');
    },
    moveend: () => {
      // Fires after both pan and zoom finish (zoom is a kind of move). We
      // persist on every moveend, including programmatic ones — any stale
      // programmatic position gets overwritten the moment the user acts or
      // telemetry advances after the next reload.
      const c = map.getCenter();
      setLastView([c.lat, c.lng], map.getZoom());
    },
  });
```

Replace with:

```tsx
  useMapEvents({
    dragstart: () => {
      if (programmatic.current) return;
      if (mode !== 'manual') setMode('manual');
    },
    zoomstart: () => {
      // Any user-initiated zoom (in or out) promotes Overview/Follow → Manual.
      // Programmatic zoom (fitBounds, panTo) is gated by the same flag the
      // dragstart handler uses.
      if (programmatic.current) return;
      if (mode !== 'manual') setMode('manual');
    },
    moveend: () => {
      const c = map.getCenter();
      setLastView([c.lat, c.lng], map.getZoom());
    },
  });
```

- [ ] **Step 2: Guard `setMode` against same-mode click in `ViewModeControl.tsx`**

In `web/src/components/Map/ViewModeControl.tsx`, find:

```tsx
        onSelectionChange={(keys) => {
          const selected = Array.from(keys as Set<string>)[0];
          if (selected) setMode(selected as ViewMode);
        }}
```

Replace with:

```tsx
        onSelectionChange={(keys) => {
          const selected = Array.from(keys as Set<string>)[0];
          // Clicking the already-active mode is a no-op; otherwise the
          // re-selection fires Overview's auto-fit again, re-panning the map.
          if (selected && selected !== mode) setMode(selected as ViewMode);
        }}
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; both touched files clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/MapController.tsx web/src/components/Map/ViewModeControl.tsx
git commit -m "fix(web): map mode promotion on user zoom + same-mode click no-op

- zoomstart now demotes Overview/Follow to Manual on user gestures, mirroring
  the existing dragstart behavior.
- ViewModeControl no longer re-fires setMode when the user clicks the
  already-active button (which used to trigger Overview's refit and re-pan)."
```

---

## Milestone 3 checkpoint

End of map work. Verify:

```bash
npx tsc -p web --noEmit
```

Expected: errors in `flight.ts`, `TripCard.tsx`, `ClockCard.tsx`, `FlightPlanCard.tsx`, `PositionCard.tsx`, `MotionCard.tsx` because of the type changes — those are Milestone 4. Map files should typecheck.

Run a manual replay smoke at this point if you want intermediate validation:

```bash
FF_STATIC_PATH=/tmp npm run dev:replay -- scripts/fixtures/replay-eddb-lipz.jsonl
# in another terminal:
npm --workspace web run dev
```

Visual checks:
- Breadcrumb visibly transitions through palette colors as the recorded flight climbs.
- TOC/TOD chevron markers appear at sensible map positions.
- Plane icon points along the breadcrumb (no sideways drift).
- Alternate (LIPC or whatever the OFP encodes) renders in blue with hover-only tooltip.
- Zooming out of Overview switches to Manual.

---

## Milestone 4 — Frontend cards (Tasks 14–19)

The panel work. Stores, selectors, and per-card edits.

---

## Task 14: Skip-waypoint store + `activeWaypoint` selector

**Files:**
- Modify: `web/src/store/flight.ts`
- Create: `web/src/lib/activeWaypoint.ts`

- [ ] **Step 1: Extend the flight store with `manualNextIndex`**

Replace `web/src/store/flight.ts` with:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
    tocPosition: null,
    todPosition: null,
    eteToTocSec: null,
    eteToTodSec: null,
  },
};

type FlightStore = {
  state: FlightState;
  wsConnected: boolean;
  // Skip-waypoint override. null = follow server's auto-selected next waypoint.
  manualNextIndex: number | null;
  setFlightState: (s: FlightState) => void;
  setPlan: (p: FlightPlan) => void;
  setWsConnected: (v: boolean) => void;
  setManualNextIndex: (i: number | null) => void;
};

export const useFlightStore = create<FlightStore>()(
  persist(
    (set, get) => ({
      state: emptyState,
      wsConnected: false,
      manualNextIndex: null,
      setFlightState: (s) => set({ state: s }),
      setPlan: (p) =>
        set((prev) => {
          // Auto-resync: a fresh plan clears any manual override so the user
          // doesn't get "stuck" pointing at a stale fix.
          const fetchedAtChanged = prev.state.plan?.fetchedAt !== p.fetchedAt;
          return {
            state: { ...prev.state, plan: p },
            manualNextIndex: fetchedAtChanged ? null : prev.manualNextIndex,
          };
        }),
      setWsConnected: (v) => set({ wsConnected: v }),
      setManualNextIndex: (i) => {
        // Defensive bounds check on read; the setter trusts the caller (the FE
        // controls in TripCard increment/decrement from a valid base).
        set({ manualNextIndex: i });
      },
    }),
    {
      name: 'ff:nav-override',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ manualNextIndex: s.manualNextIndex }),
    },
  ),
);
```

- [ ] **Step 2: Create `web/src/lib/activeWaypoint.ts`**

```ts
import type { FlightProgress, FlightState, Waypoint } from '@ff/shared';

const EARTH_RADIUS_NM = 3440.065;
const MIN_GS_FOR_ETE_KTS = 30;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function eteSec(distanceNm: number, gs: number): number | null {
  if (distanceNm <= 0 || gs < MIN_GS_FOR_ETE_KTS) return null;
  return (distanceNm / gs) * 3600;
}

export type ActiveNext = {
  waypoint: Waypoint | null;
  distanceNm: number | null;
  eteSec: number | null;
  isManual: boolean;
};

export function selectActiveNext(state: FlightState, manualNextIndex: number | null): ActiveNext {
  const { progress, plan, telemetry } = state;
  if (manualNextIndex == null || plan == null) {
    return {
      waypoint: progress.nextWaypoint,
      distanceNm: progress.distanceToNextNm,
      eteSec: progress.eteToNextSec,
      isManual: false,
    };
  }

  // Defensive bounds check.
  const wps = plan.waypoints;
  if (manualNextIndex < 0 || manualNextIndex >= wps.length) {
    return {
      waypoint: progress.nextWaypoint,
      distanceNm: progress.distanceToNextNm,
      eteSec: progress.eteToNextSec,
      isManual: false,
    };
  }

  const wp = wps[manualNextIndex]!;
  if (telemetry == null) {
    return { waypoint: wp, distanceNm: null, eteSec: null, isManual: true };
  }

  const dist = haversineNm(telemetry.position.lat, telemetry.position.lon, wp.lat, wp.lon);
  return {
    waypoint: wp,
    distanceNm: dist,
    eteSec: eteSec(dist, telemetry.speed.ground),
    isManual: true,
  };
}

// Convenience: find the index of the server-derived next waypoint, used to
// seed manualNextIndex when the user first clicks a skip arrow.
export function indexOfServerNext(progress: FlightProgress, plan: FlightState['plan']): number {
  if (plan == null || progress.nextWaypoint == null) return -1;
  const ident = progress.nextWaypoint.ident;
  return plan.waypoints.findIndex((w) => w.ident === ident);
}
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; flight store and lib clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/store/flight.ts web/src/lib/activeWaypoint.ts
git commit -m "feat(web): manualNextIndex store + activeWaypoint selector

FE-only skip-waypoint override. Auto-resyncs to null on plan reload via
fetchedAt comparison. selectActiveNext falls through to server-derived
values when override is null."
```

---

## Task 15: TripCard — skip-waypoint arrows, ProgressBar, live-vs-sched ETA

**Files:**
- Create: `web/src/components/DataPanel/ProgressBar.tsx`
- Modify: `web/src/components/DataPanel/TripCard.tsx`

- [ ] **Step 1: Create the `ProgressBar` component**

```tsx
import type { FlightPlan, FlightProgress } from '@ff/shared';

const EARTH_RADIUS_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

type Props = {
  plan: FlightPlan;
  progress: FlightProgress;
};

export function ProgressBar({ plan, progress }: Props) {
  const totalNm =
    plan.totalDistanceNm ??
    haversineNm(plan.origin.lat, plan.origin.lon, plan.destination.lat, plan.destination.lon);
  if (totalNm <= 0) return null;

  const aircraftPct =
    progress.distanceToDestNm == null
      ? 0
      : Math.max(0, Math.min(1, 1 - progress.distanceToDestNm / totalNm));

  const tocPct =
    progress.tocPosition == null
      ? null
      : Math.max(
          0,
          Math.min(
            1,
            haversineNm(
              plan.origin.lat,
              plan.origin.lon,
              progress.tocPosition.lat,
              progress.tocPosition.lon,
            ) / totalNm,
          ),
        );

  const todPct =
    progress.todPosition == null
      ? null
      : Math.max(
          0,
          Math.min(
            1,
            haversineNm(
              plan.origin.lat,
              plan.origin.lon,
              progress.todPosition.lat,
              progress.todPosition.lon,
            ) / totalNm,
          ),
        );

  return (
    <div className="relative w-full h-1.5 my-2 rounded-full" style={{ background: 'var(--ff-bg-elevated)' }}>
      {/* filled portion */}
      <div
        className="absolute left-0 top-0 h-full rounded-full"
        style={{ width: `${aircraftPct * 100}%`, background: 'var(--ff-accent)' }}
      />

      {/* origin tick */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{ left: 0, background: 'var(--ff-fg-muted)' }}
      />

      {/* destination tick */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{ left: '100%', transform: 'translate(-100%, -50%)', background: 'var(--ff-fg-muted)' }}
      />

      {/* TOC tick */}
      {tocPct != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
          style={{ left: `${tocPct * 100}%`, background: 'var(--ff-fg)' }}
          title="Top of climb"
        />
      )}

      {/* TOD tick */}
      {todPct != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
          style={{ left: `${todPct * 100}%`, background: 'var(--ff-fg)' }}
          title="Top of descent"
        />
      )}

      {/* aircraft tick (hollow) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
        style={{
          left: `${aircraftPct * 100}%`,
          transform: 'translate(-50%, -50%)',
          background: 'transparent',
          border: '2px solid var(--ff-accent)',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update `TripCard.tsx`**

Replace `web/src/components/DataPanel/TripCard.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import type { Airport } from '@ff/shared';
import { Card, Chip, Separator, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { CircleFill } from '@gravity-ui/icons';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtDurationTier, fmtNum, fmtUtcTime } from './fmt.js';
import { Row } from './Row.js';
import { ProgressBar } from './ProgressBar.js';
import { indexOfServerNext, selectActiveNext } from '../../lib/activeWaypoint.js';

function airportLabel(a: Airport): string {
  return a.name ?? a.icao;
}

type EtaStatus = 'on-time' | 'slightly-late' | 'very-late';

const ETA_STATUS_COLOR: Record<EtaStatus, string> = {
  'on-time': '#16a34a',
  'slightly-late': '#f59e0b',
  'very-late': '#dc2626',
};

const ETA_STATUS_LABEL: Record<EtaStatus, string> = {
  'on-time': 'On time / early',
  'slightly-late': 'Slightly late',
  'very-late': 'Very late',
};

function etaStatus(etaMs: number, scheduledMs: number): EtaStatus {
  const lateMin = (etaMs - scheduledMs) / 60_000;
  if (lateMin <= 5) return 'on-time';
  if (lateMin <= 20) return 'slightly-late';
  return 'very-late';
}

export function TripCard() {
  const state = useFlightStore((s) => s.state);
  const manualNextIndex = useFlightStore((s) => s.manualNextIndex);
  const setManualNextIndex = useFlightStore((s) => s.setManualNextIndex);
  const { plan, progress, telemetry } = state;

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!plan) {
    return (
      <Card variant="default">
        <Card.Content>
          <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see trip info.</div>
        </Card.Content>
      </Card>
    );
  }

  const now = telemetry?.simTimeUtc ?? Date.now();

  // Live ETA: derived from progress.eteToDestSec when available; otherwise the
  // scheduled STA. Label distinguishes the two so the user knows which is on screen.
  const liveEtaMs =
    progress.eteToDestSec != null ? now + progress.eteToDestSec * 1000 : null;
  const etaMs = liveEtaMs ?? plan.scheduledIn ?? null;
  const etaLabel = liveEtaMs != null ? 'live' : plan.scheduledIn != null ? 'sched' : null;

  const remaining =
    progress.distanceToDestNm != null ? `${fmtNum(progress.distanceToDestNm, 0)} nm` : dash;
  const eta = etaMs != null ? `${fmtUtcTime(etaMs)}z` : dash;
  const etaStatusValue =
    liveEtaMs != null && plan.scheduledIn != null ? etaStatus(liveEtaMs, plan.scheduledIn) : null;

  const active = selectActiveNext(state, manualNextIndex);
  const wps = plan.waypoints.filter((w) => w.ident !== 'TOC' && w.ident !== 'TOD');
  // Map active.waypoint back to filtered-array index for the arrow buttons.
  const activeIdent = active.waypoint?.ident;
  const filteredIdx = activeIdent ? wps.findIndex((w) => w.ident === activeIdent) : -1;

  function step(delta: -1 | 1): void {
    // First click seeds from the server-derived next; subsequent steps walk
    // through the filtered (TOC/TOD removed) waypoint list, then translate
    // back to the unfiltered index for storage.
    let baseFilteredIdx: number;
    if (filteredIdx >= 0) {
      baseFilteredIdx = filteredIdx;
    } else {
      const serverIdx = indexOfServerNext(progress, plan);
      // Map serverIdx (unfiltered) → filtered index. If TOC/TOD lie before
      // serverIdx in the unfiltered list, subtract that count.
      const seen = plan.waypoints.slice(0, Math.max(0, serverIdx));
      const removedBefore = seen.filter((w) => w.ident === 'TOC' || w.ident === 'TOD').length;
      baseFilteredIdx = Math.max(0, serverIdx - removedBefore);
    }
    const nextFilteredIdx = Math.max(0, Math.min(wps.length - 1, baseFilteredIdx + delta));
    const targetIdent = wps[nextFilteredIdx]?.ident;
    if (!targetIdent) return;
    const unfilteredIdx = plan.waypoints.findIndex((w) => w.ident === targetIdent);
    if (unfilteredIdx >= 0) setManualNextIndex(unfilteredIdx);
  }

  return (
    <Card variant="default">
      <Card.Content>
        {/* Origin → Destination header (unchanged) */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="font-mono text-lg font-semibold leading-tight">{plan.origin.icao}</div>
            <div className="text-xs text-fg-muted">{airportLabel(plan.origin)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-mono text-sm tabular-nums">{fmtUtcTime(plan.scheduledOut)}</span>
              {plan.scheduledOut != null && (
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>sched</Chip.Label>
                </Chip>
              )}
            </div>
          </div>
          <div className="text-fg-muted self-center">→</div>
          <div className="flex flex-col gap-0.5 items-end min-w-0 text-right">
            <div className="font-mono text-lg font-semibold leading-tight">{plan.destination.icao}</div>
            <div className="text-xs text-fg-muted">{airportLabel(plan.destination)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-mono text-sm tabular-nums">{fmtUtcTime(plan.scheduledIn)}</span>
              {plan.scheduledIn != null && (
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>sched</Chip.Label>
                </Chip>
              )}
            </div>
          </div>
        </div>

        {/* Progress timeline */}
        <ProgressBar plan={plan} progress={progress} />

        <Separator className="my-3" />

        <Row label="Remaining">{remaining}</Row>
        <Row label="ETE" tooltip="Estimated time enroute (until destination)">
          {fmtDurationTier(progress.eteToDestSec)}
        </Row>
        <Row label="ETA" tooltip="Estimated time of arrival (UTC)">
          <span className="inline-flex items-center gap-1.5">
            {eta}
            {etaLabel && (
              <Chip size="sm" variant="soft" color={etaLabel === 'live' ? 'accent' : 'default'}>
                <Chip.Label>{etaLabel}</Chip.Label>
              </Chip>
            )}
            {etaStatusValue && (
              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex" aria-label={ETA_STATUS_LABEL[etaStatusValue]}>
                    <CircleFill width={8} height={8} style={{ color: ETA_STATUS_COLOR[etaStatusValue] }} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{ETA_STATUS_LABEL[etaStatusValue]}</TooltipContent>
              </Tooltip>
            )}
          </span>
        </Row>

        {(active.waypoint || progress.nextWaypoint) && (
          <>
            <Separator className="my-3" />
            <div
              className="flex items-center gap-1.5"
              style={{ fontSize: 12, color: 'var(--ff-fg-muted)', fontFamily: 'ui-monospace, monospace' }}
            >
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous waypoint"
                className="px-1 cursor-pointer bg-transparent border-0 text-current"
              >
                ◀
              </button>
              <span>
                Next: {active.waypoint?.ident ?? progress.nextWaypoint?.ident}
                {(active.distanceNm ?? progress.distanceToNextNm) != null && (
                  <> · {fmtNum(active.distanceNm ?? progress.distanceToNextNm!, 1)} nm</>
                )}
                {(active.eteSec ?? progress.eteToNextSec) != null && (
                  <> · {fmtDurationTier(active.eteSec ?? progress.eteToNextSec)}</>
                )}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next waypoint"
                className="px-1 cursor-pointer bg-transparent border-0 text-current"
              >
                ▶
              </button>
              {active.isManual && (
                <button
                  type="button"
                  onClick={() => setManualNextIndex(null)}
                  className="px-1 cursor-pointer bg-transparent border-0 underline"
                  style={{ color: 'var(--ff-accent)' }}
                >
                  auto
                </button>
              )}
            </div>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors in remaining cards; TripCard and ProgressBar clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/DataPanel/ProgressBar.tsx web/src/components/DataPanel/TripCard.tsx
git commit -m "feat(web): TripCard progress timeline + skip-waypoint + live ETA label

- ProgressBar: thin horizontal bar with origin/dest/TOC/TOD ticks and a
  hollow aircraft tick that tracks distanceToDest.
- Skip-waypoint arrows on the 'Next:' line; auto link clears the override.
  Auto-resyncs to server-derived on plan reload (fetchedAt change).
- ETA row labels live (chip 'live') vs scheduled (chip 'sched'); falls
  through to dash when neither is available."
```

---

## Task 16: ClockCard — TOC/TOD from progress, fallback to legacy

**Files:**
- Modify: `web/src/components/DataPanel/ClockCard.tsx`

- [ ] **Step 1: Wire `progress.eteToTocSec` / `eteToTodSec` with fallback**

In `web/src/components/DataPanel/ClockCard.tsx`, find the call:

```tsx
  const phase = computePhase(
    t?.altitude.msl,
    t?.verticalSpeed,
    t?.speed.ground,
    plan?.cruiseAltitudeFt,
    distToDest
  );
```

Replace with:

```tsx
  // Plan-driven TOC/TOD if the aggregator computed them; otherwise fall back
  // to the legacy VS/3:1 estimator. This is the only surviving fallback for
  // the legacy estimator in v1.3.
  const eteToToc = useFlightStore((s) => s.state.progress.eteToTocSec);
  const eteToTod = useFlightStore((s) => s.state.progress.eteToTodSec);

  let phase: Phase | null;
  if (eteToToc != null && eteToToc > 0) {
    phase = { label: 'TOC', tooltip: 'Top of climb (plan-derived)', sec: eteToToc };
  } else if (eteToTod != null && eteToTod > 0) {
    phase = { label: 'TOD', tooltip: 'Top of descent (plan-derived)', sec: eteToTod };
  } else {
    phase = computePhase(
      t?.altitude.msl,
      t?.verticalSpeed,
      t?.speed.ground,
      plan?.cruiseAltitudeFt,
      distToDest,
    );
  }
```

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; ClockCard clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/DataPanel/ClockCard.tsx
git commit -m "feat(web): ClockCard TOC/TOD countdown uses plan-derived ETEs

When progress.eteToTocSec / eteToTodSec are present (plan loaded), uses
them directly. Falls back to the legacy VS / 3:1 estimator when no plan
is loaded — graceful degradation, not the primary path."
```

---

## Task 17: FlightPlanCard — collapse / wrap / block-time fixes

**Files:**
- Modify: `web/src/components/DataPanel/FlightPlanCard.tsx`

- [ ] **Step 1: Use `plan.blockTimeSec` directly instead of derived value**

Find:

```tsx
  const blockTimeSec =
    plan.scheduledOut != null && plan.scheduledIn != null
      ? Math.max(0, Math.floor((plan.scheduledIn - plan.scheduledOut) / 1000))
      : null;
```

Replace with:

```tsx
  // Block time comes directly from Simbrief (plan.blockTimeSec). Falls back
  // to STA-derivation only if the OFP didn't include it, for back-compat.
  const blockTimeSec =
    plan.blockTimeSec ??
    (plan.scheduledOut != null && plan.scheduledIn != null
      ? Math.max(0, Math.floor((plan.scheduledIn - plan.scheduledOut) / 1000))
      : null);
```

- [ ] **Step 2: Fix expanded-view word-wrap**

Find:

```tsx
            style={{
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ff-fg-muted)',
              wordBreak: expanded ? 'break-all' : undefined,
            }}
```

Replace with:

```tsx
            style={{
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ff-fg-muted)',
              // Wrap at whitespace only; never break a fix name in the middle
              // (e.g. RUDAP must never render as RUD-AP).
              wordBreak: 'keep-all',
              overflowWrap: 'normal',
              whiteSpace: 'normal',
            }}
```

- [ ] **Step 3: Confirm collapsed-view two-line clamp is correct**

The `line-clamp-2` Tailwind utility is already applied:

```tsx
            className={`rounded-lg py-1 px-2 ml-[-8px] mr-[-8px] text-xs cursor-pointer ${
              expanded ? '' : 'line-clamp-2'
            }`}
```

The "third-line peeking" symptom usually comes from line-height inflation by HeroUI's tooltip border or container padding. Add an explicit `max-h` to the collapsed state so the clamp is tight:

```tsx
            className={`rounded-lg py-1 px-2 ml-[-8px] mr-[-8px] text-xs cursor-pointer ${
              expanded ? '' : 'line-clamp-2 max-h-[2.5rem] overflow-hidden'
            }`}
```

(The `2.5rem` accounts for `text-xs` line-height ~1.25 × 2 lines + a small fudge. Adjust during visual review if needed.)

- [ ] **Step 4: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; FlightPlanCard clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/FlightPlanCard.tsx
git commit -m "fix(web): FlightPlanCard — block time, wrap, collapse

- Use plan.blockTimeSec directly (Simbrief value); fall back to
  scheduledIn-scheduledOut derivation only if absent.
- Expanded view wraps at whitespace only (RUDAP stays whole).
- Collapsed view clamps to exactly two lines with max-h fix."
```

---

## Task 18: FlightPlanCard glyph progress overlay (option C with B fallback)

**Files:**
- Modify: `web/src/components/DataPanel/FlightPlanCard.tsx`

- [ ] **Step 1: Wire progress into the glyph component**

In `FlightPlanCard.tsx`, replace `AltitudeProfileGlyph`'s signature and SVG rendering. Find the function:

```tsx
function AltitudeProfileGlyph({ plan }: { plan: FlightPlan }) {
```

Replace with:

```tsx
function AltitudeProfileGlyph({ plan, progress }: { plan: FlightPlan; progress: number }) {
```

Find the `<svg>` element and add a clip-path-based progress overlay. Replace:

```tsx
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      style={{ color: 'var(--ff-fg-muted)' }}
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
```

With:

```tsx
  // Option C: keep the gradient; mask the unflown portion with a translucent
  // overlay so the flown side reads as more saturated. progress is 0..1,
  // matched to ProgressBar.
  const flownX = PAD + Math.max(0, Math.min(1, progress)) * (W - 2 * PAD);
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      style={{ color: 'var(--ff-fg-muted)' }}
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Translucent veil over the unflown portion */}
      <rect
        x={flownX}
        y={0}
        width={W - flownX}
        height={H}
        fill="var(--ff-bg)"
        opacity={0.4}
      />
    </svg>
  );
```

- [ ] **Step 2: Pass progress to the glyph**

Find the call site near the bottom of `FlightPlanCard`:

```tsx
          <AltitudeProfileGlyph plan={plan} />
```

Compute progress from the same source as ProgressBar:

```tsx
  const distToDest = useFlightStore((s) => s.state.progress.distanceToDestNm);
  const progressPct =
    plan.totalDistanceNm != null && distToDest != null
      ? Math.max(0, Math.min(1, 1 - distToDest / plan.totalDistanceNm))
      : 0;
```

(Add this near the existing `useFlightStore` call at the top of the function.)

Then pass it:

```tsx
          <AltitudeProfileGlyph plan={plan} progress={progressPct} />
```

- [ ] **Step 3: Visual review checkpoint**

After this commit lands, spin up the replay (`npm run dev:replay -- scripts/fixtures/replay-eddb-lipz.jsonl`) and inspect the glyph mid-flight. If the translucent veil reads as visual noise or duplicates the ProgressBar information, switch to **option B**: render the gradient *only* on the flown portion (unflown = neutral gray). To switch, replace the rect with a clip path on the polyline:

```tsx
      <defs>
        <clipPath id="ff-flown-clip">
          <rect x={0} y={0} width={flownX} height={H} />
        </clipPath>
      </defs>
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="var(--ff-fg-muted)"
        opacity={0.3}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        clipPath="url(#ff-flown-clip)"
      />
```

This is a single-render-path swap; commit separately if invoked.

- [ ] **Step 4: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: errors elsewhere; FlightPlanCard clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/FlightPlanCard.tsx
git commit -m "feat(web): FlightPlanCard glyph progress overlay (option C)

Translucent veil over the unflown portion of the altitude-profile glyph,
shrinks toward destination as the flight progresses. Visual review during
implementation may swap to option B (gradient on flown portion only) — see
spec § 4.7."
```

---

## Task 19: PositionCard TRK row + MotionCard altitude SimVar audit

**Files:**
- Modify: `web/src/components/DataPanel/PositionCard.tsx`
- Modify: `web/src/components/DataPanel/MotionCard.tsx`

- [ ] **Step 1: Add TRK row in `PositionCard.tsx`**

In `web/src/components/DataPanel/PositionCard.tsx`, after the HDG row's `</Row>`, add:

```tsx
        <Row label="TRK" tooltip="Ground track (true)">
          {t ? `${fmtNum(t.track.true, 0)}°T` : dash}
        </Row>
```

- [ ] **Step 2: Update Alt row in `MotionCard.tsx` to prefer indicated**

Find:

```tsx
        <Row label="Alt">
          {t ? (
            <span className="inline-flex items-center gap-2">
              <span>{fmtNum(t.altitude.msl, 0)} ft</span>
              <span className="minor">
                {t.verticalSpeed > 0 ? "↑" : t.verticalSpeed < 0 ? "↓" : ""}
                {fmtNum(Math.abs(t.verticalSpeed), 0)} fpm
              </span>
            </span>
          ) : (
            dash
          )}
        </Row>
```

Replace with:

```tsx
        <Row label="Alt" tooltip="Indicated altitude (mirrors cockpit altimeter); falls back to MSL when indicated is unavailable">
          {t ? (
            <span className="inline-flex items-center gap-2">
              <span>{fmtNum(t.altitude.indicated ?? t.altitude.msl, 0)} ft</span>
              <span className="minor">
                {t.verticalSpeed > 0 ? "↑" : t.verticalSpeed < 0 ? "↓" : ""}
                {fmtNum(Math.abs(t.verticalSpeed), 0)} fpm
              </span>
            </span>
          ) : (
            dash
          )}
        </Row>
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: clean.

- [ ] **Step 4: Production build smoke**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/PositionCard.tsx web/src/components/DataPanel/MotionCard.tsx
git commit -m "feat(web): TRK row + altitude SimVar audit

- PositionCard: TRK row beside HDG (true ground track, suffix °T).
- MotionCard: Alt row prefers altitude.indicated (cockpit instrument) and
  falls back to altitude.msl. See docs/notes/altitude-vocabulary.md."
```

---

## Milestone 4 checkpoint

End of card work. Verify:

```bash
npm test
npx tsc -p server --noEmit
npx tsc -p web --noEmit
npm run build
```

Expected: all green.

Replay smoke against `replay-eddb-lipz.jsonl` and inspect:
- Trip card: progress bar fills as flight progresses; ETA chip flips between `live` and `sched` correctly.
- Skip arrows: clicking ▶ advances next-waypoint; clicking auto returns to server-derived; reloading the plan via Settings auto-resets the override.
- Clock card: TOC/TOD shows non-jittery values when plan is loaded; falls back to legacy estimator when plan is unloaded.
- FlightPlanCard: collapsed shows exactly two lines; expanded wraps at whitespace; glyph shows progress overlay; block time matches Simbrief value.
- PositionCard: TRK row visible.
- MotionCard: Alt reads from indicated when available.

---

## Milestone 5 — Final polish, docs, integration smoke (Tasks 20–22)

---

## Task 20: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Features list**

In `README.md`, find the Features bullet list and append:

```markdown
- Breadcrumb trail color-coded by altitude, sharing the FlightPlanCard glyph palette.
- Plan-driven TOC / TOD markers on the map and ETE countdowns in the Clock card.
- Skip-waypoint arrows (◀ ▶) for manual stepping; auto-resyncs on plan reload.
- Origin → destination progress timeline in TripCard with TOC / current / TOD ticks.
- Live ETA from `eteToDestSec` (chip `live` / `sched` distinguishes derived from scheduled).
- Alternate airport rendered in blue with hover tooltip; origin / destination keep fixed labels.
- TRK (true track) row in PositionCard alongside magnetic HDG.
```

Also update the Stack note if you want — v1.3 doesn't add libraries; the existing v1.2 stack note still applies.

Also update the Documents list to include the v1.3 spec and plan:

```markdown
- [v1.3 design](./docs/superpowers/specs/2026-05-01-flight-follower-v1.3-design.md) and [v1.3 plan](./docs/superpowers/plans/2026-05-01-flight-follower-v1.3.md)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README — v1.3 features and references

Adds gradient breadcrumb, TOC/TOD markers, skip-waypoint, progress
timeline, live ETA, alternate marker, and TRK to the feature list."
```

---

## Task 21: Backlog updates — mark v1.3 items as shipped

**Files:**
- Modify: `docs/backlog.md`

- [ ] **Step 1: Move the v1.3 in-progress block into the shipped section**

In `docs/backlog.md`:

Find the `### v1.3 (in progress)` heading and rewrite the entire scheduled block. Move v1.3 below the v1.2 line in the "Already shipped" section:

```markdown
- **v1.3** ✅ — flight progress release: breadcrumb altitude gradient, plan-driven TOC/TOD markers + ETE countdown, skip-waypoint with auto-resync, origin → destination progress timeline, live ETA, alternate on map, FlightPlanCard glyph progress overlay. Polish: FlightPlanCard collapse/wrap, map mode promotion, true-vs-magnetic plane-icon rotation, altitude SimVar audit, TRK row, min-zoom, light-mode tooltip, times vocabulary alignment. Spike outcome: [CLEAN | NOT CLEAN] — [link to docs/notes/spike-waypoint-constraints.md].
```

Remove the `### v1.3 (in progress)` block entirely. The file's structure is now: shipped → v1.4 → v1.5 → v1.6+ → carryovers (unchanged).

- [ ] **Step 2: Commit**

```bash
git add docs/backlog.md
git commit -m "docs: backlog — mark v1.3 as shipped

Moves the v1.3 entry into the shipped section. Forward roadmap
(v1.4 personalization, v1.5 responsive, v1.6+ platform) unchanged."
```

---

## Task 22: Final integration smoke

**Files:** none modified. Manual verification only.

- [ ] **Step 1: Full automated suite**

```bash
npm test
npx tsc -p server --noEmit
npx tsc -p web --noEmit
npm run build
```

Expected: all green.

- [ ] **Step 2: Replay smoke — EDDB → LIPZ**

Run:

```bash
FF_STATIC_PATH="$(pwd)/web/dist" npm run dev:replay -- scripts/fixtures/replay-eddb-lipz.jsonl
```

In another terminal:

```bash
npm --workspace web run dev
```

Visit `http://localhost:5173` and verify:

- [ ] Breadcrumb segments visibly transition through altitude colors as the recorded flight climbs and descends.
- [ ] TOC marker appears at a sensible map position around the level-off altitude; TOD marker appears around the descent point. Both stay visible after passing.
- [ ] Clock card shows "TOC in N min" derived from plan position rather than VS jitter (note specifically during stepped climbs).
- [ ] Progress timeline in TripCard fills from origin to current position, with TOC/TOD ticks at sensible percentages.
- [ ] ETA row reads "ETA HH:MMz" with `live` chip; resetting the plan via Settings flips it to `sched`.
- [ ] Skip-waypoint arrows let the user step through fixes; clicking "auto" returns to server-derived; reloading the plan auto-resyncs without bouncing back to the first fix.
- [ ] Alternate marker shows in blue with hover tooltip (no fixed label).

- [ ] **Step 3: Replay smoke — NZQN → NZWN**

Repeat with `scripts/fixtures/replay-nzqn-nzwn.jsonl` and verify:

- [ ] Map plane icon rotation aligns with the displayed track on the breadcrumb at high-magvar latitude.
- [ ] Wind compass arrow direction reads sensibly relative to the cockpit-style HDG.
- [ ] Go-around portion: aircraft visibly climbs, levels off near origin, re-approaches. No crashes; no breadcrumb anomalies.

- [ ] **Step 4: Static general checks**

- [ ] FlightPlanCard collapsed shows exactly two lines, no peeking third.
- [ ] FlightPlanCard expanded wraps fix names cleanly (`RUDAP` whole, never `RUD-AP`).
- [ ] Zooming out of Overview promotes to Manual; clicking Overview when active is a no-op.
- [ ] Min-zoom prevents tile-grid wraparound.
- [ ] Light-mode map tooltip is more legible than v1.2.
- [ ] Glyph progress overlay reads cleanly mid-flight (decide option C vs B; if B is better, run the Task 18 step 3 swap and commit).

- [ ] **Step 5: Final commit if any tweaks**

If the visual review surfaced minor tweaks (tooltip opacity number, glyph option, palette stops), commit them with a clear message. Otherwise, no final commit needed.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/v1.3-implementation
```

Open a PR against `main` titled `flight-follower v1.3 — flight progress`.

---

## Done

End of plan. v1.3 ships with all flight-progress features, the targeted bug-fix pass, two new fixtures committed (Task 0 / pre-plan), and updated docs.
