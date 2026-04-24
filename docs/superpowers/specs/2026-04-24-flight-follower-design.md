# Flight Follower — Design Spec

- **Date:** 2026-04-24
- **Status:** Approved, ready for implementation planning
- **Scope:** v1

## 1. Overview

Flight Follower is a local web app that displays live MSFS2020 flight data on a map alongside a planned route imported from Simbrief. It runs on the same Windows PC that hosts MSFS and serves a browser UI to that PC and any other device on the local network.

The primary viewer is a second monitor on the sim PC; a secondary viewer is any tablet/phone/laptop on the LAN opening the server's URL.

## 2. User workflow context

The target user:
- Plans flights in Simbrief.
- Starts MSFS as a VFR flight (no MSFS flight plan loaded).
- Flies the FlyByWire A320 (FBW A32NX) and enters the route manually into the FMC.

Implication: MSFS itself has no loaded flight plan the server can query. The planned route lives in Simbrief (and, redundantly, in the FBW FMC, which we don't read in v1). Simbrief is therefore the single source of truth for the planned route.

## 3. Goals (v1)

1. Live telemetry on a 2D map: aircraft position, heading, actual breadcrumb trail.
2. Side-panel showing altitude, speeds (GS/IAS/Mach), heading, vertical speed, wind, flight time, next waypoint + ETA, distance and time remaining to destination.
3. Import a Simbrief flight plan on demand and render the planned route (polyline + waypoint markers) on the map.
4. Visual deviation: because planned route and actual breadcrumb are both drawn, deviations are immediately apparent.
5. Three map view modes: **Overview** (fit to origin + destination), **Follow** (auto-center on aircraft), **Manual** (pinned to wherever the user dragged).
6. Graceful behavior when the sim isn't running, Simbrief is unreachable, or no plan is loaded yet.

## 4. Non-goals (v1)

Explicitly out of scope to prevent drift:

- Flight logging / persistence of past flights (planned for a later version; architecture leaves room for it).
- Actual-vs-planned comparison reporting.
- Reading the FBW A320 FMC flight plan (custom LVAR parsing is a separate, substantial effort).
- Handling plan changes mid-flight automatically (if the user redispatches in Simbrief, they re-press "Fetch latest" manually).
- 3D terrain / globe view (Leaflet 2D only; Cesium remains a potential v2 swap).
- Multi-user auth, accounts, hosted deployment (single-user, LAN only).
- SIDs / STARs as distinct procedures — the route is just the waypoint list from Simbrief.
- Weather overlays, METAR/TAF, charts.
- Mobile-first responsive layout (layout targets laptop/tablet).
- Electron packaging (see §12 — designed to be drop-in later but not built now).

## 5. Architecture & topology

One Node process on the Windows PC serves both the WebSocket and the static React bundle on a single all-interfaces port (e.g. `0.0.0.0:4444`).

```
┌────────────────────────────────────────────────────────────────┐
│  Windows gaming PC (running MSFS2020)                          │
│                                                                │
│  ┌──────────────┐      SimConnect      ┌────────────────────┐  │
│  │  MSFS2020    │ ◄───(TCP/pipe)─────► │  flight-follower   │  │
│  └──────────────┘                      │  server (Node/TS)  │  │
│                                        │                    │  │
│  ┌──────────────┐       HTTPS          │  sim-bridge        │  │
│  │  Simbrief    │ ◄────(fetch)───────► │  simbrief          │  │
│  │  API         │                      │  route-math        │  │
│  └──────────────┘                      │  state             │  │
│                                        │  transport         │  │
│                                        │                    │  │
│                                        │  Static React +    │  │
│                                        │  WebSocket on :P   │  │
│                                        └───────▲────────────┘  │
│                                                │               │
│  ┌──────────────┐     2nd monitor              │               │
│  │  Browser     │ ◄───────────(LAN)────────────┘               │
│  └──────────────┘                                              │
└────────────────────────────────────────────────────────────────┘
                        │  http://<gaming-pc-ip>:P
                        ▼
              ┌──────────────┐
              │ Tablet/phone │
              └──────────────┘
```

Rationale:
- **Single process** — simplest deployment, lowest operational surface.
- **Same port for HTTP + WS** — no CORS, no multi-port firewall rules.
- **Simbrief fetched server-side** — keeps pilot ID out of frontend, avoids browser CORS issues.
- **No external services** beyond the sim and Simbrief.

## 6. Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript everywhere | User proficiency; single type system across server/client |
| SimConnect bridge | `node-simconnect` | Pure-TS, no native addons (Electron-friendly), actively maintained |
| Server framework | Fastify | Fast, first-class TS, small footprint; Express also fine |
| WebSocket | `ws` | Minimal, standard, pairs cleanly with Fastify |
| Validation | Zod | Typed runtime validation of Simbrief responses and API inputs |
| Frontend build | Vite + React | Fast dev loop, standard stack |
| Map | Leaflet | Free, no API key, great for 2D aviation-style tracking; swap to Cesium possible later |
| Client state | Zustand | Lightweight, no boilerplate, scales fine for this size |
| Tests | Vitest | Works for both server and client, same toolchain |

## 7. Module / component breakdown

### Server (`server/`)

```
server/
├── sim-bridge/          Connects to SimConnect, polls telemetry
│   ├── client.ts         Manages node-simconnect connection + reconnect
│   ├── variables.ts      Declares which SimVars we subscribe to
│   └── types.ts          RawTelemetry type
│
├── simbrief/            Simbrief integration
│   ├── client.ts         fetch(username) → OFP JSON (Zod-validated)
│   ├── parser.ts         OFP JSON → FlightPlan
│   └── types.ts          FlightPlan, Waypoint
│
├── route-math/          Pure functions, zero side effects
│   ├── distance.ts       Great-circle distance, bearing
│   ├── progress.ts       Next-waypoint selection, distance-to-next, ETE
│   └── deviation.ts      Cross-track distance from planned route
│
├── state/               Aggregates everything into FlightState
│   └── aggregator.ts
│
├── transport/           Outbound wire protocols
│   ├── http.ts           Fastify: static files + /api/* routes
│   ├── ws.ts             WebSocket: broadcasts FlightState at 2 Hz
│   └── schemas.ts        Zod schemas for API inputs
│
├── config/              Runtime config
│   └── settings.ts       Simbrief pilot ID stored in a JSON file
│
└── index.ts             Exports start({ configPath, staticPath, port })
                         and invokes it with defaults when run directly
```

Module responsibility matrix:

| Module | Owns | Does not know about |
|---|---|---|
| `sim-bridge` | SimConnect protocol, SimVar list | Flight plans, clients, math |
| `simbrief` | Simbrief API shape, parsing | The sim, transport |
| `route-math` | Math on coordinates + plans | Everything else — pure |
| `state` | Aggregated flight state | How data is transported |
| `transport` | HTTP + WS wire protocol | Flight plans, SimConnect |

### Frontend (`web/`)

```
web/
├── src/
│   ├── api/
│   │   ├── ws.ts          WebSocket client with backoff reconnect
│   │   └── rest.ts        Fetch plan, save settings
│   │
│   ├── store/
│   │   ├── flight.ts      Zustand: live FlightState
│   │   └── view.ts        Zustand: map view mode + drag state
│   │
│   ├── components/
│   │   ├── Map/
│   │   │   ├── Map.tsx
│   │   │   ├── AircraftMarker.tsx       Rotated icon at current position
│   │   │   ├── BreadcrumbTrail.tsx      Polyline of actual path
│   │   │   ├── PlannedRoute.tsx         Polyline + waypoint markers
│   │   │   └── ViewModeControl.tsx      Overview / Follow / Manual
│   │   │
│   │   ├── DataPanel/
│   │   │   ├── DataPanel.tsx
│   │   │   ├── PositionCard.tsx
│   │   │   ├── SpeedCard.tsx             GS / IAS / Mach
│   │   │   ├── AltitudeCard.tsx          MSL + VS
│   │   │   ├── WindCard.tsx
│   │   │   ├── TimeCard.tsx              Elapsed flight time
│   │   │   └── RouteCard.tsx             Next WP + ETA, dest dist + ETE
│   │   │
│   │   ├── ConnectionStatus.tsx
│   │   └── SettingsDialog.tsx            Simbrief ID + "Fetch latest plan"
│   │
│   └── App.tsx
│
└── vite.config.ts
```

### Shared (`shared/`)

```
shared/
└── types.ts              RawTelemetry, FlightPlan, FlightState, WsMessage
```

Imported by both server and client. Acts as the contract — type errors surface on both sides if it drifts.

## 8. Data contracts

```typescript
// Raw, unprocessed data from the sim
type RawTelemetry = {
  timestamp: number;            // server ms since epoch
  position: { lat: number; lon: number };
  altitude: { msl: number };    // feet
  speed: {
    ground: number;             // knots
    indicated: number;          // knots
    mach: number;
  };
  heading: { magnetic: number }; // degrees
  verticalSpeed: number;         // feet/min
  wind: { direction: number; speed: number };
  onGround: boolean;
};

type Waypoint = {
  ident: string;
  lat: number;
  lon: number;
  plannedAltitude?: number;
};

type FlightPlan = {
  fetchedAt: number;
  origin: { icao: string; lat: number; lon: number };
  destination: { icao: string; lat: number; lon: number };
  waypoints: Waypoint[];
  alternate?: { icao: string; lat: number; lon: number };
};

type FlightState = {
  connected: boolean;                  // SimConnect connection status
  telemetry: RawTelemetry | null;      // null before first poll
  plan: FlightPlan | null;             // null before import
  breadcrumb: { lat: number; lon: number }[];
  progress: {
    nextWaypoint: Waypoint | null;
    distanceToNextNm: number | null;
    eteToNextSec: number | null;
    distanceToDestNm: number | null;
    eteToDestSec: number | null;
    flightTimeSec: number | null;      // elapsed since takeoff
  };
};

// Server → client envelope
type WsMessage =
  | { type: 'state'; payload: FlightState }
  | { type: 'plan'; payload: FlightPlan }
  | { type: 'error'; payload: { code: string; message: string } };
```

## 9. Data flow

### Telemetry (continuous)

```
① sim-bridge opens SimConnect, subscribes to SimVars
② every 500ms: emits RawTelemetry
③ state/aggregator:
     • appends position to breadcrumb (down-sampled — see below)
     • if onGround just flipped false → start flight timer
     • computes progress via route-math (if plan present)
     • updates internal FlightState
④ transport/ws broadcasts { type: 'state', payload } to all clients
⑤ browser: store.setFlight(payload) → React re-renders map + panel
```

### Simbrief import (one-shot)

```
User clicks "Fetch latest plan"
  ↓
POST /api/simbrief/fetch    (pilot ID pulled from saved settings)
  ↓
simbrief/client → GET simbrief.com/api/xml.fetcher.php?username=X&json=1
  ↓
simbrief/parser → FlightPlan
  ↓
state.setPlan(plan)
  ↓
WS broadcast { type: 'plan', payload }
  ↓
PlannedRoute draws polyline + waypoints
Overview mode recalculates bounds from origin → destination
```

### Update rates & throttling

- **Telemetry poll**: 2 Hz (500 ms interval). Smooth enough visually; cheap.
- **Breadcrumb sampling**: store one point every ~5 seconds OR whenever heading changes by >2°, whichever happens first. Bounded growth, keeps turns visible.
- **WS broadcast**: one message per telemetry tick. Payload ~1–2 KB; negligible on LAN.

## 10. UX behavior

### Map view modes

| Mode | Behavior |
|---|---|
| **Overview** (default on plan import) | Fit bounds to origin + destination (+ reasonable padding). Aircraft icon visible wherever it is; map does not re-fit after initial placement. |
| **Follow** | Map auto-centers on aircraft on every telemetry update. Zoom preserved. |
| **Manual** | Whatever the user has panned/zoomed to — sticky. Entered automatically whenever the user drags or pinches the map. |

Transitions:
- User clicks **Overview** button → Overview (re-fits to origin/destination if plan present; else no-op with a hint).
- User clicks **Follow** button → Follow.
- User drags the map → Manual (regardless of previous mode).

Aircraft icon always rotates to current magnetic heading, in all modes. Map itself is always north-up (heading-up deferred).

### Data panel

Displayed at all times on the right side:
- **Position** — lat/lon (decimal degrees, 4 dp)
- **Altitude** — MSL in feet
- **Speed** — Ground Speed, Indicated Airspeed, Mach
- **Heading** — magnetic
- **Vertical speed** — ft/min
- **Wind** — direction / speed (knots)
- **Flight time** — elapsed since takeoff (HH:MM:SS)
- **Next waypoint + ETA** — only if plan present
- **Distance to destination** — great-circle nautical miles
- **Time remaining to destination** — `distance / ground_speed` (shown only when GS > threshold, e.g. 50 kts)

Any value sourced from absent data (no telemetry yet, no plan) shows `—`, never a crash or blank.

### Settings

Simple dialog:
- Simbrief pilot ID (text field, persisted in `config/settings.json`)
- "Fetch latest plan" button — triggers the flow in §9

## 11. Error handling

Every external dependency has a bounded recovery. The server never crashes on a recoverable failure.

| Failure | Detection | Recovery | User experience |
|---|---|---|---|
| MSFS not running / SimConnect unavailable at startup | `node-simconnect.open()` throws | Retry every 5s indefinitely | Header: `● Sim disconnected`; map shows last known state; panel values dimmed |
| SimConnect drops mid-flight | Library `close` event | Same 5s retry loop | Same dimmed state; resumes cleanly on reconnect |
| Simbrief fetch fails (no internet, unknown user, no dispatch, malformed) | Non-200 or Zod parse error | Return typed error to client; no server-side retry | Toast: `Couldn't fetch plan: <reason>`; user retries manually |
| WebSocket disconnects | Client `onclose` | Exponential backoff reconnect: 1s → 2s → 4s → 10s (cap) | Small "reconnecting…" badge; state resumes on reconnect |
| Plan imported but telemetry not yet received | `telemetry === null` in render | Render with `—` placeholders | No error; panel shows dashes |
| Plan not imported | `plan === null` | Hide PlannedRoute layer + RouteCard | Subtle hint: "Import a plan to see route info" |

Principles:
- UI always renders; missing values are `—`.
- Reconnects are automatic; user never restarts the server.
- Log recoverable failures; never crash on them.

## 12. Future-proofing notes

To keep future extensions cheap:

### Electron packaging (potential future)

`node-simconnect` is pure TypeScript (no C++ addons), which removes the biggest Electron landmine. To stay Electron-ready without building it now:

1. **No hardcoded paths or `process.cwd()` assumptions.** The server takes `configPath` and `staticPath` as explicit parameters.
2. **Separate `createServer` from `startServer`.** The entry point exports a `start({ configPath, staticPath, port })` function. Standalone run calls `start()` with sensible defaults; a future Electron main process imports and calls `start()` directly (no child process needed).

With these, future Electron packaging is ~a half-day of work: one `BrowserWindow` pointed at `http://localhost:PORT`, `app.whenReady()` calls `start()`, bundle with `electron-builder`.

### Flight logging (v2)

The `state/aggregator` already produces a clean `FlightState` stream. Logging is an additional consumer of that stream — one module (`logger/`) that appends to JSONL or SQLite. No refactor of existing modules needed.

### FBW FMC reading (v3)

Would be a new `fbw-bridge/` module alongside `sim-bridge/`, feeding its own `FmcPlan` into `state/aggregator`. The aggregator would reconcile Simbrief-plan vs. FMC-plan; no changes to `transport` or the frontend contract beyond adding a field.

### Cesium (v2 visual upgrade)

Swap `components/Map/` implementation; the data contract (`FlightState`, plan) is already coordinate-based and map-library-agnostic.

## 13. Testing strategy

| Layer | Approach |
|---|---|
| `route-math/` | Unit tests (Vitest). Pure functions; test against published great-circle values and fixtures. |
| `simbrief/parser.ts` | Unit tests with a saved real OFP JSON fixture. |
| `state/aggregator.ts` | Unit tests with synthetic `RawTelemetry` + fixture plan. Cover: breadcrumb sampling, takeoff detection, progress calculations. |
| `sim-bridge/` | **Manual validation.** Mocking SimConnect realistically is expensive and brittle. Instead: a `dev-telemetry-replay` CLI pipes a pre-recorded JSONL of `RawTelemetry` into the aggregator so the rest of the stack can be developed without MSFS. |
| Frontend | Not unit-tested. Manual browser testing. Value is in rendered map + panel, which is cumbersome to test meaningfully for a solo hobby app. |
| End-to-end | Manual: run MSFS, fly a short hop, verify. |

The `dev-telemetry-replay` script is a deliberate investment — it lets UI and aggregator iteration happen without firing up the sim each time.

## 14. Open questions / deferred decisions

None blocking v1 implementation. The following are intentionally deferred and will be revisited if/when the corresponding feature is picked up:

- Exact on-disk format for flight logs (JSONL vs. SQLite) — decide when implementing logging.
- FBW LVAR reading approach (SimConnect Client Data Area vs. WASM module) — decide when implementing FMC read.
- Port number default (`4444` is a placeholder; can be changed trivially at any time).
