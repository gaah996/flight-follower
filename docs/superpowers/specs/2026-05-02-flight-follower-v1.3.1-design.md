# Flight Follower — v1.3.1 Design Spec

- **Date:** 2026-05-02
- **Status:** Approved, ready for implementation planning
- **Scope:** v1.3.1 / `v0.4.1` — post-real-flight retro patch on top of v1.3
- **Predecessors:**
  - [`2026-04-24-flight-follower-design.md`](./2026-04-24-flight-follower-design.md) — v1
  - [`2026-04-25-flight-follower-v1.1-design.md`](./2026-04-25-flight-follower-v1.1-design.md) — v1.1
  - [`2026-04-25-flight-follower-v1.2-design.md`](./2026-04-25-flight-follower-v1.2-design.md) — v1.2
  - [`2026-05-01-flight-follower-v1.3-design.md`](./2026-05-01-flight-follower-v1.3-design.md) — v1.3

## 1. Overview

v1.3 shipped on 2026-05-02 (tag `v0.4.0`). The first real-flight test (LFPG → LEPA, A320, FBW) surfaced four small but visible bugs and one developer-experience gap. v1.3.1 is a focused patch addressing those five items, plus one DX improvement to make future real-flight retros easier without consuming a Simbrief OFP slot.

The release is intentionally surgical:

- No new user-facing features beyond the bug fixes.
- No new WebSocket message types, no new REST endpoints (one existing endpoint becomes fixture-aware in dev).
- One new pure server-side helper module; one new aggregator method signature change; small additions to existing files.
- v1.4's previously-scoped "Personalization & per-user config" surface is preserved untouched and remains the next minor.

Two items from the retro are deferred to v1.4 by user agreement: the airport tooltip overlap with the route, and the Fetch button restyle (soft blue, full-width, inside trip section). They are out of scope here; see § 11.

## 2. Goals

1. Fix the FlightPlanCard collapsed-route box so the third line never peeks above the bottom edge — clamping is a content concern, padding is a container concern, and the two should not share a box.
2. Allow developing against a real flight fixture without hitting Simbrief: the replay harness discovers and auto-loads a sibling Simbrief OFP JSON file by basename, and the in-app **Fetch** button reads from that same file (so the user-facing flow — including the post-fetch broadcast — is exercised in dev). Symmetrically: when recording (`dev:record`), a Simbrief fetch persists the raw OFP next to the `.jsonl` so a single recording session produces a paired fixture ready to replay.
3. Make progress reads (Remaining row, ProgressBar fill, FlightPlanCard glyph reveal, ETA) match the **route-following** distance the pilot's planning intuition uses, not great-circle.
4. Eliminate the LFPG → LEPA "waypoint immediately at destination on first tick" bug by narrowing per-tick reconciliation to legs near the current expected leg.
5. Tidy the Alternate Chip's vertical alignment in the FlightPlanCard header so it sits flush with the callsign description.

## 3. Non-goals (v1.3.1)

- **No new features.** No personalization, no card config persistence, no theme-by-day-night, no airline branding, no track-vs-heading toggle. v1.4 territory.
- **No airport tooltip overlap fix.** Deferred to a later release per user.
- **No Fetch button restyle** (soft blue, full-width, inside trip section). Deferred to a later release per user. The button's *behavior* changes in dev (item 2 above) but its *appearance and placement* are unchanged.
- **No SimVar-driven next-waypoint reading.** MSFS exposes `GPS_WP_NEXT_ID` / `GPS_WP_NEXT_LAT` / `GPS_WP_NEXT_LON` / `GPS_FLIGHT_PLAN_WP_INDEX`, and FBW A320 normally pushes its FPLN to the underlying GPS, so this is a viable parallel data source — but it's fragile across aircraft and across users who type routes only into the MCDU. Architectural-risk too high for a patch release; revisit in v1.4 as a parallel cross-check, not a source of truth.
- **No protocol changes.** No new WS message types, no new REST endpoints. `/api/simbrief/fetch` is extended in-place.
- **No backwards-compatibility shims.** Single-user lockstep deploy. The semantic shift on `distanceToDestNm` (great-circle → route-following) is documented in `shared/types.ts` JSDoc; no parallel field is kept.

## 4. Fixes

### 4.1 FlightPlanCard collapsed clip — third-line peek

