# Flight Follower — v0.2.0 Design Spec

- **Date:** 2026-04-25
- **Status:** Approved, ready for implementation planning
- **Scope:** v0.2.0 (bugs and quick polish on top of shipped v0.1.0)
- **Predecessor:** [`2026-04-24-flight-follower-v0.1.0-design.md`](./2026-04-24-flight-follower-v0.1.0-design.md)

## 1. Overview

v0.2.0 is a focused polish-and-bugfix release on top of shipped v1. It fixes a handful of irritations the user hit in real flights and lands small, isolated UX wins that do not depend on a redesign. None of the items require a styling overhaul or a component library — those land in v0.3.0.

The release is intentionally narrow. Everything that touches the visual system (component library, dark mode, panel layout, compass widget, map style, flight-info card) is deferred to v0.3.0 so we can do that pass with one coherent design eye instead of restyling twice. Everything that builds on the planned-route mechanics (skip-waypoint, TOC/TOD markers, altitude-coded breadcrumb, progress timeline) is deferred to v0.4.0 so it sits on top of v0.3.0's foundation.

## 2. Goals

1. Eliminate the pre-spawn line from (0,0) to the spawn point on map load.
2. Show the aircraft icon pointing in the correct direction.
3. Make on-screen position read steadily instead of flickering on every frame.
4. Make telemetry recording reliable on Windows and observable from the server log.
5. Persist the user's chosen map view mode across page reloads within the same browser session (resetting to the default in a new session).
6. Stop dropping waypoint label clutter on the map by default.
7. Allow zooming in **Follow** mode without falling back to **Manual**.
8. Show the airport name alongside its ICAO code.
9. Show three UTC times — current (sim time when available), scheduled departure, scheduled arrival.

Plus one developer-experience improvement that piggybacks on the recording fix: a forward-only seek for the replay harness so the long pre-flight setup can be skipped during dev.

## 3. Non-goals (v0.2.0)

- No component library, no dark mode, no theme tokens — all of that is v0.3.0.
- No layout redesign of `DataPanel` — it stays as it is; only existing cards change content.
- No new map controls (no map-style switcher, no layers panel).
- No changes to the WebSocket message shape, the REST surface, or the breadcrumb / progress / view stores beyond the persistence add-on.
- No frontend UI for recording status — clear server logs are enough for now.
- No backward seek in replay; only `REPLAY_START_MS`. A full FE-driven replay module is a v2/v3 candidate (see `docs/backlog.md`).
- No live ETA — that lands in v0.4.0 next to the timeline bar.

## 4. Items, with approach

Each item is an isolated change. They can be implemented and reviewed independently.

### 4.1 Drop pre-spawn telemetry frames (server-side)

When MSFS is on the menu / loading screen, `node-simconnect` reports the aircraft at approximately `(0, 0)` — confirmed in the uploaded `replay-eddb-circuit.jsonl` fixture, which sits at `lat = 0.000408, lon = 0.013975` for the first 56 frames before jumping to EDDB.

Filter applied in the aggregator (`server/src/state/aggregator.ts`) **before** the frame mutates state or is broadcast: drop any telemetry where `Math.abs(lat) < 1 && Math.abs(lon) < 1`. The 1° margin is a 111 × 111 km box centred at the equator/prime-meridian intersection, entirely in the Gulf of Guinea — no airports there, no real flight plan crosses it. False positives are not a concern.

This filter is server-side so we never broadcast 0,0 frames, never breadcrumb them, and never paint a polyline through them. The frontend remains unaware.

### 4.2 Aircraft icon rotation (frontend)

Replace the unicode `✈` glyph in `web/src/components/Map/AircraftMarker.tsx` with a small inline SVG that points **north at 0°**. Apply `transform: rotate(${heading}deg)` directly — no offset.

The SVG is a simple north-pointing aircraft silhouette, ~24 px square, currentColor-fillable so v0.3.0's theme can recolor it without code changes.

### 4.3 Position decimal precision (frontend)

In `web/src/components/DataPanel/PositionCard.tsx` (and helpers in `web/src/components/DataPanel/fmt.ts`), render position with **2 decimal places** and a hemisphere suffix: `52.36° N · 13.51° E`.

Two decimal places gives ~1.1 km precision, which is plenty for situational awareness and stable enough that the value does not flicker on every 2 Hz update at typical ground speeds. The wire format is unchanged — the truncation is purely a render concern.

### 4.4 Recording UX (server)

Three changes in `server/src/index.ts`, none affecting the frontend.

a) **Resolve `FF_RECORD_PATH` against `process.cwd()`** when entering through the regular CLI launcher. Currently the regular launcher passes the env var as-is to `createWriteStream`, which works on POSIX but is surprising on Windows where the working directory of `npm --workspace server run start` is `<repo>/server`, not the repo root. After the change, both relative and absolute paths behave the same on every platform: relative paths resolve against the shell's CWD.

