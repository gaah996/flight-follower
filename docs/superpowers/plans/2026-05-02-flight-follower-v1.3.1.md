# Flight Follower v1.3.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five surgical bug fixes from the v1.3 real-flight retro (LFPG → LEPA), plus one DX extension that closes the replay/record loop end-to-end.

**Architecture:** Two new pure server-side helpers (`routeRemainingNm`, `advancePassedIndexWindowed`); the aggregator is rewired to use them in `computeProgress`. The Simbrief client gains a file-loading sibling and returns the raw OFP alongside the parsed plan. The HTTP `/api/simbrief/fetch` handler becomes fixture-aware (read-from-disk in dev) and write-on-success (sibling-OFP capture during recording). FE changes are CSS-only — moving a clamp onto an inner element and tidying the alternate-chip row.

**Tech Stack:** TypeScript, Node 20, Fastify, Vitest, React 19, Tailwind v4, HeroUI v3.

**Branch:** `feat/v1.3.1-bugfix` (already created).

**Spec:** [`docs/superpowers/specs/2026-05-02-flight-follower-v1.3.1-design.md`](../specs/2026-05-02-flight-follower-v1.3.1-design.md).

---

## Task 1: `routeRemainingNm` helper (item 4.3)

**Files:**

- Create: `server/src/route-math/route-progress.ts`
- Create: `server/src/route-math/route-progress.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// server/src/route-math/route-progress.test.ts
import { describe, expect, it } from 'vitest';
import type { FlightPlan } from '@ff/shared';
import { routeRemainingNm } from './route-progress.js';

const planSingleLeg: FlightPlan = {
  fetchedAt: 0,
  origin: { icao: 'AAAA', lat: 0, lon: 0 },
  destination: { icao: 'BBBB', lat: 0, lon: 10 },
  waypoints: [],
};

const planMultiLeg: FlightPlan = {
  fetchedAt: 0,
  origin: { icao: 'AAAA', lat: 0, lon: 0 },
  destination: { icao: 'BBBB', lat: 0, lon: 10 },
  waypoints: [
    { ident: 'W1', lat: 0, lon: 2 },
    { ident: 'W2', lat: 0, lon: 5 },
    { ident: 'W3', lat: 0, lon: 8 },
  ],
};

describe('routeRemainingNm', () => {
  it('returns near total for a single-leg plan with aircraft at origin', () => {
    const r = routeRemainingNm({ lat: 0, lon: 0 }, planSingleLeg, -1);
    // 10° at the equator ≈ 600 nm.
    expect(r).toBeGreaterThan(595);
    expect(r).toBeLessThan(605);
  });

  it('returns 0 for a single-leg plan with aircraft at destination', () => {
    const r = routeRemainingNm({ lat: 0, lon: 10 }, planSingleLeg, -1);
    expect(r).toBeCloseTo(0, 1);
  });

  it('clamps to 0 when aircraft is past the destination on a single-leg plan', () => {
    const r = routeRemainingNm({ lat: 0, lon: 12 }, planSingleLeg, -1);
    expect(r).toBeCloseTo(0, 1);
  });

  it('multi-leg, aircraft at origin: returns ~ sum of all leg distances', () => {
    // 10° at the equator ≈ 600 nm spread across origin→W1 (2°) + W1→W2 (3°)
    // + W2→W3 (3°) + W3→destination (2°). Total 10° ≈ 600 nm.
    const r = routeRemainingNm({ lat: 0, lon: 0 }, planMultiLeg, -1);
    expect(r).toBeGreaterThan(595);
    expect(r).toBeLessThan(605);
  });

  it('multi-leg, aircraft mid-leg [origin → W1] (passedIndex = -1)', () => {
    // Aircraft at lon 1: along-track on origin→W1 is ~60 nm out of ~120 nm.
    // Remaining = (W1 leg's other half ~60) + W1→W2 (180) + W2→W3 (180) +
    // W3→dest (120) ≈ 540 nm.
    const r = routeRemainingNm({ lat: 0, lon: 1 }, planMultiLeg, -1);
    expect(r).toBeGreaterThan(530);
    expect(r).toBeLessThan(550);
  });

  it('multi-leg, aircraft just past last waypoint (passedIndex = 2)', () => {
    // Current leg is W3→destination = (0,8) → (0,10). Aircraft at lon 9:
    // along-track = ~60 nm; legNm = ~120 nm. Remainder ≈ 60 nm. No further legs.
    const r = routeRemainingNm({ lat: 0, lon: 9 }, planMultiLeg, 2);
    expect(r).toBeGreaterThan(55);
    expect(r).toBeLessThan(65);
  });

  it('multi-leg, aircraft past destination on the last leg', () => {
    const r = routeRemainingNm({ lat: 0, lon: 11 }, planMultiLeg, 2);
    expect(r).toBeCloseTo(0, 1);
  });

  it('multi-leg, aircraft off-track: uses leg natural length, not pos→dest geodesic', () => {
    // Aircraft 100 nm north of the route midpoint. With passedIndex = 0
    // (current leg is W1→W2), the answer should be (current leg remainder)
    // + W2→W3 + W3→dest ≈ same order as on-track at lon 3.5.
    // Aircraft at lon 3.5 lat 1.66 (~100nm north): along on W1→W2 = ~90 nm
    // (1.5° east), legNm = 180 nm, remainder = ~90 nm. Plus 180 + 120 = ~390.
    const offTrack = routeRemainingNm({ lat: 1.66, lon: 3.5 }, planMultiLeg, 0);
    // The exact value depends on great-circle along-track at non-zero lat;
    // assert it's in the expected range for an on-route flight.
    expect(offTrack).toBeGreaterThan(360);
    expect(offTrack).toBeLessThan(420);
  });

  it('handles a degenerate zero-length leg without throwing', () => {
    const planWithDup: FlightPlan = {
      ...planMultiLeg,
      waypoints: [
        { ident: 'W1', lat: 0, lon: 2 },
        { ident: 'W1B', lat: 0, lon: 2 }, // duplicate position
        { ident: 'W2', lat: 0, lon: 5 },
      ],
    };
    expect(() => routeRemainingNm({ lat: 0, lon: 0 }, planWithDup, -1)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail.**

```bash
npm --workspace server run test -- route-progress
```

Expected: FAIL with "Cannot find module './route-progress.js'" or similar.

- [ ] **Step 3: Write the implementation.**

```ts
// server/src/route-math/route-progress.ts
import type { FlightPlan, LatLon } from '@ff/shared';
import { haversineNm } from './distance.js';
import { alongTrackNm } from './progress.js';

