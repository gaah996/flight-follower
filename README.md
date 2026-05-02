# flight-follower

A small web app that streams live MSFS2020 telemetry to a map and a data panel, alongside a planned route imported from Simbrief. Runs as a single Node process on the same PC as the sim and exposes a browser UI on the local network — open it on a second monitor or any tablet/phone on the LAN.

Built for personal use while flying the FlyByWire A32NX, but works with any aircraft that exposes the standard SimVars.

## Features

- Live aircraft position, altitude, speeds (GS / IAS / Mach), heading, vertical speed, and wind, refreshed at 2 Hz.
- Magnetic ground track (TRK) on the Position card, available via the HDG disclosure.
- Breadcrumb trail of the actual flight path, color-coded by altitude — sharing the FlightPlanCard altitude-profile palette so plan and actual use the same visual vocabulary.
- Simbrief flight plan import on demand — origin, waypoints, destination, alternate. Re-fetch any time from Settings or from the panel CTA when no plan is loaded.
- Plan-driven TOC / TOD markers on the map and ETE countdowns in the Clock card, with graceful fallback to a VS / 3:1 estimator when no plan is loaded.
- Skip-waypoint arrows (◀ ▶) on the FlightPlanCard for manual stepping; auto-resyncs on plan reload via along-track projection so re-fetching mid-flight no longer snaps tracking back to the first waypoint.
- Alternate airport rendered in blue with a hover-only tooltip; origin and destination keep their fixed labels.
- Side panel grouped into **Trip / Now / Reference** sections: Trip (origin → destination, with a TOC / current / TOD progress timeline, scheduled STA in the header, and a live ETA derived from `eteToDestSec` that falls back to a dash when unavailable), Now (Position / Motion / Wind cards with HD/TL component, on-ground gear indicator, multi-tier altitude+VS), Reference (flight-plan card with altitude profile glyph + alternate chip, clock card with TOC/TOD countdown and day-night glyph at the aircraft sub-point).
- Map polish: softer origin/destination markers, frosted-glass tooltips, panel-aware centering — auto-fit and follow modes both compensate for the side-panel overlay.
- Three map view modes: Overview (fit to origin → destination), Follow (auto-center on aircraft), Manual (sticky after dragging).
- Scoped reset from Settings — clear aircraft data (breadcrumb + flight time), the loaded flight plan, or both — without restarting the server.
- Graceful when the sim isn't running, Simbrief is unreachable, or no plan is loaded yet — the UI never crashes, missing values render as `—`.
- Dark-by-default theme with a light/system toggle in the header.
- Telemetry recording to JSONL for later replay (great for building dev fixtures).
- Replay harness — develop the full UI without MSFS running.

## Stack

