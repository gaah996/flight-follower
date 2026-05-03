# Flight Follower — v0.4.0 Design Spec

- **Date:** 2026-05-01
- **Status:** Approved, ready for implementation planning
- **Scope:** v0.4.0 (flight progress — planned vs actual, with a focused polish & bug pass)
- **Predecessors:**
  - [`2026-04-24-flight-follower-v0.1.0-design.md`](./2026-04-24-flight-follower-v0.1.0-design.md) — v0.1.0
  - [`2026-04-25-flight-follower-v0.2.0-design.md`](./2026-04-25-flight-follower-v0.2.0-design.md) — v0.2.0
  - [`2026-04-25-flight-follower-v0.3.0-design.md`](./2026-04-25-flight-follower-v0.3.0-design.md) — v0.3.0

## 1. Overview

v0.4.0 is the **flight progress** release: it makes the panel and the map agree on *where the aircraft is in the plan, where it's going next, and when it'll get there*. It introduces a breadcrumb altitude gradient, plan-driven TOC/TOD markers, manual skip-waypoint controls, an origin → destination progress timeline, a live ETA, and an alternate-on-map indicator. Bundled in is a focused polish pass on the bugs that touch the same surfaces (FlightPlanCard layout, map mode behavior, altitude/heading correctness, times vocabulary).

The brief from brainstorming was **option B**: themed features + the bugs that share their surfaces, deferring UI/personalization (compact mode, settings persistence, theme-by-day-night, mobile, alert center, airline branding) to v0.5.0 and beyond.

The release stays surgical on protocol surface: a few additions to `RawTelemetry` and `FlightProgress`, no new WebSocket message types, no new endpoints. Most of the work lives in the frontend; the aggregator and Simbrief parser gain small, additive responsibilities.

## 2. Goals

1. Color-code the breadcrumb trail by altitude, sharing the FlightPlanCard glyph palette so plan and actual use the same visual vocabulary.
2. Compute TOC and TOD from the flight plan (waypoint scan against `plannedAltitude`) and place markers on the map at those positions; rework the Clock card countdown to use those positions plus current ground speed.
3. Add manual skip-waypoint navigation (prev / next) with auto-resync logic so reloading the plan doesn't bounce tracking back to the first fix.
4. Add an origin → destination progress timeline to TripCard, with TOC / current / TOD ticks.
5. Surface a live ETA derived from `eteToDestSec` and replace any STA-derived display with the live or Simbrief-provided value.
6. Render the alternate airport on the map in a distinguishing blue, with an alternate-only hover tooltip; origin and destination keep their existing fixed labels.
7. Reveal the FlightPlanCard altitude-profile glyph progressively as the flight advances (option C: gradient stays, progress overlay shows flown portion; fall back to option B — gradient revealed only as you fly — if the overlay reads as visual noise during implementation).
8. Fix the bugs and visual issues that share these surfaces — FlightPlanCard collapsing/wrapping, map mode promotion on user gestures, altitude SimVar correctness, map plane icon rotation at high-magvar latitudes, min-zoom limit, light-mode tooltip transparency, TRK in panel, and a times-vocabulary alignment across cards (use Simbrief block time directly).
9. Spike (early in implementation): does Simbrief expose hard waypoint constraints (at-or-below altitudes, max IAS) cleanly enough to add to the map waypoint tooltip? If yes, ship the addition; if not, defer to v0.5.0.
10. Add the two new replay fixtures (`replay-eddb-lipz.jsonl`, `replay-nzqn-nzwn.jsonl`) so v0.4.0 can be developed and verified against real flights with a cruise phase, a southern-hemisphere flight, and a go-around.

## 3. Non-goals (v0.4.0)

- No card compact/extended modes, no per-user settings persistence, no theme-by-day-night, no airline icons or branding, no plane-icon track-vs-heading toggle. These are scheduled for v0.5.0.
- No mobile/responsive layout, no alert center, no LAN-IP banner, no app-mode header treatment. Scheduled for v0.6.0.
- No actual OUT/OFF/ON/IN computation from the on-ground boolean. The "block time mismatch" bug is fixed by using Simbrief's plan value directly; the larger actuals state machine is parked for v0.5.0.
- No flight phase classifier, no AUTO map mode, no map style switcher, no layers panel, no unit toggling. Backlog.
- No Cesium 3D, no FBW FMC reading, no flight logging, no Electron packaging. v0.7+ candidates.
- No new WebSocket message types or REST endpoints — all new data flows through the existing `state` payload.
- No backwards-compatibility migration. Server and client deploy together (single-user LAN app); the few non-additive type changes in § 8 (`heading` shape, `track` field, `breadcrumb` sample shape) ship in lockstep.

## 4. v0.4.0 features

### 4.1 Breadcrumb altitude gradient