/**
 * Route-following distance to destination in nautical miles: along-track
 * remainder of the current leg + sum of remaining leg lengths.
 *
 * passedIndex is interpreted in the FlightPlan.waypoints array (existing
 * convention): -1 means no waypoint passed yet (current leg is origin →
 * waypoints[0]); N-1 means past the last named waypoint (current leg is
 * lastWaypoint → destination). When waypoints is empty, the route is a
 * single leg origin → destination.
 */
export function routeRemainingNm(
  pos: LatLon,
  plan: FlightPlan,
  passedIndex: number,
): number {
  // Build the combined route. legCount = combined.length - 1.
  const combined: LatLon[] = [
    plan.origin,
    ...plan.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
    plan.destination,
  ];
  // Current leg in combined-list space = passedIndex + 1.
  // (passedIndex = -1 → current leg index = 0 = [origin, waypoints[0]].)
  const currentLegIdx = Math.max(0, passedIndex + 1);
  if (currentLegIdx >= combined.length - 1) {
    // We are on or past the final leg's end (destination). Nothing remains.
    return 0;
  }

  const a = combined[currentLegIdx]!;
  const b = combined[currentLegIdx + 1]!;
  const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
  let currentLegRemainder: number;
  if (legNm === 0) {
    currentLegRemainder = 0;
  } else {
    const along = alongTrackNm(pos, a, b);
    const alongClamped = Math.max(0, Math.min(legNm, along));
    currentLegRemainder = legNm - alongClamped;
  }

  let restNm = 0;
  for (let i = currentLegIdx + 1; i < combined.length - 1; i++) {
    restNm += haversineNm(
      combined[i]!.lat,
      combined[i]!.lon,
      combined[i + 1]!.lat,
      combined[i + 1]!.lon,
    );
  }

  return currentLegRemainder + restNm;
}
```

- [ ] **Step 4: Run tests to verify they pass.**

```bash
npm --workspace server run test -- route-progress
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit.**

```bash
git add server/src/route-math/route-progress.ts server/src/route-math/route-progress.test.ts
git commit -m "$(cat <<'EOF'
feat(server): routeRemainingNm — route-following distance helper

Pure helper used by the aggregator to compute distanceToDestNm as
"along-track remainder of current leg + sum of remaining leg lengths"
rather than the great-circle straight line.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `advancePassedIndexWindowed` helper (item 4.4)

**Files:**

- Modify: `server/src/route-math/progress.ts` (add export)
- Modify: `server/src/route-math/progress.test.ts` (add cases)

- [ ] **Step 1: Add the failing tests to `progress.test.ts`.**

Append at the bottom of the file:

```ts
import { advancePassedIndexWindowed } from './progress.js';