b) **Log the resolved absolute path** at startup (`[record] writing to /abs/path/foo.jsonl`). The existing log line already does this, but with the unresolved value, which is misleading.

c) **30-second heartbeat** — every 30s the recording stream logs `[record] +N events (M total)`. Counter is reset every heartbeat. On shutdown, log `[record] flushed M total events to <path>`. If the first heartbeat fires with `N === 0`, log a warning suggesting the sim might not be running or telemetry is not flowing, so the user notices misconfigurations within 30s instead of after a flight.

### 4.5 Forward-only replay seek

In `scripts/dev-telemetry-replay.ts`, honor a new env var `REPLAY_START_MS`. Default `0`. When set to N, the replay loop skips fixture entries until the cumulative wall-clock time relative to the first frame exceeds N ms; from there it streams normally.

This is a developer ergonomics fix — real recordings have several minutes of stationary "configuring the FMC" time at the start. The user can set `REPLAY_START_MS=120000` to skip the first two minutes.

Backward seek is explicitly out of scope (would require resetting the breadcrumb and progress state and a control surface, which is the v2/v3 replay-module work).

### 4.6 Persist map view mode (frontend)

Wrap the Zustand store in `web/src/store/view.ts` in the `persist` middleware (`zustand/middleware`), keying on `ff:view-mode`, and back it with **`sessionStorage`** via `createJSONStorage(() => sessionStorage)`. The persisted value is just the `mode` field; map center and zoom are not persisted (they get rederived by `MapController`).

Behavior:
- Reloading the tab keeps the chosen mode (Follow stays Follow).
- Closing the tab / window or starting a new browser session falls back to the default `overview`.

This matches the "second-monitor companion" usage pattern: a fresh viewing session should re-frame the route, but accidental reloads should not undo a deliberate Follow choice.

### 4.7 Waypoint labels on hover (frontend)

In `web/src/components/Map/PlannedRoute.tsx`, change the `<Tooltip>` for waypoint markers from `permanent` to non-permanent (default behavior — show on mouseover, hide otherwise). Origin and destination labels stay permanent: they are the route's anchors and are useful at a glance.

### 4.8 Allow zoom in Follow mode (frontend)

In `web/src/components/Map/MapController.tsx`, remove the `zoomstart` handler that flips `mode` to `manual`. Keep `dragstart` — panning still drops to manual. The follow-on-aircraft `useEffect` already uses `map.panTo(...)` which preserves the user's zoom, so zooming in Follow now "just works".

### 4.9 Airport name alongside ICAO (full-stack)

a) **Shared types**: `Airport.name?: string`.

b) **Simbrief parser** (`server/src/simbrief/parser.ts`): read `origin.name`, `destination.name`, `alternate.name` from the OFP. Optional in the schema (some users might have OFPs without it; we degrade gracefully).

c) **Frontend**: in `RouteCard`, render as `EBBR · Brussels Airport` (separator is U+00B7). On the map (`PlannedRoute`), origin and destination tooltips show ICAO on the first line and name (when present) on the second, slightly smaller.

### 4.10 UTC times — current, sched dep, sched arr (full-stack)

a) **Sim time on telemetry**. Add to `server/src/sim-bridge/variables.ts` four new SimVars:

```
ZULU YEAR        — number
ZULU MONTH OF YEAR — number
ZULU DAY OF MONTH  — number
ZULU TIME        — seconds since midnight UTC
```

`buildTelemetry()` composes them into `simTimeUtc?: number` (epoch ms) using `Date.UTC(year, month - 1, day) + zuluTime * 1000`. The field is optional; in replay (and during pre-spawn frames), it's absent and the FE falls back to `Date.now()`.

b) **Shared types**: `RawTelemetry.simTimeUtc?: number`.

c) **Schedule on plan**. Simbrief OFP exposes `times.sched_out` (off-block UTC) and `times.sched_in` (on-block UTC) as integer seconds-since-epoch strings. Parse them. `FlightPlan.scheduledOut?: number`, `FlightPlan.scheduledIn?: number` (epoch ms).

d) **Frontend** (`web/src/components/DataPanel/TimeCard.tsx`): show three UTC times stacked.
- **Now** — sim time when present, wall clock otherwise. When sim time is in use, append a small "(sim)" tag.
- **Sched. dep** — `scheduledOut`, formatted `HH:mm UTC`. Render `—` if absent.
- **Sched. arr** — `scheduledIn`, formatted `HH:mm UTC`. Render `—` if absent.

The existing `TimeCard` is essentially rewritten; everything else in `DataPanel` is unchanged.