The breadcrumb trail rendered by `web/src/components/Map/BreadcrumbTrail.tsx` is currently a single-color polyline. v0.4.0 colors each segment by altitude using a shared palette mapping function.

**Palette source.** A new module `web/src/lib/altitudePalette.ts` exports:

```ts
// Maps an altitude in feet (MSL) to an HSL color in the FlightPlanCard glyph palette.
export function altitudeToColor(altMsl: number, opts?: { mode?: 'dark' | 'light' }): string;
// Convenience: returns palette stops for use by the FlightPlanCard glyph and any progress overlays.
export const ALTITUDE_STOPS: ReadonlyArray<{ ft: number; color: string }>;
```

The current FlightPlanCard glyph derives its gradient inline; that derivation moves into `altitudePalette.ts` so glyph and breadcrumb share it.

**Rendering.** `BreadcrumbTrail.tsx` switches from a single `<Polyline>` to one `<Polyline>` per segment between consecutive samples, each with `pathOptions.color = altitudeToColor(sample.altitude.msl)`. To keep DOM and CPU sane, segments are batched: consecutive samples whose altitudes fall in the same palette bucket share a single polyline. Bucket boundaries match the palette stops, so visual continuity matches the FlightPlanCard glyph.

**Sample altitude on breadcrumb.** Today, the breadcrumb store is a list of `LatLon`. v0.4.0 extends each entry to `{ lat: number; lon: number; altMsl: number }`. The aggregator (`server/src/state/aggregator.ts`) appends the altitude when it appends each breadcrumb point. `shared/types.ts` updates `FlightState.breadcrumb` accordingly.

### 4.2 TOC / TOD — plan-driven markers and countdown rework

**Computation (server-side).** Simbrief publishes **explicit TOC and TOD waypoints** in the navlog (idents literally `"TOC"` and `"TOD"`). The current map already renders them as ordinary fixes; v0.4.0 promotes them to first-class `tocPosition` / `todPosition` fields and uses them for the countdown.

A new pure module `server/src/route-math/cruise-points.ts` exports:

```ts
export function findTOC(waypoints: Waypoint[], cruiseAltitudeFt?: number): LatLon | null;
export function findTOD(waypoints: Waypoint[], cruiseAltitudeFt?: number): LatLon | null;
```

Algorithm:

1. **Primary — name match.** Look for a waypoint with `ident === 'TOC'` (or `'TOD'`). If present, return its position. This is what Simbrief gives us and is the source of truth for the planned profile.
2. **Fallback — altitude scan.** If no named TOC/TOD waypoint is present (e.g. a custom plan or a flight too short to have one), fall back to the altitude-based scan:
   - **TOC** — first waypoint whose `plannedAltitude` reaches the cruise altitude (or the highest planned altitude if no `cruiseAltitudeFt` is provided).
   - **TOD** — last waypoint at cruise altitude before a sustained descent.
3. **No result.** If neither path yields a position, return `null`.

These positions are computed once per plan load and cached on the `FlightState` payload.

**Plan-renderer note.** Once TOC/TOD are first-class fields, the map can render them with distinct icons (§ below) regardless of whether they're also in `plan.waypoints`. To avoid a double-marker, `PlannedRoute.tsx` filters out `ident === 'TOC' | 'TOD'` from its waypoint list — the dedicated `CruisePoints` layer renders them.

**Type additions.**

```ts
// shared/types.ts — FlightProgress
tocPosition: LatLon | null;
todPosition: LatLon | null;
eteToTocSec: number | null;   // null when past TOC, no plan, or no GS
eteToTodSec: number | null;   // null when past TOD, no plan, or no GS
```

`eteToTocSec` and `eteToTodSec` are computed in the aggregator as `greatCircleDistance(currentPos, target) / groundSpeed`. Past TOC/TOD the value is still computed (the math is symmetric); consumers that want to suppress display once passed can do so per-component, but the marker itself stays visible (see below).

**Map markers.** A new layer `web/src/components/Map/CruisePoints.tsx` renders TOC and TOD markers at their geographic positions whenever `tocPosition` / `todPosition` is non-null — markers stay visible for the entire flight (the user wants to see *where* TOC/TOD were even after passing). Distinct icons (TOC ↗ chevron, TOD ↘ chevron) so they're visually distinguishable from regular waypoints. Hidden only when the position itself is `null` (no plan, no detection).

**Clock card countdown rework.** The Clock card (`web/src/components/DataPanel/ClockCard.tsx`) currently estimates TOC from VS and TOD via 3:1. v0.4.0 swaps both for the new ETE values:

```
TOC in 4 min   (was: VS-based estimate)
TOD in 47 min  (was: 3:1 rule)
```