describe('advancePassedIndexWindowed', () => {
  // Reuses `wpts` declared at the top of this file (A,B,C at lon 0,1,2).

  it('does not advance from -1 when aircraft is far north of all waypoints', () => {
    // Window at passedIndex=-1 covers leg [0,1] only. Aircraft at lat 5 lon 0
    // is far north; bearing from A to pos differs from A→B (east), so
    // along-track is small or negative. No advance.
    expect(advancePassedIndexWindowed({ lat: 5, lon: 0 }, wpts, -1)).toBe(-1);
  });

  it('advances to 0 when aircraft is past A on leg [A,B]', () => {
    // Aircraft 0.6° east of A: along-track on [A,B] ~36 nm out of ~60 nm.
    expect(advancePassedIndexWindowed({ lat: 0, lon: 0.6 }, wpts, -1)).toBe(0);
  });

  it('advances to 1 when along-track on [A,B] exceeds legNm', () => {
    expect(advancePassedIndexWindowed({ lat: 0, lon: 1.05 }, wpts, -1)).toBe(1);
  });

  it('advances to 2 when on leg [B,C] past C', () => {
    expect(advancePassedIndexWindowed({ lat: 0, lon: 2.05 }, wpts, 1)).toBe(2);
  });

  it('forward-only: never returns less than currentPassedIndex', () => {
    expect(advancePassedIndexWindowed({ lat: -5, lon: 0 }, wpts, 1)).toBe(1);
  });

  it('returns currentPassedIndex unchanged when waypoints has fewer than 2 elements', () => {
    expect(advancePassedIndexWindowed({ lat: 0, lon: 0 }, [], -1)).toBe(-1);
    expect(advancePassedIndexWindowed({ lat: 0, lon: 0 }, [wpts[0]!], -1)).toBe(-1);
  });

  it('regression: does not consider out-of-window legs at the route start (LFPG-shape)', () => {
    // Synthetic doubling-back route: leg [3,4] (C → D) points NORTH (43°N
    // → 44°N). Aircraft at origin (49°N) lies on the bearing-extension of
    // C → D. Full-scan findPassedIndex returns >= 3 for this position;
    // windowed at passedIndex=-1 must return -1 because legs [3,4] and
    // beyond are outside the window [0,1] when N=5 waypoints.
    const lfpgShape = [
      { ident: 'A', lat: 47, lon: 0 },
      { ident: 'B', lat: 45, lon: 0 },
      { ident: 'C', lat: 43, lon: 0 },
      { ident: 'D', lat: 44, lon: 0 }, // doubles back north 1°
      { ident: 'E', lat: 40, lon: 0 },
    ];
    expect(advancePassedIndexWindowed({ lat: 49, lon: 0 }, lfpgShape, -1)).toBe(-1);
    // Sanity: the unbounded variant DOES misfire here (this is the bug we
    // are fixing — kept as a regression anchor; if findPassedIndex is ever
    // refined we'll re-evaluate this assertion).
    expect(findPassedIndex({ lat: 49, lon: 0 }, lfpgShape)).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail.**

```bash
npm --workspace server run test -- progress.test
```

Expected: FAIL with "advancePassedIndexWindowed is not a function" or similar.

- [ ] **Step 3: Add the implementation to `progress.ts`.**

Append at the bottom of the file:

```ts
/**
 * Per-tick advancement bounded to a window of legs around the current
 * cursor. Considers legs [i, i+1] where i is in
 *   [max(0, currentPassedIndex - 1), min(waypoints.length - 2, currentPassedIndex + 2)].
 * Within that window, applies the same along-track logic as findPassedIndex
 * (project pos onto leg [i, i+1]; advance to i+1 when along >= legNm,
 * otherwise mark i as passed when along > 0); takes the max with
 * currentPassedIndex (forward-only).
 *
 * Why a window: full-scan along-track misfires when pos is far from a leg
 * but roughly collinear with it (e.g. at the LFPG origin, a near-destination
 * leg's bearing aligns with the bearing from that leg's start back to LFPG;
 * along-track returns a large positive value despite pos being hundreds of
 * nm away). Reconciliation only needs to look near the current expected
 * position; arbitrary-distance jumps across the route are not a real
 * telemetry-tick scenario.
 */
export function advancePassedIndexWindowed(
  pos: LatLon,
  waypoints: Waypoint[],
  currentPassedIndex: number,
): number {
  if (waypoints.length < 2) return currentPassedIndex;
  const lo = Math.max(0, currentPassedIndex - 1);
  const hi = Math.min(waypoints.length - 2, currentPassedIndex + 2);
  let passed = currentPassedIndex;
  for (let i = lo; i <= hi; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const legNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    if (legNm === 0) continue;
    const along = alongTrackNm(pos, a, b);
    if (along >= legNm) {
      if (i + 1 > passed) passed = i + 1;
    } else if (along > 0) {
      if (i > passed) passed = i;
    }
  }
  return passed;
}
```

- [ ] **Step 4: Run tests to verify they pass.**

```bash
npm --workspace server run test -- progress.test
```

Expected: PASS, all new tests green; existing `findPassedIndex` / `advancePassedIndex` / `alongTrackNm` tests still green.

- [ ] **Step 5: Commit.**

```bash
git add server/src/route-math/progress.ts server/src/route-math/progress.test.ts
git commit -m "$(cat <<'EOF'
feat(server): advancePassedIndexWindowed — bounded reconciliation

Per-tick replacement for full-scan findPassedIndex. Looks only at legs in
[passedIndex-1, passedIndex+2]. Eliminates the misfire where a far-ahead
leg's bearing happens to align with the aircraft's bearing from that
leg's start (e.g. LFPG origin against a doubling-back near-destination
leg).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire aggregator to the new helpers (items 4.3 + 4.4)

**Files:**

- Modify: `server/src/state/aggregator.ts`
- Modify: `server/src/state/aggregator.test.ts`

- [ ] **Step 1: Update aggregator.ts.**

Replace the imports near the top:

```ts
import { haversineNm } from '../route-math/distance.js';
import { advancePassedIndex, advancePassedIndexWindowed, alongTrackNm, distanceToWaypointNm, eteSeconds, findPassedIndex } from '../route-math/progress.js';
import { findTOC, findTOD } from '../route-math/cruise-points.js';
import { routeRemainingNm } from '../route-math/route-progress.js';
```

Then, in `computeProgress`, replace the `closePassIdx`/`projectedIdx` block and the `distDest` line. The relevant section currently looks like:

```ts
    const closePassIdx = advancePassedIndex(
      t.position,
      plan.waypoints,
      this.passedIndex,
      WAYPOINT_PASS_THRESHOLD_NM,
    );
    const projectedIdx = findPassedIndex(t.position, plan.waypoints);
    this.passedIndex = Math.max(this.passedIndex, closePassIdx, projectedIdx);
    const nextIdx = this.passedIndex + 1;
    const nextWp = plan.waypoints[nextIdx] ?? null;
    const distNext = nextWp ? distanceToWaypointNm(t.position, nextWp) : null;
    const distDest = haversineNm(t.position.lat, t.position.lon, plan.destination.lat, plan.destination.lon);
```

Change it to:

```ts
    const closePassIdx = advancePassedIndex(
      t.position,
      plan.waypoints,
      this.passedIndex,
      WAYPOINT_PASS_THRESHOLD_NM,
    );
    const windowedIdx = advancePassedIndexWindowed(
      t.position,
      plan.waypoints,
      this.passedIndex,
    );
    this.passedIndex = Math.max(this.passedIndex, closePassIdx, windowedIdx);
    const nextIdx = this.passedIndex + 1;
    const nextWp = plan.waypoints[nextIdx] ?? null;
    const distNext = nextWp ? distanceToWaypointNm(t.position, nextWp) : null;
    const distDest = routeRemainingNm(t.position, plan, this.passedIndex);
```

Note: `findPassedIndex` is still imported and used by `setPlan` (mid-flight resume seed) — leave that call in `setPlan` exactly as it is. The unused import warning would not apply because `setPlan` still references it.

- [ ] **Step 2: Update aggregator.test.ts assertions where the change in `distanceToDestNm` semantics matters.**

The test `picks the first unpassed waypoint when a plan is set` asserts:

```ts
expect(s.progress.distanceToDestNm).toBeGreaterThan(s.progress.distanceToNextNm ?? 0);
```

That assertion still holds with route-following (route-remaining ≥ leg-remaining ≥ distance-to-next). No change needed. But re-run all tests to confirm.

The test `computes ETE using ground speed` only checks `eteToDestSec > 0`. Still holds.

- [ ] **Step 3: Add a regression test for the LFPG-shape misfire to aggregator.test.ts.**

Append to the `describe('Aggregator progress', ...)` block:

```ts
  it('does not jump ahead at the route start when a far leg points back toward origin', () => {
    // Regression for the LFPG → LEPA bug: a far leg pointing roughly back
    // toward the aircraft would, with the old per-tick full-scan
    // findPassedIndex, advance the cursor mid-route on the very first
    // telemetry tick after plan-load.
    const PLAN_LFPG_SHAPE: FlightPlan = {
      fetchedAt: 0,
      origin: { icao: 'AAAA', lat: 49, lon: 0 },
      destination: { icao: 'BBBB', lat: 38, lon: 0 },
      waypoints: [
        { ident: 'W1', lat: 47, lon: 0 },
        { ident: 'W2', lat: 45, lon: 0 },
        { ident: 'W3', lat: 43, lon: 0 },
        { ident: 'W4', lat: 44, lon: 0 }, // doubles back north 1°
        { ident: 'W5', lat: 40, lon: 0 },
      ],
    };
    const a = new Aggregator();
    a.setPlan(PLAN_LFPG_SHAPE);
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 49, lon: 0 },
        onGround: true,
        speed: { ground: 5, indicated: 5, mach: 0 },
      }),
    );
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W1');
  });