**Symptom.** When the route box is collapsed, the second line ends with the expected ellipsis, but the top 2–4 px of a third line peeks above the bottom edge of the Surface.

**Diagnosis.** Today's collapsed Surface (`web/src/components/DataPanel/FlightPlanCard.tsx`) carries both `line-clamp-2 max-h-[2.5rem] overflow-hidden` and `py-1` on the same element. `line-clamp-2` applies `display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden;`. With `box-sizing: border-box` (Tailwind default), the **content area** is reduced by the 8 px of vertical padding, so two lines of `text-xs` mono content fit inside but the third line's top crosses into the padding strip before `overflow: hidden` clips it.

**Fix.** Move the clamp onto an inner element. Outer Surface keeps padding-only; an inner `<div>` carries `line-clamp-2` (no `max-h`, no `overflow`). Clamping becomes purely a content concern; padding stays a container concern; no magic-number `max-h` to re-tune if padding ever changes.

**File.** `web/src/components/DataPanel/FlightPlanCard.tsx`.

### 4.2 Mock flight plan during development

**Goal.** Develop and verify against a real recorded flight without consuming a Simbrief OFP slot or depending on the network. Match the user-visible flow in dev as closely as in prod — including the **Fetch** button click that triggers the post-fetch broadcast.

**Mechanism — two coordinated changes.**

#### 4.2.1 Auto-load on replay-harness start

`scripts/dev-telemetry-replay.ts` discovers a sibling OFP file by basename next to the recording, e.g. `scripts/fixtures/replay-lfpg-lepa.ofp.json` for `scripts/fixtures/replay-lfpg-lepa.jsonl`. Env var `FF_PLAN_FIXTURE_PATH=/abs/or/relative.json` overrides the sibling lookup.

If found, the harness reads the file, parses through `parseSimbriefOfp` (the same parser used by `/api/simbrief/fetch`), and calls `aggregator.setPlan(plan)` before the first telemetry tick.

If not found, the harness behaves exactly as today — no plan is auto-loaded, and the user can still click **Fetch** in the UI (which will hit Simbrief as today, since `simbriefFixturePath` is unset).

#### 4.2.2 Fetch button uses the fixture in dev

The harness passes the resolved fixture path to `start()` via a new `simbriefFixturePath?: string` option on `StartOptions`. `start()` threads the option into `buildHttpApp`. `/api/simbrief/fetch` becomes fixture-aware:

- When `simbriefFixturePath` is set, the handler reads the file from disk, parses via `parseSimbriefOfp`, calls `aggregator.setPlan(plan)`, and returns the parsed `FlightPlan`. Same response shape as the prod path. Errors return the same `{ error, message }` envelope as the Simbrief-network path with new `code` values: `FIXTURE_NOT_FOUND` (file does not exist), `FIXTURE_BAD_JSON` (`JSON.parse` threw), `FIXTURE_BAD_OFP` (parser threw — wraps the Zod issue list).
- When `simbriefFixturePath` is unset, behavior is identical to today (call `fetchLatestOfp(userId)`).

**Why this matters for v1.3.1 specifically.** Item 4.4 (windowed reconciliation) is best verified by clicking **Fetch** mid-flight to force a `setPlan` from the aircraft's current (mid-flight) position. The fixture path makes that one-click in dev.

**Format.** Raw Simbrief OFP JSON (the same shape `xml.fetcher.php?json=1` returns). Reuses `parseSimbriefOfp` as the single source of truth — bug-for-bug parity with the prod fetch path.

**Scope.** Replay harness only. The production `start()` invocation in `server/src/index.ts` (the CLI launcher and the `npm start` path) does not set `simbriefFixturePath`, so prod behavior is unchanged.

#### 4.2.3 Plan capture during recording

Symmetrical to § 4.2.1's auto-load: when `dev:record` is active, a Simbrief fetch from the in-app **Fetch** button persists the raw OFP to disk as a sibling of the telemetry file. The result: one recording session produces a paired `replay-foo.jsonl` + `replay-foo.ofp.json`, ready to feed § 4.2 verbatim.

**Mechanism.**