TypeScript end-to-end. Server: Node 20, Fastify, ws, [`node-simconnect`](https://www.npmjs.com/package/node-simconnect), Zod. Web: Vite, React 19, Leaflet (via react-leaflet), Zustand. Vitest for unit tests. Single-port HTTP + WebSocket; npm workspaces for the three packages (`shared`, `server`, `web`). v1.2 introduces Tailwind v4, HeroUI for theming and primitives, and a dark-by-default theme that toggles in the header.

## Quick start

Install once:

```bash
npm install
```

### Dev mode against MSFS

In two terminals:

```bash
# Backend (Windows PC where MSFS runs)
npm --workspace server run dev

# Frontend with hot reload, /api and /ws proxied to :4444
npm --workspace web run dev
# → http://localhost:5173
```

### Dev mode without MSFS (replay)

A pre-recorded telemetry fixture lets you develop the UI without firing up the sim:

```bash
# Terminal A — backend serves replay telemetry
FF_STATIC_PATH=/tmp npm run dev:replay

# Terminal B — Vite dev server
npm --workspace web run dev
```

You'll see an aircraft flying a circuit around EDDB (Berlin Brandenburg) with a breadcrumb trail and ticking values.

### Production / LAN access

Build the React bundle and serve everything from Node on a single port:

```bash
npm run build
FF_STATIC_PATH="$(pwd)/web/dist" npm --workspace server run start
# → http://localhost:4444 on this PC,
#   http://<your-ip>:4444 on any device on your LAN
```

## Configuration

All settings are environment variables. None are required — each has a sensible default. Full documentation in [`.env.example`](./.env.example):

| Variable | Default | Purpose |
|---|---|---|
| `FF_PORT` | `4444` | HTTP + WebSocket port |
| `FF_CONFIG_PATH` | `server/.data/settings.json` | Where Simbrief pilot ID is persisted |
| `FF_STATIC_PATH` | `web/dist` | Static React bundle to serve |
| `FF_RECORD_PATH` | _unset_ | If set, the server appends each telemetry event to this JSONL file |
| `REPLAY_TICK_MS` | `500` | Replay harness tick interval |
| `REPLAY_START_MS` | `0` | Replay harness: ms of fixture wall-clock to skip before broadcasting |

The Simbrief pilot ID is set via the in-app Settings dialog and stored in `server/.data/settings.json` (gitignored).

## Recording and replaying flights

To capture a flight to a JSONL file you can replay later:

```bash
mkdir -p recordings
npm run dev:record -- recordings/<your-flight>.jsonl
# Run MSFS, fly, Ctrl+C when done
```

Equivalent via env var on the regular server:

```bash
FF_RECORD_PATH=./recordings/foo.jsonl npm --workspace server run start
```

To replay a saved file later, pass the path as the first arg to the replay script:

```bash
npm --workspace server exec -- tsx ../scripts/dev-telemetry-replay.ts recordings/<your-flight>.jsonl
```

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

## Project layout

```
flight-follower/
├── shared/             # Cross-package TypeScript contracts
│   └── types.ts
├── server/
│   └── src/
│       ├── sim-bridge/   # node-simconnect connection + telemetry events
│       ├── simbrief/     # Simbrief OFP fetch + Zod-validated parser
│       ├── route-math/   # Pure great-circle math (distance, bearing, ETE, deviation)
│       ├── state/        # Aggregator: telemetry + plan → FlightState
│       ├── transport/    # Fastify HTTP + WebSocket
│       ├── config/       # JSON-file settings persistence
│       └── index.ts      # start({ configPath, staticPath, port, … })
├── web/
│   └── src/
│       ├── api/          # WS + REST clients
│       ├── store/        # Zustand stores
│       └── components/   # Map, DataPanel, ConnectionStatus, SettingsDialog
├── scripts/
│   ├── dev-telemetry-replay.ts
│   ├── dev-telemetry-record.ts
│   └── fixtures/replay-eddb-circuit.jsonl
└── docs/superpowers/     # Design spec and implementation plan
```

## Tests

```bash
npm test                   # server unit tests (route-math, parser, aggregator, settings)
npx tsc -p server --noEmit # server typecheck
npx tsc -p web --noEmit    # web typecheck
npm run build              # production build
```

The frontend has no automated tests — manual verification in the browser. The `dev:replay` harness is the development substitute for live MSFS.

## Roadmap

Things explicitly **not** shipped yet, but the architecture leaves room for them:

- **Flight logging** — persist each flight for later review (the aggregator already produces a clean stream; logging is a new consumer).
- **3D / Cesium view** — `web/src/components/Map/` is the only place affected; data contracts are already coordinate-based.
- **FBW A320 FMC reading** — capture the actual loaded FMC route as the planned line, instead of relying on Simbrief.
- **Electron packaging** — `start({…})` already takes paths as input and `node-simconnect` is pure-TS, so wrapping is straightforward.

Smaller deferrals live in [`docs/backlog.md`](./docs/backlog.md).

## Documents

- [v1 design spec](./docs/superpowers/specs/2026-04-24-flight-follower-design.md) — what we're building and why
- [v1 implementation plan](./docs/superpowers/plans/2026-04-24-flight-follower.md) — the task-by-task plan that built v1
- [v1.1 design](./docs/superpowers/specs/2026-04-25-flight-follower-v1.1-design.md) and [v1.1 plan](./docs/superpowers/plans/2026-04-25-flight-follower-v1.1.md)
- [v1.2 design](./docs/superpowers/specs/2026-04-25-flight-follower-v1.2-design.md) and [v1.2 plan](./docs/superpowers/plans/2026-04-25-flight-follower-v1.2.md)
- [v1.3 design](./docs/superpowers/specs/2026-05-01-flight-follower-v1.3-design.md) and [v1.3 plan](./docs/superpowers/plans/2026-05-01-flight-follower-v1.3.md)
- [Backlog](./docs/backlog.md) — items deferred during brainstorming

## License

Personal project — no license assigned. If you want to reuse anything, just ask.