```

- [ ] **Step 4: Run all aggregator tests to verify everything passes.**

```bash
npm --workspace server run test -- aggregator
```

Expected: PASS, including the new regression test, all existing tests green.

- [ ] **Step 5: Run the full server test suite to catch any cross-file regression.**

```bash
npm --workspace server run test
```

Expected: PASS across `route-math`, `state/aggregator`, `simbrief/parser`.

- [ ] **Step 6: Commit.**

```bash
git add server/src/state/aggregator.ts server/src/state/aggregator.test.ts
git commit -m "$(cat <<'EOF'
fix(server): route-following distanceToDestNm + windowed reconciliation

computeProgress now uses routeRemainingNm for distanceToDestNm (and so
eteToDestSec follows automatically) and advancePassedIndexWindowed for
per-tick cursor advancement. Fixes the LFPG → LEPA bug where a far leg's
bearing alignment with the origin caused a momentary misfire to be
captured by Math.max and stick.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update `distanceToDestNm` JSDoc (item 4.3 polish)

**Files:**

- Modify: `shared/types.ts`

- [ ] **Step 1: Add a JSDoc comment.**

Find the `FlightProgress` type in `shared/types.ts` and update the `distanceToDestNm` line. Replace:

```ts
  distanceToDestNm: number | null;
```

with:

```ts
  /**
   * Route-following distance to destination in nautical miles: along-track
   * remainder of the current leg + sum of remaining leg distances.
   * Replaced great-circle semantics in v1.3.1.
   */
  distanceToDestNm: number | null;
```

- [ ] **Step 2: Run typechecks to confirm no type-shape drift.**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add shared/types.ts
git commit -m "$(cat <<'EOF'
docs(shared): clarify distanceToDestNm route-following semantics

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `fetchLatestOfp` returns `{ raw, plan }` (item 4.2.3 prep)

**Files:**

- Modify: `server/src/simbrief/client.ts`
- Modify: `server/src/transport/http.ts` (single caller)

- [ ] **Step 1: Update `fetchLatestOfp` return shape.**

Replace the function body in `server/src/simbrief/client.ts`. The current function ends with:

```ts
  try {
    return parseSimbriefOfp(json);
  } catch (err) {
    throw new SimbriefError('BAD_OFP', `Simbrief OFP failed validation: ${(err as Error).message}`);
  }
}
```

Change it to:

```ts
  try {
    return { raw: json, plan: parseSimbriefOfp(json) };
  } catch (err) {
    throw new SimbriefError('BAD_OFP', `Simbrief OFP failed validation: ${(err as Error).message}`);
  }
}
```

And update the function's return-type annotation. The signature line:

```ts
export async function fetchLatestOfp(userId: string): Promise<FlightPlan> {
```

becomes:

```ts
export async function fetchLatestOfp(userId: string): Promise<{ raw: unknown; plan: FlightPlan }> {
```

- [ ] **Step 2: Update the single caller in `server/src/transport/http.ts`.**

Find this block:

```ts
    try {
      const plan = await fetchLatestOfp(settings.simbriefUserId);
      opts.aggregator.setPlan(plan);
      return plan;
    } catch (err) {
```

Change to:

```ts
    try {
      const { plan } = await fetchLatestOfp(settings.simbriefUserId);
      opts.aggregator.setPlan(plan);
      return plan;
    } catch (err) {
```

(The raw is unused for now; Task 8 introduces the sibling-write that consumes it.)

- [ ] **Step 3: Run typechecks.**

```bash
npm run typecheck
```

Expected: PASS — only the destructure changed; no other callers exist.

- [ ] **Step 4: Run server tests.**

```bash
npm --workspace server run test
```

Expected: PASS — `simbrief/parser.test.ts` is unaffected (it tests `parseSimbriefOfp` directly).

- [ ] **Step 5: Commit.**

```bash
git add server/src/simbrief/client.ts server/src/transport/http.ts
git commit -m "$(cat <<'EOF'
refactor(server): fetchLatestOfp returns { raw, plan }

Prepares for the sibling-OFP write during recording (item 4.2.3) by
exposing the raw OFP alongside the parsed FlightPlan. Single caller
updated to destructure plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `loadOfpFromFile` and `siblingOfpPath` helpers (item 4.2)

**Files:**

- Modify: `server/src/simbrief/client.ts` (add two exports)
- Create: `server/src/simbrief/client.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// server/src/simbrief/client.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail.**

```bash
npm --workspace server run test -- simbrief/client
```

Expected: FAIL — `loadOfpFromFile` and `siblingOfpPath` are not yet exported.

- [ ] **Step 3: Add the two helpers to `server/src/simbrief/client.ts`.**

Add these imports near the top of the file:

```ts
import { readFile } from 'node:fs/promises';
```

Append at the bottom of the file (after `fetchLatestOfp`):

```ts
/**
 * Load a Simbrief OFP from a file on disk and parse it. Mirrors
 * fetchLatestOfp's return shape so the HTTP handler can use either source
 * interchangeably.
 *
 * Errors are wrapped in SimbriefError with code:
 *   FIXTURE_NOT_FOUND — file does not exist or cannot be read.
 *   FIXTURE_BAD_JSON  — file contents fail JSON.parse.
 *   FIXTURE_BAD_OFP   — JSON parsed but failed parseSimbriefOfp validation.
 */
export async function loadOfpFromFile(path: string): Promise<{ raw: unknown; plan: FlightPlan }> {
  let buf: string;
  try {
    buf = await readFile(path, 'utf8');
  } catch (err) {
    throw new SimbriefError('FIXTURE_NOT_FOUND', `OFP fixture not readable at ${path}: ${(err as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(buf);
  } catch {
    throw new SimbriefError('FIXTURE_BAD_JSON', `OFP fixture at ${path} is not valid JSON`);
  }
  try {
    return { raw, plan: parseSimbriefOfp(raw) };
  } catch (err) {
    throw new SimbriefError('FIXTURE_BAD_OFP', `OFP fixture at ${path} failed validation: ${(err as Error).message}`);
  }
}

/**
 * Return the sibling .ofp.json path for a given recording or replay file.
 *   /abs/path/replay-foo.jsonl  → /abs/path/replay-foo.ofp.json
 *   /abs/path/replay-foo        → /abs/path/replay-foo.ofp.json
 *   /abs/path/replay-foo.bin    → /abs/path/replay-foo.ofp.json
 */