- `fetchLatestOfp(userId)` (currently in `server/src/simbrief/client.ts`) returns `{ raw: unknown; plan: FlightPlan }` instead of just `FlightPlan`. The raw is the un-parsed `await res.json()` value; the plan is `parseSimbriefOfp(raw)`. Single caller (the HTTP handler), so the type change is local.
- `buildHttpApp` accepts an optional `recordPath?: string`. When set, the prod-fetch branch of `/api/simbrief/fetch` (i.e. `simbriefFixturePath` not set) writes the raw OFP to `<recordPath without .jsonl>.ofp.json` via `fs/promises.writeFile` after the fetch succeeds, before responding. Awaited so the file is durable if the recorder is killed immediately after the response.
- `server/src/index.ts` threads its existing `opts.recordPath` into `buildHttpApp`.

**Behavior matrix.**

| `recordPath` | `simbriefFixturePath` | Fetch click writes OFP? |
|---|---|---|
| set | unset | **yes**, sibling to recording |
| set | set | no (fixture is already on disk; rewriting is meaningless) |
| unset | unset | no (today's behavior) |
| unset | set | no (replay-only mode; nothing to record) |

**Edge cases.**

- Multiple Fetch clicks in one recording session: latest wins (file is overwritten). Reflects the active OFP at end-of-recording, which is what replay needs.
- Simbrief network error: no OFP file written (the prod path errors out before the write).
- Sibling directory already exists (mkdir'd by `start()` for the `.jsonl`): no extra mkdir needed.
- File-system write fails (disk full, permissions): the fetch response still succeeds (plan is set in-memory), but a `console.warn('[record] failed to persist OFP', err)` is emitted. Aligned with the existing recorder's "best-effort, don't crash the server" stance.

**Files.** § 4.2 file list extended:

- `server/src/simbrief/client.ts` — return shape `{ raw, plan }`.
- `server/src/transport/http.ts` — accept `recordPath?: string` opt; sibling write in the prod-fetch branch.
- `server/src/index.ts` — pass `opts.recordPath` through to `buildHttpApp`.
- `scripts/dev-telemetry-replay.ts`, `server/src/index.ts`, `server/src/transport/http.ts` — listed already from § 4.2.1 / § 4.2.2.

### 4.3 Progress calculation — route-following

**Symptom.** The Remaining row in TripCard, the ProgressBar fill, and the FlightPlanCard glyph reveal all read ahead-of-actual on inbound diagonals and behind on outbound legs. The user's intuition (and the pilot mental model that ETE/fuel maps to) is **route-following** distance, not great-circle.

**Diagnosis.** Today's progress percent is `1 - distanceToDestNm / plan.totalDistanceNm`. The numerator (`aggregator.ts:150`, `haversineNm(t.position, plan.destination)`) is great-circle. The denominator (Simbrief `air_distance ?? route_distance`) is route-following. Mismatch.

**Fix.** Replace `distanceToDestNm` semantics from great-circle to route-following:

```
distanceToDestNm = alongTrackRemainingOnCurrentLeg
                 + sum(legNm for legs strictly after the current leg, ending at destination)
```

The "leg list" is `[origin, ...waypoints, destination]`. The current leg is `[passedIndex, passedIndex+1]` in that combined list (origin = index 0, destination = last index, with waypoints `1..N` between). The current-leg remainder is `legNm - clamp(alongTrack, 0, legNm)`, where `alongTrack` is computed via the existing `alongTrackNm` (`server/src/route-math/progress.ts`).

`eteToDestSec` follows automatically — the aggregator computes it as `eteSeconds(distanceToDestNm, gs)`.

**Implementation.** New pure module `server/src/route-math/route-progress.ts`:

```ts
export function routeRemainingNm(
  pos: LatLon,
  plan: FlightPlan,
  passedIndex: number,
): number;
```

`passedIndex` is interpreted in the **waypoints array** (existing convention): -1 means no waypoint passed yet, `N-1` means past the last named waypoint (so the current leg is `lastWaypoint → destination`). Internally, the function builds the combined `[origin, ...waypoints, destination]` list and computes the answer.

Edge cases:
- No waypoints (only origin/destination): the route is a single leg; route-remaining = along-track-clamped of the destination leg.
- `passedIndex == -1`: current leg is `origin → waypoints[0]`.
- `passedIndex == waypoints.length - 1`: current leg is `lastWaypoint → destination`.
- `pos` projects past `destination` along the current leg: clamped to 0 (we never go negative).
- `pos` projects behind the current leg's start: along-track-clamped is 0; remainder = full leg + remaining legs.

`computeProgress` in `state/aggregator.ts` calls `routeRemainingNm(t.position, plan, this.passedIndex)` and assigns the result to `distanceToDestNm`. The existing line that computes `haversineNm(t.position, plan.destination)` is removed.

**`plan.totalDistanceNm` becomes leg-sum too.** The Simbrief OFP exposes `general.air_distance` and `general.route_distance`, both of which include wind/route adjustments and run a few percent higher than the geometric haversine sum of the navlog waypoints. Mixing them with the new leg-following `distanceToDestNm` produces a non-zero progress percentage at the origin (~3.5% on the LFPG → LEPA fixture). v1.3.1 changes `simbrief/parser.ts` to compute `totalDistanceNm` itself as the haversine sum of `[origin, ...waypoints, destination]`. `air_distance` and `route_distance` are removed from the parser schema since they're no longer used. The displayed total in FlightPlanCard's "Distance" row shows the same number the progress math uses; progress reads exactly 0% at the origin and exactly 100% at the destination.

**Type comment.** `shared/types.ts` JSDoc on `FlightProgress.distanceToDestNm` updated to: *"Route-following distance to destination in nautical miles: along-track remainder of the current leg + sum of remaining leg distances."* No type-shape change.

**Tests.** `server/src/route-math/route-progress.test.ts`:
- Single-leg route (no intermediate waypoints): result equals along-track clamped against the leg.
- Multi-leg, aircraft on the first leg: along-track remainder of leg 0 + sum of legs 1..end.
- Multi-leg, aircraft past the last waypoint: just the destination leg's remainder.
- Aircraft past destination (along > legNm on the destination leg): result is 0.
- Aircraft far off-track but with the current leg well-defined: remainder uses the leg's natural length, not the position-to-destination geodesic.
- Zero-length leg (degenerate plan): does not throw; treats the leg as already-passed.

### 4.4 Waypoint reconciliation — windowed

**Symptom.** On the LFPG → LEPA flight, when the plan loaded with the aircraft still at LFPG, the active "Next" waypoint immediately jumped to LEPA (the destination). Re-fetching the plan mid-flight fixed it.

**Diagnosis.** `state/aggregator.ts` runs `findPassedIndex(t.position, plan.waypoints)` every telemetry tick (`aggregator.ts:145`). `findPassedIndex` walks **every** leg `[a, b]` and projects `pos` onto it via `alongTrackNm`. When `pos` is far from the leg but happens to lie roughly on the great-circle through `a` and `b`, the projection returns a positive value much greater than `legNm`, marking that leg as "passed" — which cascades through subsequent legs and snaps `passedIndex` near the end of the route.

LFPG → LEPA exhibits this because LFPG sits roughly on the north-south meridian through LEPA: a near-destination leg like `(NEMOG, LEPA)` has bearing southward, the bearing from NEMOG to LFPG is also southward, so `cos(b13 - b12) > 0` and along-track returns ≈ 600 nm against a leg length of perhaps 30 nm.

A pure cross-track gate doesn't fix it — LFPG is roughly on-axis, so cross-track is small. The reconciliation needs to be **bounded in route-position space**, not just in cross-track space.

**Fix.** Per-tick reconciliation only considers legs in a small window around `passedIndex`. The full scan stays as-is — but it runs only on `setPlan` (mid-flight resume seed), not on every telemetry tick.

**Implementation.** Two coordinated changes in `server/src/route-math/progress.ts`:

1. **Replace `findPassedIndex` with closest-leg projection.** The full-scan along-track algorithm (project pos onto every leg, take the max passed index) misfires whenever any leg's bearing aligns with the bearing from its start back to pos. A 200 nm reach-gate-in-loop is insufficient because real navlogs have multiple SID and early-enroute legs within 200 nm of the origin, and the cumulative max-of-misfires across those legs still jumps the cursor (LFPG → LEPA "next = RBT instead of DE27R" reproduction). The semantically correct algorithm: find the single leg whose nearest endpoint is closest to pos, then project only onto that leg. A 200 nm constant `FIND_PASSED_INDEX_REACH_NM` survives as a defensive sanity gate on the best leg's distance to pos (returns `-1` if the aircraft is nowhere near the route at all). Tie-breaks pick the smaller-index leg, which keeps cursor advancement at a shared waypoint conservative.

2. **New windowed helper for per-tick advancement, also using closest-leg projection.** Per-tick reconciliation projects pos onto only the closest leg in a small window around the current cursor (same algorithm as `findPassedIndex`, just bounded). An earlier "project onto every leg in the window, take Math.max" approach was tried and rejected: it gave the bug 4 chances per tick to misfire and on real navlogs (PG270 → PG290 → PON → RBT, all roughly along the same airway) the cursor still jumped multiple waypoints ahead. Closest-leg-in-window aligns the per-tick path with the plan-load path and limits the misfire surface to a single projection per tick, guarded by `Math.max(currentPassedIndex, candidate)` so advancement remains forward-only. No reach-gate inside the window — the window is itself the constraint.

```ts
/**
 * Per-tick advancement bounded to a window of legs around the current cursor.
 * Considers legs [i, i+1] where i is in
 * [max(0, currentPassedIndex - 1), min(waypoints.length - 2, currentPassedIndex + 2)].
 * Within that window: applies the same along-track logic as findPassedIndex
 * (project pos onto leg [i, i+1], advance to i+1 if along >= legNm, etc.),
 * then takes the max with currentPassedIndex (forward-only).
 *
 * Why a window: full-scan along-track misfires when pos is far from a leg but
 * roughly collinear with it (e.g. LFPG sitting on the great-circle through a
 * near-destination leg of the LFPG → LEPA route). Reconciliation only needs
 * to look near the current expected position; arbitrary-distance jumps
 * across the route are not a real telemetry-tick scenario.
 */
export function advancePassedIndexWindowed(
  pos: LatLon,
  waypoints: Waypoint[],
  currentPassedIndex: number,
): number;
```

`state/aggregator.ts` `computeProgress` is rewritten to use the windowed helper per tick (full-scan `findPassedIndex` is no longer called here). `setPlan` still calls `findPassedIndex` — now safe because of the reach-gate above:

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
```

— i.e. `findPassedIndex` is no longer called from per-tick. Plan-load (`setPlan`) keeps calling `findPassedIndex`, which is now reach-gated per § 4.4(1) so the LFPG-shape bug doesn't leak in via the seed.

**Window choice.** `[passedIndex - 1, passedIndex + 2]`. Looks one leg backward (defensive — we just left this leg) and two legs forward (covers "we're already on the next leg" and "we've just advanced and the next-after is also reachable in a fast sequence"). Out-of-bounds indices are clamped to `[0, waypoints.length - 1]`.

**Tests.** `server/src/route-math/progress.test.ts` extended:
- LFPG-shape regression: a long route where pos is at the origin and one near-destination leg's bearing roughly aligns with the bearing from that leg's start to pos. With reach-gating both `findPassedIndex` and `advancePassedIndexWindowed` return -1; the test asserts both.
- Off-track recovery on the current leg: pos is wide of waypoint `i+1` by 5 nm but past it along-track. With `passedIndex = i`, the windowed advance returns `i+1`. Existing behavior preserved.
- Forward-only: regardless of pos drift, the function never returns a value below `currentPassedIndex`.
- Windowed bounds: when `passedIndex = -1`, only legs `[0, 1] .. [1, 2]` are considered. When `passedIndex = waypoints.length - 1`, no legs are considered (returns `passedIndex` unchanged).

`server/src/state/aggregator.test.ts` extended:
- LFPG-shape regression: `setPlan` called BEFORE telemetry — verifies the windowed per-tick path doesn't misfire.
- LFPG-shape real-flow regression: telemetry ingested FIRST (MSFS streaming), THEN `setPlan` — verifies the reach-gated `findPassedIndex` seed path doesn't misfire either. Asserts `nextWaypoint?.ident === 'W1'` and `distanceToDestNm > 500`.

### 4.5 Alternate Chip vertical alignment

**Symptom.** In `FlightPlanCard.tsx`, the Alternate Chip in the header row sits visually slightly off from the callsign description on the same flex line.

**Approach.** Loosely scoped audit-and-fix — same shape as v1.3 § 5.8 (light-mode tooltip opacity). The likely culprit is the `<span className="inline-flex">` wrapper around the Tooltip trigger introducing a different intrinsic height than `Card.Description`'s text line-height, while `items-center` on the row tries to center two boxes whose intrinsic heights differ.

Investigation during implementation:
1. Inspect computed heights of `Card.Description` vs the chip wrapper in DevTools.
2. Try removing the wrapping span if redundant under HeroUI v3's Tooltip (the trigger may not need it).
3. If still off, normalize the row: fixed `h-5` or `h-6` container with `items-center`.
4. Verify visually in both light and dark modes against the existing fixtures and the new LFPG → LEPA fixture.

**File.** `web/src/components/DataPanel/FlightPlanCard.tsx`. CSS-only.

## 5. Data contract changes

None to type shapes.

`FlightProgress.distanceToDestNm` keeps its name; semantics shift from great-circle to **route-following** (along-track remainder of current leg + sum of remaining leg distances). JSDoc in `shared/types.ts` updated to reflect this. `eteToDestSec` follows automatically (computed as `eteSeconds(distanceToDestNm, gs)`).

`StartOptions` (server-internal type in `server/src/index.ts`) gains `simbriefFixturePath?: string`. Not exported on the wire; not part of `shared/types.ts`.

## 6. Files touched

### Modified (web)

- `web/src/components/DataPanel/FlightPlanCard.tsx` — items 4.1 (third-line clamp move) and 4.5 (alternate chip alignment).

### Modified (server)

- `server/src/state/aggregator.ts` — items 4.3 (use `routeRemainingNm` for `distanceToDestNm`) and 4.4 (per-tick reconciliation uses `advancePassedIndexWindowed` instead of `findPassedIndex`).
- `server/src/route-math/progress.ts` — item 4.4 (new `advancePassedIndexWindowed`).
- `server/src/route-math/progress.test.ts` — extended for windowed advancement.
- `server/src/index.ts` — item 4.2 (`simbriefFixturePath?: string` on `StartOptions`, threaded into `buildHttpApp`; existing `recordPath` also threaded into `buildHttpApp` for § 4.2.3).
- `server/src/transport/http.ts` — item 4.2 (fixture-aware `/api/simbrief/fetch` branch; sibling-OFP write when `recordPath` is set per § 4.2.3).
- `server/src/simbrief/client.ts` — item 4.2.3 (`fetchLatestOfp` returns `{ raw, plan }`).

### New (server)

- `server/src/route-math/route-progress.ts` — `routeRemainingNm` helper.
- `server/src/route-math/route-progress.test.ts` — unit tests.

### Modified (shared)

- `shared/types.ts` — JSDoc clarification on `FlightProgress.distanceToDestNm` semantics. No shape change.

### Modified (scripts)

- `scripts/dev-telemetry-replay.ts` — sibling OFP discovery, env-var override, plan auto-load before first tick, pass `simbriefFixturePath` through to `start()`.

### New (fixtures)

- The user-recorded `scripts/fixtures/replay-lfpg-lepa.jsonl` (already present, currently untracked) is committed as part of this release.
- A sibling `scripts/fixtures/replay-lfpg-lepa.ofp.json` is committed alongside (raw Simbrief OFP from the same flight; user provides).

## 7. Tests

Per project pattern: server gets unit tests, frontend is verified manually against fixtures.

### Server unit tests

- `route-math/route-progress.test.ts` (new) — cases listed in § 4.3.
- `route-math/progress.test.ts` (extended) — cases listed in § 4.4, including the LFPG-shape regression.
- `state/aggregator.test.ts` (extended, light) — verify `distanceToDestNm` is now route-following and `eteToDestSec` follows; verify per-tick reconciliation no longer invokes the full scan.
- `simbrief/parser.test.ts` — no changes (the fixture-fetch path uses the same parser, no new field extraction).

### Frontend manual verification — against `replay-lfpg-lepa.jsonl` + sibling OFP

- Replay starts; LFPG → LEPA plan loads automatically before the first tick.
- Active "Next" waypoint at the start of the flight is the **first** waypoint of the plan, not LEPA.
- Click **Fetch** mid-flight: plan reloads from disk; active "Next" remains correct.
- TripCard "Remaining" row reads route-following nm; matches OFP route distance at flight start; decreases monotonically along the flight.
- ProgressBar fill matches the pilot's expectation (mid-flight by route distance reads ~50%, not "ahead" or "behind" by tens of percent on inbound diagonals).
- FlightPlanCard glyph reveal-as-you-fly tracks the same percentage.
- FlightPlanCard collapsed: exactly two lines visible, no peek of the third.
- Alternate Chip ("alt LEXX") sits flush vertically with the callsign in the FlightPlanCard header.

### Frontend manual verification — without a sibling OFP

- Replay using `replay-eddb-circuit.jsonl` (no sibling OFP exists) starts as today; **Fetch** clicks hit Simbrief as today (no fixture mode).

### Manual verification — recording produces paired files

- Run `npm run dev:record -- scripts/fixtures/replay-test.jsonl`; click **Fetch** in the UI; stop the recorder.
- Confirm `scripts/fixtures/replay-test.jsonl` and `scripts/fixtures/replay-test.ofp.json` both exist.
- Run `npm run dev:replay -- scripts/fixtures/replay-test.jsonl`; the OFP auto-loads via § 4.2.1 sibling discovery.

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Windowed reconciliation misses a legitimate "skip-multiple-waypoints" advance (e.g. user teleports the aircraft via Slew across several waypoints in one tick) | Low | Plan-load full-scan still handles abrupt re-positioning via re-fetch. Slew across waypoints without a re-fetch is not a real flying scenario. |
| Route-following `distanceToDestNm` produces a confusing value when `passedIndex` is briefly out-of-sync with reality during a wide-of-leg recovery | Low | Along-track is clamped to `[0, legNm]` per leg. Result remains continuous and monotonic-ish through normal flight. |
| Fixture-aware `/api/simbrief/fetch` accidentally activates in production due to env-var leakage | Low | The path is only set by the replay harness, which explicitly resolves and threads it. The CLI launcher (`server/src/index.ts` invokedDirectly branch) does not read any new env var. |
| `simbriefFixturePath` errors (file missing, bad JSON) confuse the user | Low | Three explicit error codes (`FIXTURE_NOT_FOUND`, `FIXTURE_BAD_JSON`, `FIXTURE_BAD_OFP`) returned via the same envelope as Simbrief network errors; FE error toast already handles the envelope. |
| Alternate Chip alignment fix turns out to require a HeroUI v3 component prop that doesn't exist | Low | Fall back to a fixed-height row container (`h-5` / `h-6`) with `items-center`; verified in the existing v1.3 dark/light theme. |
| The committed sibling OFP file `replay-lfpg-lepa.ofp.json` contains personal Simbrief identifiers (account hash etc.) | Low–Medium | Inspect the OFP at commit time; redact obvious user-id fields if present. The flight itself is a fictional sim flight, so route content is fine to commit. |
| Sibling-OFP write during recording fails silently and the user only notices on replay | Low | `console.warn` on write failure; fetch response still returns the parsed plan so the in-flight UX is unaffected. Manual verification (§ 7) checks the file exists post-recording. |
| `distanceToDestNm` semantics change surprises future v1.4 work that assumed great-circle | Low | JSDoc updated; v1.3.1 is shipped lockstep; v1.4 brainstorm picks up the new semantics directly. |

## 9. Branch & release

- New branch off current `main`: `feat/v1.3.1-bugfix`.
- Single PR; merge to `main` once tests + manual verification pass.
- Tag `v0.4.1` on the merge commit.
- Update `docs/backlog.md` `## Already shipped` section to add a v1.3.1 line listing the five fixes.

## 10. Out of scope — deferred per user

- **Airport tooltip overlap with route.** The "maybe" item from the retro: when the alternate marker hover-tooltip appears over a route line, the tooltip overlaps the route. Visual-only.
- **Fetch button restyle:** soft blue, full-width, inside the Trip section. The button's *behavior* changes in dev (§ 4.2.2), but its *appearance and placement* are unchanged in v1.3.1.

Both are candidates for v1.4 (or wherever they fit alongside that release's personalization scope).

## 11. Backlog updates

After v1.3.1 ships:

- Append a `### v1.3.1` line under `## Already shipped — folded into past versions` in `docs/backlog.md` with the five fixes plus the dev-mock-plan DX feature.
- The two deferred items (airport tooltip overlap, Fetch button restyle) join the v1.4 backlog under a "Polish from v1.3 retro" sub-bullet.