**Fallback.** If `tocPosition` or `todPosition` is `null` (no plan loaded), the Clock card falls back to the existing VS / 3:1 estimation. This is the only place the legacy estimator survives in v0.4.0 — it is a graceful degradation, not the primary path.

### 4.3 Skip-waypoint / navigation arrows

**Frontend-only override.** Skip-waypoint state lives entirely in the FE store, not on the server. Reasoning: the server's `progress.nextWaypoint` continues to follow auto-selection (distance-based), and our auto-resync clears the override on plan reload — so the override never gets stuck server-side. Keeping it FE-only avoids new WebSocket message types and keeps the protocol additive.

If we later add multi-device consistency requirements (the override syncs across PC + tablet open simultaneously), promoting it to server state is a clean upgrade — the existing `progress.nextWaypoint` becomes the resolved value and a new `progress.manualNextIndex: number | null` joins it. v0.4.0 ships the FE-only version.

A new field on `useFlightStore` (or a sibling `useNavStore` if the flight store is already busy):

```ts
type NavOverride = {
  // null = follow the server's auto-selected next waypoint;
  // number = user has manually selected this waypoint index in plan.waypoints[].
  manualNextIndex: number | null;
};
```

Persisted in `sessionStorage` (`ff:nav-override`). Cleared on plan reload (auto-resync — the user's "lost tracking" bug).

**Selectors.** A new helper `web/src/lib/activeWaypoint.ts`:

```ts
export function selectActiveNext(state: FlightState, override: number | null):
  { waypoint: Waypoint | null; distanceNm: number | null; eteSec: number | null };
```

When `override` is `null`, returns the server-derived `state.progress.nextWaypoint`/`distanceToNextNm`/`eteToNextSec`. When set, computes the FE-side distance/ETE to the override waypoint using `state.telemetry` and great-circle math (a small `distanceNm`/`bearingDeg` helper imported from a thin wrapper around the existing server `route-math` formulas, duplicated client-side as pure functions).

**Controls.** `RouteCard.tsx` (or wherever the active waypoint is displayed) gains two arrow buttons (◀ ▶) flanking the active waypoint label. ◀ decrements `manualNextIndex`, ▶ increments. A small "auto" link appears when override is non-null; clicking it sets `manualNextIndex = null`.

**Auto-resync conditions.** `manualNextIndex` resets to `null` when:

- A new plan is fetched (`plan.fetchedAt` changes).
- The user clicks the "auto" affordance.
- The override index goes out of bounds after a plan reshape (defensive — should not normally occur).

This eliminates the "reload plan → tracking jumps back to first waypoint and stays there" bug because the new mechanism is opt-in: until the user uses the arrows, behavior is identical to today; when the user does use the arrows, the next plan reload clears the override.

### 4.4 Origin → destination progress timeline

**Where.** TripCard (`web/src/components/DataPanel/TripCard.tsx`) gains a thin horizontal bar between the ETE and ETA rows. Bar height ~6 px, full width of the card content area.

**What it shows.**

```
[●━━━━━━━━━━━━●━━━━━━━━○━━━━━━━━━━━━━━●]
 ORG          TOC       AC              DST
                              TOD
```

- **Origin / destination ticks** at 0% and 100% (filled circles).
- **TOC / TOD ticks** at the percentage along the great-circle origin→destination distance where each lies (uses `tocPosition`/`todPosition` projected onto the orig→dest great circle for the percentage).
- **Aircraft tick** at the current position's percentage along origin→destination — derived from `1 - (distanceToDestNm / totalDistanceNm)`. Hollow circle.
- **Filled portion of the bar** is the segment between origin and aircraft.

**Edge cases.**

- No plan loaded → bar hidden.
- Aircraft hasn't moved (still at origin) → fill is 0 px, aircraft tick sits on the origin tick.
- TOC/TOD positions null → those ticks omitted; bar still renders with origin / aircraft / destination only.
- Aircraft past destination (post-arrival) → aircraft tick clamps to 100% and stays at the destination position.

### 4.5 Live ETA from `eteToDestSec`

TripCard's ETA row currently displays a value derived from Simbrief's `scheduledIn` (STA). v0.4.0 changes the display priority:

1. If `progress.eteToDestSec` is present, ETA = `now + eteToDestSec`, formatted as a UTC time. Label: "ETA (live)".
2. Otherwise, fall back to Simbrief `scheduledIn` if present. Label: "ETA (sched)".
3. Otherwise, render `—`.

The label distinguishes the two so the user knows whether they're seeing a live or planned value. Format: HH:MMz.

**Block time fix.** TripCard's "block time" row currently computes a derived value from `scheduledOut` and `scheduledIn`. v0.4.0 surfaces Simbrief's block time directly:

- Add `blockTimeSec?: number` to `FlightPlan` (parser extracts from Simbrief's `times.est_time_enroute` or `times.sched_time_enroute` — whichever Simbrief uses for block; verify during implementation).
- TripCard reads `plan.blockTimeSec` directly. No derivation.

**Times-vocabulary alignment (small audit).** During the TripCard work, audit every duration/time displayed across the panel and label it correctly. Concretely:

- "Block time" → gate-to-gate (OUT→IN), shown from `plan.blockTimeSec`.
- "Flight time (planned)" — if shown — labeled as flight time, OFF→ON. Currently named ambiguously in some places.
- "ETE" — time enroute to destination, live or planned, labeled as such.
- "ETA" — arrival clock time (live vs sched as above).
- All wall-clock times suffixed with `z` (Zulu) where applicable.

A short README block under "Times vocabulary" goes into `docs/notes/times-vocabulary.md` (new) so the convention has a single source of truth for future cards.

### 4.6 Alternate on map + alternate-only hover tooltip

**Render.** `web/src/components/Map/PlannedRoute.tsx` (or a new `Airports.tsx` if cleaner) adds a marker at `plan.alternate` when present, styled in blue (`--ff-alternate`, defined in `index.css` for both themes). Origin and destination keep their existing markers and fixed labels — they are *not* changed.

**Tooltip behavior.**

- **Origin / destination** — keep their current always-visible labels.
- **Alternate** — no fixed label; on marker hover, a Leaflet `Tooltip` shows `<ICAO> · <name>` (e.g. `EDDF · Frankfurt`). On mouse leave, tooltip hides.

The "airport tooltip on hover" idea applies only to the alternate. Origin and destination are visited every flight; alternate is rarely consulted, so the always-on label would be visual clutter for low value.

### 4.7 FlightPlanCard glyph progress reveal (option C, fallback B)

Today the FlightPlanCard altitude-profile glyph shows a full gradient across the entire planned route. v0.4.0 adds a progress overlay:

**Option C (default).** The full gradient stays. A semi-transparent mask overlays the *unflown* portion (e.g. 40% opacity gray), so the flown portion reads as more saturated. As the flight progresses, the mask shrinks toward the destination side. The progress percentage is the same value used by the timeline bar (§ 4.4) — `1 - distanceToDestNm / totalDistanceNm`.

**Fallback option B.** During implementation, if option C looks visually noisy or duplicates information, drop the mask and instead show the gradient *only* on the flown portion (unflown = neutral gray). Decision happens during the implementation review checkpoint; either is acceptable.

**Glyph implementation.** The glyph is currently drawn with an SVG `<linearGradient>` and a single `<path>` or `<rect>` referencing it. The progress overlay is a second SVG element (mask or clipped rect) controlled by a `progress: number` prop (0..1) read from the same source as the timeline.

## 5. Polish & bug fixes

### 5.1 FlightPlanCard collapsed-view clipping

When the FlightPlanCard route box is collapsed, the top of the third line of the route string is visible above the fold. The container's height should clamp to exactly two lines.

Fix: set `overflow: hidden` plus a precise `max-height` derived from `2 × line-height`. Alternative: switch to `line-clamp-2` (Tailwind v4 supports it); test for ellipsis behavior on monospace numerics first.

### 5.2 FlightPlanCard expanded-view name wrapping

When the route box is expanded, long fix names break in the middle (`RUDAP` → `RUD-AP`). Fix: `word-break: keep-all` plus `white-space: normal` on the route string container, so the browser wraps at whitespace only. The route string is already space-delimited; this is a one-line CSS fix.

### 5.3 Map mode — Overview→Manual on user gestures

Two related bugs in the view-mode state machine (`web/src/store/view.ts` and `web/src/components/Map/MapController.tsx`):

- **Zooming out of Overview does not switch to Manual.** Overview should mean "auto-fit"; any user-initiated zoom (in or out) should promote to Manual.
- **Clicking Overview when already active re-pans the map.** When the active mode equals the clicked mode, the click should be a no-op (no reset).

Fix: in the Map's user-gesture handler (Leaflet's `zoomstart` / `dragstart` / `movestart` triggered by user, not by code), if `mode !== 'manual'` and the gesture was user-initiated, set `mode = 'manual'`. In `ViewModeControl.tsx`, guard the click handler with `if (next === current) return`.

Distinguishing user-initiated from code-initiated map events is a known Leaflet pattern: code-initiated `setView`/`fitBounds` callers set a transient ignore flag; the gesture handler skips its work when the flag is set. The existing follow-mode logic likely already does this — extend the same pattern.

### 5.4 Altitude SimVar audit

Altitude in the panel doesn't always match the cockpit instrument (suspected: local-altimeter vs standard-pressure vs MSL discrepancy).

Audit: read the current SimVar choice in `server/src/sim-bridge/`. Likely currently using `PLANE_ALTITUDE` (true MSL) or `INDICATED_ALTITUDE`. The correct choice depends on what we want to display:

- Panel "Alt" row → typically what the pilot sees on their PFD = `INDICATED_ALTITUDE` (which respects the local altimeter setting set in the sim).
- Map / breadcrumb / altitude-coded gradient → `PLANE_ALTITUDE` (true MSL — independent of altimeter setting, consistent across flights).

Action: pick the right SimVar per use-site. Document in `docs/notes/altitude-vocabulary.md` (new). Likely outcome: panel shifts to `INDICATED_ALTITUDE` if it isn't already; gradient/map keep `PLANE_ALTITUDE`.

If both are needed simultaneously, extend `RawTelemetry.altitude` with both fields:

```ts
altitude: { msl: number; indicated?: number };
```

### 5.5 Heading icon — true vs magnetic + wind compass audit

**Bug.** At high-magvar latitudes (tested at NZQN, magvar ~22°E), the map plane icon visually points sideways even when panel HDG and TRK match. The wind compass also "looks weird" in the same conditions.

**Diagnosis.** The icon rotation pipeline most likely consumes magnetic heading (matching the panel value) while the map renders in true geographic bearings. The two diverge by the local magnetic variation. The fix is to use **true heading for any rotation applied on the map**, while the panel keeps showing **magnetic** to mirror cockpit instruments.

**Type addition.**

```ts
// shared/types.ts
heading: { magnetic: number; true: number };
```

`server/src/sim-bridge/` reads both `PLANE_HEADING_DEGREES_MAGNETIC` and `PLANE_HEADING_DEGREES_TRUE`.

**Use sites.**

| Component | Reads | Why |
|---|---|---|
| `PositionCard` HDG row | `magnetic` | Mirrors cockpit. |
| `MotionCard` (and any other panel HDG display) | `magnetic` | Same. |
| `AircraftMarker` (map plane icon rotation) | `true` | Map renders in true geographic bearings. |
| `WindCompass` arrow + heading triangle | mixed: arrows showing aircraft heading on the compass card use `magnetic` (compass mimics cockpit instrument), but if any element is overlaid on the map it uses `true`. v0.3.0 wind compass is a panel-only widget, so all-magnetic. Verify during implementation. |

**Track row addition.** While auditing heading, add a `track` field too:

```ts
track: { true: number };  // GPS_GROUND_TRUE_TRACK or PLANE_HEADING_DEGREES_GYRO
```

This enables (a) the new TRK row in PositionCard or MotionCard (§ 5.6), and (b) future track-vs-heading icon toggle (v0.5.0).

### 5.6 TRK row in panel

Add a small TRK row alongside HDG, displaying `track.true` formatted as `___°T` (suffixed `T` to disambiguate from magnetic). The row sits next to the HDG row in PositionCard (or MotionCard, wherever HDG currently lives).

When `track.true` and `heading.magnetic` differ by more than ~5°, this is the rough magnitude of the wind drift — useful avgeek info even though we don't compute drift explicitly.

### 5.7 Min-zoom limit

Leaflet currently allows zooming out far enough to show multiple Earths. Set `minZoom: 2` (or `3` — pick during implementation based on what looks right) on the `<MapContainer>`. One-line change in `Map.tsx`.

### 5.8 Map tooltip light-mode opacity tweak

In light mode the frosted-glass map tooltip is too transparent against light tiles. Reduce `--ff-tooltip-bg-opacity` (or equivalent) for the `:root` (light) values in `index.css`. Pure CSS tweak; no code.

### 5.9 Times-vocabulary alignment + Simbrief block time direct use

Already covered in § 4.5. Listed here for the polish-pass overview only.

## 6. Spike — Simbrief waypoint constraints

**Question.** Does Simbrief's OFP expose hard waypoint constraints (e.g. `at-or-below 5000 ft`, `max IAS 230 kt`) cleanly per-fix in the navlog, or are they buried in remarks / SID-STAR text?

**Method.** First task in implementation: dump a real Simbrief OFP (any flight with a SID/STAR with published constraints — ideally one of our existing fixtures' source flights). Inspect the JSON for fields like `altitude_constraint`, `speed_constraint`, or similar on each `navlog` waypoint.

**Decision rule.**

- **Cleanly available** (one or two fields per waypoint with parseable values) → extend `Waypoint` with optional `altConstraint?` and `speedConstraint?` fields, parse in `server/src/simbrief/parser.ts`, and add a Leaflet `<Tooltip>` on waypoint markers in `PlannedRoute.tsx` showing constraints when present.
- **Not cleanly available** (text remarks, SID/STAR-embedded) → defer to v0.5.0 with a note in the backlog. No partial implementation.

The decision happens within the first implementation task and gates whether the small constraint-rendering work is in scope.

## 7. Fixtures

Two new fixtures land in `scripts/fixtures/` next to `replay-eddb-circuit.jsonl`:

- `replay-eddb-lipz.jsonl` — Berlin → Trieste. Real A→B with a meaningful cruise phase. Primary fixture for verifying breadcrumb gradient, TOC/TOD markers, progress timeline, and live ETA.
- `replay-nzqn-nzwn.jsonl` — Queenstown → Wellington. Far-southern hemisphere flight with a go-around. Primary fixture for verifying the heading icon rotation fix (high magvar latitude) and as a future test case for go-around handling (parked v0.7+).

No new tooling — both work with the existing `dev:replay` harness:

```bash
npm run dev:replay -- scripts/fixtures/replay-eddb-lipz.jsonl
```

The default fixture for plain `npm run dev:replay` stays as `replay-eddb-circuit.jsonl` (no behavior change).

## 8. Data contract changes

In `shared/types.ts`:

```ts
export type RawTelemetry = {
  // …existing v0.3.0 fields…
  heading: { magnetic: number; true: number };       // was { magnetic: number }
  track: { true: number };                            // new
  altitude: { msl: number; indicated?: number };     // new optional
};

export type Waypoint = {
  // …existing fields…
  altConstraint?: { type: 'at' | 'at-or-above' | 'at-or-below'; ft: number };  // new — only if Spike succeeds
  speedConstraint?: { type: 'at-or-below'; kt: number };                         // new — same
};

export type FlightPlan = {
  // …existing fields…
  blockTimeSec?: number;  // new — Simbrief plan block time, gate-to-gate
};

export type FlightProgress = {
  // …existing fields…
  tocPosition: LatLon | null;   // new
  todPosition: LatLon | null;   // new
  eteToTocSec: number | null;   // new
  eteToTodSec: number | null;   // new
};

export type FlightState = {
  // …existing fields…
  breadcrumb: BreadcrumbSample[];  // was LatLon[]
};

export type BreadcrumbSample = { lat: number; lon: number; altMsl: number };  // new
```

All additions are optional or have a defined `null` semantic. The `breadcrumb` shape change is the one breaking shift; bumped in lockstep across server (aggregator) and frontend (BreadcrumbTrail, store, any consumer).

No new WebSocket message types. No new REST endpoints. The Simbrief parser absorbs the new field extractions.

## 9. Files touched

### New (web)

- `web/src/lib/altitudePalette.ts`
- `web/src/lib/activeWaypoint.ts`
- `web/src/components/Map/CruisePoints.tsx`
- `web/src/components/DataPanel/ProgressBar.tsx` (or inlined into TripCard if small enough)

### Modified (web)

- `web/src/components/Map/BreadcrumbTrail.tsx` (per-segment color + altitude consumption)
- `web/src/components/Map/AircraftMarker.tsx` (rotation uses `heading.true`; CSS variable already in place from v0.3.0)
- `web/src/components/Map/Map.tsx` (`minZoom`, alternate marker layer, ignore-flag pattern for user-gesture mode promotion)
- `web/src/components/Map/MapController.tsx` (user-gesture detection; mode promotion)
- `web/src/components/Map/PlannedRoute.tsx` (waypoint tooltip if Spike succeeds)
- `web/src/components/Map/ViewModeControl.tsx` (guard click when same mode)
- `web/src/components/DataPanel/FlightPlanCard.tsx` (collapsed-view clip fix; expanded-view wrap fix; glyph progress overlay)
- `web/src/components/DataPanel/TripCard.tsx` (progress timeline; live-vs-sched ETA; block time direct)
- `web/src/components/DataPanel/ClockCard.tsx` (TOC/TOD from new ETE fields; legacy fallback when null)
- `web/src/components/DataPanel/PositionCard.tsx` or `MotionCard.tsx` (TRK row)
- `web/src/components/DataPanel/RouteCard.tsx` (skip-waypoint arrows + auto link)
- `web/src/components/DataPanel/WindCompass.tsx` (verify rotation references — magnetic for now)
- `web/src/store/flight.ts` (or new `web/src/store/nav.ts`) — `manualNextIndex` and selectors
- `web/src/store/view.ts` (no schema change expected; verify ignore-flag pattern home)
- `web/src/index.css` (`--ff-alternate` token; light-mode tooltip opacity tweak)

### Modified (server)

- `server/src/sim-bridge/` — read `PLANE_HEADING_DEGREES_TRUE`, `GPS_GROUND_TRUE_TRACK` (or equivalent), and `INDICATED_ALTITUDE` (alongside the existing `PLANE_ALTITUDE`).
- `server/src/state/aggregator.ts` — append `altMsl` to breadcrumb samples; compute `tocPosition`, `todPosition`, `eteToTocSec`, `eteToTodSec`.
- `server/src/route-math/cruise-points.ts` — new pure module with `findTOC`, `findTOD`. Unit tests.
- `server/src/simbrief/parser.ts` — extract `blockTimeSec`; if Spike succeeds, extract `altConstraint`/`speedConstraint`.
- `server/src/simbrief/parser.test.ts` — assert new field extraction; assert "absent" symmetric cases.

### Modified (shared)

- `shared/types.ts` — all the additions above.

### New (docs)

- `docs/notes/times-vocabulary.md` — block / flight / ETE / ETA, planned vs actual, magnetic vs true.
- `docs/notes/altitude-vocabulary.md` — indicated vs MSL, where each is used.

### New (fixtures)

- `scripts/fixtures/replay-eddb-lipz.jsonl`
- `scripts/fixtures/replay-nzqn-nzwn.jsonl`

## 10. Tests

Per the project pattern: server gets unit tests, frontend is verified manually against fixtures.

### Server unit tests

- `route-math/cruise-points.test.ts` — TOC/TOD detection by named waypoint (primary path: ident `'TOC'` / `'TOD'`); fallback altitude-scan across plain climbs, stepped climbs, no-`plannedAltitude` plans, plans with no cruise altitude; edge cases (TOC at first waypoint, TOD at last waypoint, no TOC because plan stays at FL000, plan missing both named waypoints and `plannedAltitude` data → returns `null`).
- `state/aggregator.test.ts` — extend with TOC/TOD ETE computation, `null` past-the-point semantics, breadcrumb-sample altitude inclusion.
- `simbrief/parser.test.ts` — extend with `blockTimeSec` extraction (and absent-when-missing), and constraint-field extraction iff Spike succeeds.

### Frontend manual verification (against `replay-eddb-lipz.jsonl`)

- Breadcrumb segments visibly transition through altitude colors as the recorded flight climbs and descends.
- TOC marker appears at a sensible map position around the level-off altitude; TOD marker appears around the descent point. Both disappear once the aircraft passes them.
- Clock card shows "TOC in N min" derived from FP-position rather than VS jitter (note specifically during stepped climbs).
- Progress timeline in TripCard fills from origin to current position, with TOC/TOD ticks at sensible percentages.
- ETA row reads "ETA (live) HH:MMz"; matches reasonable arrival time. After unloading the plan: "ETA (sched)" or `—`.
- Skip-waypoint arrows let the user step through fixes; clicking "auto" returns to server-derived; reloading the plan auto-resyncs to server-derived without bouncing back to the first fix.
- Alternate marker shows in blue with hover tooltip.

### Frontend manual verification (against `replay-nzqn-nzwn.jsonl`)

- Map plane icon rotation aligns with the displayed track on the breadcrumb (visual sanity at high-magvar latitude).
- Wind compass arrow direction reads sensibly relative to the cockpit-style HDG.
- Go-around portion: aircraft visibly climbs, levels off near origin, re-approaches. No crashes; no breadcrumb anomalies.

### Frontend manual verification (general)

- FlightPlanCard collapsed shows exactly two lines, no peeking third.
- FlightPlanCard expanded wraps fix names cleanly (`RUDAP` whole, never `RUD-AP`).
- Zooming out of Overview promotes to Manual; clicking Overview when active is a no-op.
- Min-zoom prevents tile-grid wraparound.
- Light-mode map tooltip is more legible than v0.3.0.

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| TOC/TOD detection misfires on unusual plans (no cruise level-off, all-`plannedAltitude` zero, missing values) | Medium | Aggressive null-handling: any missing input → `null` position → marker hidden, Clock card falls back to legacy estimator. Unit-test the detection functions against several plan shapes. |
| Plan-derived TOC/TOD looks wrong because the aircraft isn't following the plan (off-track, slower climb) | Medium | The countdown formula is `distance to point ÷ current GS` — it self-corrects. If the user reports systematic mismatch in real flights, revisit in v0.5.0 with hybrid logic. Don't over-engineer now. |
| Per-segment polylines for the breadcrumb gradient become too many DOM nodes on long flights | Low–Medium | Bucket consecutive samples whose altitude falls in the same palette stop into a single polyline. Cap visible breadcrumb length if needed (already a v0.1.0 concern; not regressed). |
| `BreadcrumbSample` shape change breaks an in-flight session that loaded an older client/server pair | Low | Single-user app, server and client always deployed together. Document the change in the spec; no migration path needed. |
| Skip-waypoint state diverges between server and client because it's FE-only | Low | The server's `progress.nextWaypoint` continues to follow auto-selection; the FE override only changes display. No protocol divergence. |
| Light-mode tooltip opacity change overshoots and looks heavy | Low | CSS-only tweak, iterated visually during implementation. |
| Altitude SimVar swap changes panel readings noticeably mid-development, surprising the user | Low | Document in `altitude-vocabulary.md`; verify against the cockpit altimeter on the next live test. |
| Simbrief `est_time_enroute` vs `sched_time_enroute` ambiguity for block time | Medium | Inspect a real OFP during the spike; pick the field whose value matches the OFP's printed block time; document the choice. |
| Spike for waypoint constraints reveals partial data (e.g. only on some fixes) | Medium | Decision rule already specified: render only when present; defer to v0.5.0 if irregular enough to confuse users. |
| The progress overlay (option C) on the FlightPlanCard glyph reads as visual noise | Medium | Fall-back option B is pre-decided; switch is a single render-path swap. |
| `manualNextIndex` persists into a stale plan via sessionStorage | Low | Auto-resync on `plan.fetchedAt` change handles this; defensive bounds check on read. |

## 12. Backlog updates

After v0.4.0 ships, mark the following as completed-from-backlog so the file stays accurate:

- Breadcrumb altitude-coded gradient
- Plan-driven TOC/TOD detection (includes the v0.3.0-polish-backlog item)
- TOC/TOD markers on the map
- Skip-waypoint mechanism
- Origin → destination progress timeline bar
- Live ETA derived from `eteToDestSec`
- Block-time mismatch (using STA) — fixed by direct use of `plan.blockTimeSec`
- "Review the breadcrumb logic" — dropped (no longer remembered context)

The `docs/backlog.md` file is updated in the same commit as this spec to reflect the new v0.5.0 / v0.6.0 / v0.7+ structure documented in § 13.

## 13. Out of scope (deferred to v0.5.0 / v0.6.0 / v0.7+)

The full forward roadmap shape, agreed during this brainstorm:

### v0.5.0 — Personalization & per-user config

- Compact mode for cards.
- Card config (enable/disable + compact/extended), persisted per user.
- Switch plane icon color to airline color; show airline icon in FlightPlanCard and aircraft tooltip.
- Theme auto-switch based on aircraft day/night position (reuses the day/night calc shipped for the clock glyph).
- Plane icon track-vs-heading toggle (the *toggle* — the v0.4.0 fix only addresses the rotation reference bug).
- Move clock closer to TripCard.
- Waypoint altitude/speed limits in tooltips (if the v0.4.0 spike defers it).
- *From v0.3.0 polish backlog:* cost index / cruise Mach / avg forecast HD-TL on FlightPlanCard; local time at origin/destination; sunrise/sunset at destination; wind compass refinements (proportional arrow, HD/TL color cue, instrument-glass feel); parking-brake indicator.
- Clock fallback to real time after a sim-disconnect grace period.
- Actuals: compute OUT/OFF/ON/IN times from the on-ground boolean (the deferred half of "block time").

### v0.6.0 — Multi-device / Responsive

- Mobile-friendly layout.
- Alert center (replaces inline alerts).
- LAN IP shown on startup banner / settings panel.
- Header treatment for app-mode (kiosk / Electron-ready).

### v0.7+ — Platform & data expansion

- *From v0.2.0 backlog:* layers panel, unit switching, map style switcher, flight phase classifier, live METAR, live other-aircraft, FE-controlled replay module.
- *From v0.1.0 roadmap:* flight logging, 3D / Cesium view, FBW A320 FMC reading, Electron packaging.
- AUTO map mode (zoom by flight phase) — depends on the phase classifier.
- Airport elevation data for FlightPlanCard glyph.
- Go-arounds / diverted flights handling — fixture-driven via NZQN→NZWN.
- **Flight-type model (IFR / VFR / etc.).** Architectural pre-work, not a user feature: a `FlightType` enum on `FlightPlan` that gates per-type behavior (which TOC/TOD logic to apply, which time conventions to display, which alts/speeds matter). Worth scoping when we have at least two consumers — e.g. when adding VFR-style flights or when actuals (OUT/OFF/ON/IN) need to differentiate. Likely an internal aggregator concept first, surfaced to the FE only when behavior actually diverges.

## 14. Open questions during implementation (not blocking spec approval)

- Exact Simbrief field for plan block time (`times.est_time_enroute` vs `times.sched_block` etc.) — confirm against a real OFP at parser-extension time.
- Whether the breadcrumb-sample shape change requires a session-storage migration (probably not — sessionStorage on the FE doesn't persist breadcrumbs across sessions today).
- Whether the progress overlay on the FlightPlanCard glyph is option C (default) or option B (fallback) — decided visually during implementation review.
- Whether `WindCompass` consumes `magnetic` or `true` — likely `magnetic` (it's a panel widget mimicking a compass instrument), but verify during implementation.