export function siblingOfpPath(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const dir = filePath.slice(0, lastSlash + 1);
  const base = filePath.slice(lastSlash + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${dir}${stem}.ofp.json`;
}
```

- [ ] **Step 4: Run tests to verify they pass.**

```bash
npm --workspace server run test -- simbrief/client
```

Expected: PASS, all five tests green.

- [ ] **Step 5: Commit.**

```bash
git add server/src/simbrief/client.ts server/src/simbrief/client.test.ts
git commit -m "$(cat <<'EOF'
feat(server): loadOfpFromFile + siblingOfpPath helpers

Prepares the fixture-aware /api/simbrief/fetch path (read-from-disk in dev)
and the sibling-OFP write during recording.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Fixture-aware `/api/simbrief/fetch` (items 4.2.2 + 4.2.3)

**Files:**

- Modify: `server/src/transport/http.ts`

This task has no automated tests (HTTP layer has no test scaffolding in this codebase by convention); manual verification covers it in Task 12.

- [ ] **Step 1: Extend `HttpOptions` and the handler.**

In `server/src/transport/http.ts`, update the `HttpOptions` type:

```ts
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
```

Update the imports near the top of the file:

```ts
import { writeFile } from 'node:fs/promises';
import { fetchLatestOfp, loadOfpFromFile, siblingOfpPath, SimbriefError } from '../simbrief/client.js';
```

Replace the entire `app.post('/api/simbrief/fetch', ...)` handler with:

```ts
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
          await writeFile(ofpPath, JSON.stringify(raw, null, 2), 'utf8');
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
```

- [ ] **Step 2: Run typechecks.**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run server tests (sanity).**

```bash
npm --workspace server run test
```

Expected: PASS — no test exercises the HTTP layer; this just confirms no type-level regression in shared imports.

- [ ] **Step 4: Commit.**

```bash
git add server/src/transport/http.ts
git commit -m "$(cat <<'EOF'
feat(server): fixture-aware /api/simbrief/fetch + record-time OFP capture

When simbriefFixturePath is set, the endpoint reads the OFP from disk
instead of hitting Simbrief (dev replay). When recordPath is set and
fixture mode is unset, a successful Simbrief fetch also writes the raw
OFP to a sibling path so the recorded .jsonl is paired with its OFP.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Thread new options through `start()` (item 4.2)

**Files:**

- Modify: `server/src/index.ts`

- [ ] **Step 1: Extend `StartOptions` and pass through to `buildHttpApp`.**

Update the `StartOptions` type:

```ts
export type StartOptions = {
  configPath: string;
  staticPath: string;
  port: number;
  host?: string;
  disableSim?: boolean;
  recordPath?: string;
  /** When set, /api/simbrief/fetch reads from this file instead of the network. Dev-only. */
  simbriefFixturePath?: string;
};
```

In the body of `start()`, find:

```ts
  const app = await buildHttpApp({
    aggregator,
    settingsPath: opts.configPath,
    staticPath: opts.staticPath,
  });
```

Change to:

```ts
  const app = await buildHttpApp({
    aggregator,
    settingsPath: opts.configPath,
    staticPath: opts.staticPath,
    simbriefFixturePath: opts.simbriefFixturePath,
    recordPath: opts.recordPath,
  });
```

- [ ] **Step 2: Run typechecks.**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): thread simbriefFixturePath + recordPath into HTTP app

Surfaces the new dev-only HTTP options on StartOptions so the replay
harness (Task 9) can request fixture-aware behaviour, and the existing
record path is now visible to the HTTP layer for sibling-OFP writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Replay harness — sibling discovery, auto-load, fixture mode (item 4.2.1 + 4.2.2)

**Files:**

- Modify: `scripts/dev-telemetry-replay.ts`

- [ ] **Step 1: Add sibling-OFP discovery, auto-load, and option threading.**

Update the imports near the top of `scripts/dev-telemetry-replay.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawTelemetry } from '@ff/shared';
import { loadOfpFromFile, siblingOfpPath } from '../server/src/simbrief/client.js';
import { start } from '../server/src/index.js';
```

Inside `main()`, after the existing block that resolves `fixturePath`, add the sibling-OFP discovery:

```ts
  // Sibling OFP discovery: env var > sibling by basename > none.
  const envOfp = process.env.FF_PLAN_FIXTURE_PATH;
  const candidate = envOfp ? resolve(userCwd, envOfp) : siblingOfpPath(fixturePath);
  const planFixturePath = existsSync(candidate) ? candidate : null;
```

Then, when calling `start({...})`, pass the new option:

```ts
  const running = await start({
    configPath: join(repoRoot, 'server', '.data', 'settings.json'),
    staticPath: join(repoRoot, 'web', 'dist'),
    port: Number(process.env.FF_PORT ?? 4444),
    disableSim: true,
    simbriefFixturePath: planFixturePath ?? undefined,
  });
```

After `running.aggregator.setConnected(true);`, add an auto-load before the timer fires:

```ts
  if (planFixturePath) {
    try {
      const { plan } = await loadOfpFromFile(planFixturePath);
      running.aggregator.setPlan(plan);
      console.log(`[replay] loaded plan fixture from ${planFixturePath}`);
    } catch (err) {
      console.warn(`[replay] could not load plan fixture at ${planFixturePath}:`, (err as Error).message);
    }
  }
```

Finally, in the existing `console.log` line that announces the replay:

```ts
  console.log(`replay running at tick=${tickMs}ms, events=${events.length}${skipped ? `, skipped=${skipped}` : ''}`);
```

Append a note about the plan source:

```ts
  console.log(
    `replay running at tick=${tickMs}ms, events=${events.length}${skipped ? `, skipped=${skipped}` : ''}` +
      (planFixturePath ? `, plan=${planFixturePath}` : ', plan=none'),
  );
```

- [ ] **Step 2: Run typechecks.**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test against an existing fixture (no sibling).**

Open a new terminal:

```bash
npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl
```

Expected console output includes `plan=none` (no sibling OFP exists for this fixture). Replay otherwise proceeds as today.

Stop with Ctrl+C.

- [ ] **Step 4: Commit.**

```bash
git add scripts/dev-telemetry-replay.ts
git commit -m "$(cat <<'EOF'
feat(scripts): replay harness loads sibling OFP and forwards fixture path

Discovers <recording>.ofp.json next to the .jsonl (env override:
FF_PLAN_FIXTURE_PATH), parses via parseSimbriefOfp, and seeds
aggregator.setPlan before the first telemetry tick. The same path is
threaded into start() so the in-app Fetch button reads from disk in dev.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: FlightPlanCard third-line clamp move (item 4.1)

**Files:**

- Modify: `web/src/components/DataPanel/FlightPlanCard.tsx`

- [ ] **Step 1: Move the clamp from the Surface onto an inner element.**

In `FlightPlanCard.tsx`, find the route-string `Card.Footer` block (around line 226–250). Replace:

```tsx
      {plan.routeString && (
        <Card.Footer>
          <Surface
            variant="secondary"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Click to collapse' : 'Click to expand'}
            className={`rounded-lg py-1 px-2 ml-[-8px] mr-[-8px] text-xs cursor-pointer ${
              expanded ? '' : 'line-clamp-2 max-h-[2.5rem] overflow-hidden'
            }`}
            style={{
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ff-fg-muted)',
              // Wrap at whitespace only; never break a fix name in the middle
              // (e.g. RUDAP must never render as RUD-AP). The route string is
              // already space-delimited, so this just lets the browser pick
              // line breaks at the existing spaces.
              wordBreak: 'keep-all',
              overflowWrap: 'normal',
              whiteSpace: 'normal',
            }}
          >
            {plan.routeString}
          </Surface>
        </Card.Footer>
      )}