## 5. Data contract changes

In `shared/types.ts`:

```ts
export type Airport = {
  icao: string;
  lat: number;
  lon: number;
  name?: string;
};

export type RawTelemetry = {
  // ... unchanged fields ...
  simTimeUtc?: number;        // epoch ms, derived from MSFS ZULU vars
};

export type FlightPlan = {
  // ... unchanged fields ...
  scheduledOut?: number;      // epoch ms, Simbrief times.sched_out
  scheduledIn?: number;       // epoch ms, Simbrief times.sched_in
};
```

No new WebSocket message types. No new REST endpoints. No new env vars on the production server (the new `REPLAY_START_MS` is a dev-only var consumed by `scripts/dev-telemetry-replay.ts`).

## 6. Files touched

| Layer | Files |
|---|---|
| shared | `shared/types.ts` |
| sim-bridge | `server/src/sim-bridge/variables.ts` |
| aggregator | `server/src/state/aggregator.ts`, `server/src/state/aggregator.test.ts` |
| simbrief | `server/src/simbrief/parser.ts`, `server/src/simbrief/parser.test.ts` |
| server entry | `server/src/index.ts` |
| dev tooling | `scripts/dev-telemetry-replay.ts`, `.env.example`, `README.md` |
| web map | `web/src/components/Map/AircraftMarker.tsx`, `web/src/components/Map/MapController.tsx`, `web/src/components/Map/PlannedRoute.tsx` |
| web cards | `web/src/components/DataPanel/PositionCard.tsx`, `web/src/components/DataPanel/RouteCard.tsx`, `web/src/components/DataPanel/TimeCard.tsx`, `web/src/components/DataPanel/fmt.ts` |
| web store | `web/src/store/view.ts` |

No new files. No file deletions.

## 7. Tests

Per project pattern: server gets unit tests, frontend is verified manually against the replay fixture.

- **Aggregator** (`aggregator.test.ts`): a frame at `(0.0004, 0.014)` is dropped; a frame at `(52.36, 13.51)` is accepted; a frame at `(0.999, 0.999)` is dropped (boundary on the inside); a frame at `(1.001, 0)` is accepted (boundary on the outside).
- **Parser** (`parser.test.ts`): extend the existing fixture-based test to assert `origin.name`, `destination.name`, `scheduledOut`, `scheduledIn` are extracted. If the existing test fixture lacks these fields, add them.
- **Frontend**: visual verification with `replay-eddb-circuit.jsonl`. Key checks:
  - No line from (0,0) to EDDB on first load.
  - Aircraft icon points where the airplane is heading.
  - Position card shows e.g. `52.36° N · 13.51° E`, stable.
  - In Follow mode, scrolling the wheel zooms without flipping to Manual.
  - Reload preserves the chosen map mode; closing and reopening the tab resets to `overview`.
  - Waypoint markers show their ident only on hover; origin/dest show always.
  - `TimeCard` shows three UTC values; when running against the replay (no `simTimeUtc`), "Now" uses wall clock without the "(sim)" tag.

## 8. Backwards compatibility & migration

- All new fields are optional (`?:`) — older fixtures, older recordings, and pre-existing OFPs continue to parse.
- The persisted view-mode key `ff:view-mode` lives in `sessionStorage`, which is per-tab and starts empty for every new session; absence falls through to the default (`overview`).
- The `RawTelemetry` filter at near-(0,0) is server-side and does not affect any consumer.

## 9. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| MSFS does not expose a meaningful `ZULU YEAR/MONTH/DAY` when the sim is on the menu | High | Field is optional; FE falls back to wall clock. Pre-spawn filter (§4.1) covers most of this anyway. |
| Some Simbrief OFPs do not include airport `name` | Low | Field is optional; render falls back to ICAO only. |
| Some Simbrief OFPs do not include `times.sched_out` / `times.sched_in` | Low | Fields are optional; render `—`. |
| Heartbeat log at 30 s is too noisy in long flights | Low | Easy tuning later — change interval. We accept "welcome noise" for v0.2.0. |
| Removing the `zoomstart` handler creates an unforeseen mode-flip bug | Low | Manual test via replay covers the standard cases; if a corner appears we add it back behind a small heuristic. |

## 10. Out of scope (deferred)

Captured fully in `docs/backlog.md`. Summarized:

- **v0.3.0** — component library, dark mode, panel layout / grouping, wind compass, map style refinement, flight-info card.
- **v0.4.0** — breadcrumb altitude gradient, skip-waypoint, TOC/TOD markers, progress timeline, live ETA.
- **Backlog** — layers panel, unit toggling, map style switcher, flight phase classifier, METAR, other aircraft, full FE-controlled replay module.
