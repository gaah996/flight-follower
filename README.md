# flight-follower

A small web app that streams live MSFS2020 telemetry to a map and a data panel, alongside a planned route imported from Simbrief. Runs as a single Node process on the same PC as the sim and exposes a browser UI on the local network — open it on a second monitor or any tablet/phone on the LAN.

Built for personal use while flying the FlyByWire A32NX, but works with any aircraft that exposes the standard SimVars.

## Features

- Live aircraft position, altitude, speeds (GS / IAS / Mach), heading, vertical speed, and wind, refreshed at 2 Hz.
- Breadcrumb trail of the actual flight path.
- Simbrief flight plan import on demand — origin, waypoints, destination, alternate.
- Three map view modes: Overview (fit to origin → destination), Follow (auto-center on aircraft), Manual (sticky after dragging).
- Graceful when the sim isn't running, Simbrief is unreachable, or no plan is loaded yet — the UI never crashes, missing values render as `—`.
- Telemetry recording to JSONL for later replay (great for building dev fixtures).
- Replay harness — develop the full UI without MSFS running.

## Stack

TypeScript end-to-end. Server: Node 20, Fastify, ws, [`node-simconnect`](https://www.npmjs.com/package/node-simconnect), Zod. Web: Vite, React 18, Leaflet (via react-leaflet), Zustand. Vitest for unit tests. Single-port HTTP + WebSocket; npm workspaces for the three packages (`shared`, `server`, `web`).

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

Things explicitly **not** in v1, but the architecture leaves room for them:

- **Flight logging** — persist each flight for later review (the aggregator already produces a clean stream; logging is a new consumer).
- **3D / Cesium view** — `web/src/components/Map/` is the only place affected; data contracts are already coordinate-based.
- **FBW A320 FMC reading** — capture the actual loaded FMC route as the planned line, instead of relying on Simbrief.
- **Mid-flight plan refresh** — pull a fresh OFP from Simbrief without restarting.
- **Electron packaging** — `start({…})` already takes paths as input and `node-simconnect` is pure-TS, so wrapping is straightforward.

## Documents

- [Design spec](./docs/superpowers/specs/2026-04-24-flight-follower-design.md) — what we're building and why
- [Implementation plan](./docs/superpowers/plans/2026-04-24-flight-follower.md) — the task-by-task plan that built v1

## License

Personal project — no license assigned. If you want to reuse anything, just ask.