```

With:

```tsx
      {plan.routeString && (
        <Card.Footer>
          <Surface
            variant="secondary"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Click to collapse' : 'Click to expand'}
            className="rounded-lg py-1 px-2 ml-[-8px] mr-[-8px] text-xs cursor-pointer"
            style={{
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ff-fg-muted)',
              // Wrap at whitespace only; never break a fix name in the middle
              // (e.g. RUDAP must never render as RUD-AP). The route string is
              // already space-delimited, so this just lets the browser pick
              // line breaks at the existing spaces.
              wordBreak: 'keep-all',
              overflowWrap: 'normal',
              whiteSpace: 'normal',
            }}
          >
            <div className={expanded ? '' : 'line-clamp-2'}>{plan.routeString}</div>
          </Surface>
        </Card.Footer>
      )}
```

- [ ] **Step 2: Run typechecks.**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the FE build.**

```bash
npm run build
```

Expected: PASS (catches CSS class regressions if any).

- [ ] **Step 4: Manual visual verification (deferred to Task 12 with the LFPG fixture). Commit now.**

```bash
git add web/src/components/DataPanel/FlightPlanCard.tsx
git commit -m "$(cat <<'EOF'
fix(web): FlightPlanCard collapse — move line-clamp to inner element

Outer Surface keeps the padding and click handler; an inner div carries
line-clamp-2. The previous arrangement put line-clamp and py-1 on the
same border-box, leaking 2-4 px of the third line into the padding strip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Alternate Chip vertical alignment audit (item 4.5)

**Files:**

- Modify: `web/src/components/DataPanel/FlightPlanCard.tsx`

- [ ] **Step 1: Investigate the current row layout in DevTools.**

Start the dev server:

```bash
npm run dev:replay -- scripts/fixtures/replay-eddb-lipz.jsonl
```

(Use any fixture with an `alternate` field; `replay-eddb-lipz.jsonl` was added in v1.3 and includes an alternate.)

Open `http://localhost:4444` (or the configured port). Inspect the FlightPlanCard header row containing the callsign and the alt-chip. Capture computed heights of `Card.Description`, the `<span className="inline-flex">` wrapper, and `<Chip>`. Identify whether the misalignment is from:

(a) the wrapping `<span>` being a redundant element (its line-height inherits at the same value as Description but introduces an extra inline box), or
(b) the chip's intrinsic height (border + padding) differing from the Description's text line-height by 1–3 px.

- [ ] **Step 2: Apply the minimal fix indicated by the inspection.**

Most likely fix (drop the redundant span, since HeroUI v3's TooltipTrigger doesn't require it):

```tsx
            <Tooltip>
              <TooltipTrigger>
                <Chip
                  size="sm"
                  variant="soft"
                  color="default"
                  aria-label={`Alternate: ${plan.alternate.name ?? plan.alternate.icao}`}
                >
                  <Chip.Label>alt {plan.alternate.icao}</Chip.Label>
                </Chip>
              </TooltipTrigger>
              <TooltipContent>
                {plan.alternate.name ?? `Alternate: ${plan.alternate.icao}`}
              </TooltipContent>
            </Tooltip>
```

If that alone doesn't visually align, normalize the row to a fixed height (the second alternative path). Replace the row's outer div opening tag:

```tsx
        <div className="flex items-center gap-2">
```

with:

```tsx
        <div className="flex items-center gap-2 h-5">
```

(`h-5` = 20 px; matches `Card.Description`'s `text-sm` line-height with HeroUI's default. Choose `h-6` if `h-5` clips the chip border.)

Iterate until both light- and dark-mode renderings have the chip's vertical center aligned with the callsign baseline.

- [ ] **Step 3: Run typechecks and the FE build.**

```bash
npm run typecheck && npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add web/src/components/DataPanel/FlightPlanCard.tsx
git commit -m "$(cat <<'EOF'
fix(web): FlightPlanCard alternate chip vertical alignment

Drops the redundant span wrapper around the TooltipTrigger / chip and
normalizes the row's intrinsic height so items-center centres the chip
flush with the callsign description.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Backlog update + end-to-end verification + ship

**Files:**

- Modify: `docs/backlog.md`
- (No code changes; verification only.)

- [ ] **Step 1: Update `docs/backlog.md`.**

Find the `## Already shipped — folded into past versions` section. Append a `### v1.3.1` line just before the `### v1.2 ✅` line if present, or at the bottom of the v1.3 entry. Use:

```markdown
- **v1.3.1** ✅ — post-real-flight retro patch. FlightPlanCard collapsed-route third-line clip, alternate-chip vertical alignment. Server-side: route-following `distanceToDestNm` (and consequently `eteToDestSec`), windowed waypoint reconciliation that fixes the LFPG → LEPA "next jumps to destination at start" bug. DX: `dev:replay` discovers a sibling Simbrief OFP and auto-loads it; in-app **Fetch** reads the same fixture; `dev:record` writes a sibling OFP next to the recorded `.jsonl` so each recording session produces a paired fixture.
```

In the v1.4 backlog block, append a "Polish from v1.3 retro" sub-bullet:

```markdown
- *Polish from v1.3 retro:* prevent airport tooltip overlap with the route line; restyle Fetch button (soft blue, full-width, inside Trip section).
```

- [ ] **Step 2: Run the full test suite + typechecks + build.**

```bash
npm test && npm run typecheck && npm run build
```

Expected: all green.

- [ ] **Step 3: End-to-end manual verification — replay against `replay-lfpg-lepa.jsonl`.**

Place the user-provided OFP at `scripts/fixtures/replay-lfpg-lepa.ofp.json` (raw Simbrief JSON). Then:

```bash
npm run dev:replay -- scripts/fixtures/replay-lfpg-lepa.jsonl
```

Open the UI in a browser. Verify:

- Console output ends with `plan=...replay-lfpg-lepa.ofp.json`.
- LFPG → LEPA plan auto-loads before the first tick.
- The "Next" indicator shows the **first** waypoint of the plan (not LEPA).
- Click the Fetch button mid-replay; the "Next" indicator remains correct.
- TripCard "Remaining" reads route-following nm; matches OFP route distance at flight start.
- ProgressBar fill matches pilot intuition through cruise (no large lead/lag against the route's actual fraction-flown).
- FlightPlanCard collapsed shows two lines, no peek of the third.
- Alternate Chip sits flush with the callsign in the header.

Stop with Ctrl+C.

- [ ] **Step 4: End-to-end manual verification — recording produces paired files.**

```bash
npm run dev:record -- scripts/fixtures/replay-test.jsonl
```

(Run this with MSFS open and a flight loaded; or stub the simbridge dependency by hitting Fetch only — the recorder's telemetry stream needs MSFS but the OFP write does not.)

Click Fetch in the UI. Stop with Ctrl+C. Confirm both files exist:

```bash
ls scripts/fixtures/replay-test.jsonl scripts/fixtures/replay-test.ofp.json
```

Then:

```bash
npm run dev:replay -- scripts/fixtures/replay-test.jsonl
```

Expected: replay starts and console reports `plan=...replay-test.ofp.json`.

Clean up the test files:

```bash
rm scripts/fixtures/replay-test.jsonl scripts/fixtures/replay-test.ofp.json
```

- [ ] **Step 5: Stage `replay-lfpg-lepa.jsonl` and its sibling OFP if both are ready, plus the backlog change. Commit.**

```bash
git add scripts/fixtures/replay-lfpg-lepa.jsonl scripts/fixtures/replay-lfpg-lepa.ofp.json docs/backlog.md
git commit -m "$(cat <<'EOF'
chore: v1.3.1 — fixture pair + backlog ship line

Commits the LFPG → LEPA recording and its paired Simbrief OFP fixture
used to verify v1.3.1, and marks v1.3.1 as shipped in docs/backlog.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(If the user-provided OFP is not yet redacted/ready at this point, stage only `replay-lfpg-lepa.jsonl` and `docs/backlog.md`; commit the OFP separately once the user confirms it.)

- [ ] **Step 6: Open a PR for the branch and tag the merge as `v0.4.1`.**

```bash
git push -u origin feat/v1.3.1-bugfix
gh pr create --title "v1.3.1 — post-real-flight retro patch" --body "$(cat <<'EOF'
## Summary
- Five surgical fixes from the LFPG → LEPA real-flight retro: third-line collapse clip, route-following progress (distance/ETE), windowed waypoint reconciliation (fixes the "next jumps to LEPA at start" bug), alternate-chip alignment.
- DX: `dev:replay` auto-loads a sibling Simbrief OFP; in-app Fetch reads the same fixture; `dev:record` writes a sibling OFP for paired captures.

Spec: `docs/superpowers/specs/2026-05-02-flight-follower-v1.3.1-design.md`.

## Test plan
- [x] `npm test` green
- [x] `npm run typecheck` green
- [x] `npm run build` green
- [x] LFPG → LEPA replay verifies correct "Next" at start, route-following progress, third-line clamp, chip alignment
- [x] dev:record produces paired `.jsonl` + `.ofp.json`; dev:replay loads the pair

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After merge:

```bash
git checkout main
git pull
git tag v0.4.1
git push origin v0.4.1
```

---

## Self-review checklist (run before handing off)

1. **Spec coverage:**
   - § 4.1 third-line clamp → Task 10. ✓
   - § 4.2.1 sibling discovery + auto-load → Task 9. ✓
   - § 4.2.2 fixture-aware Fetch → Tasks 7, 8. ✓
   - § 4.2.3 record-time OFP capture → Tasks 5, 6, 7. ✓
   - § 4.3 route-following distance → Tasks 1, 3, 4. ✓
   - § 4.4 windowed reconciliation → Tasks 2, 3. ✓
   - § 4.5 alternate chip alignment → Task 11. ✓
   - § 9 branch & release (tag `v0.4.1`) → Task 12. ✓
   - § 11 backlog update → Task 12. ✓

2. **Type / signature consistency:**
   - `routeRemainingNm(pos: LatLon, plan: FlightPlan, passedIndex: number): number` — defined Task 1, called Task 3.
   - `advancePassedIndexWindowed(pos: LatLon, waypoints: Waypoint[], currentPassedIndex: number): number` — defined Task 2, called Task 3.
   - `fetchLatestOfp(...): Promise<{ raw: unknown; plan: FlightPlan }>` — defined Task 5, called Task 7.
   - `loadOfpFromFile(path: string): Promise<{ raw: unknown; plan: FlightPlan }>` — defined Task 6, called Tasks 7, 9.
   - `siblingOfpPath(filePath: string): string` — defined Task 6, called Tasks 7, 9.
   - `HttpOptions.simbriefFixturePath?: string` and `HttpOptions.recordPath?: string` — defined Task 7, populated Task 8.
   - `StartOptions.simbriefFixturePath?: string` — defined Task 8, populated Task 9.

3. **Placeholders:** none.

4. **Frequent commits:** every task ends in a commit; 12 commits total before the PR.
