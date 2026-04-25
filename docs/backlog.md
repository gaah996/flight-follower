# Backlog

Items raised during brainstorming sessions that we explicitly chose **not** to do in the current release. Kept here so we can pull them forward later without re-deriving the context.

## From v1.1 brainstorming (2026-04-25)

### Deferred to a later v1.x

- **Layers panel** — toggle path / waypoints / labels visibility on the map.
- **Unit switching** — speed in km/h, altitude/distance in metres or kilometres, with toggle or auto-switch.
- **Map style switcher** — full UI to swap tile providers at runtime (v1.2 only refines the default style; the switcher itself is parked).
- **Estimate flight phase** — TO / CLB / CRZ / DES / LAND classifier. Likely rule-based on altitude, vertical speed, on-ground, distance-to-airports.

### Parked as v2 candidates

- **Live METAR per airport** — fetch and surface METAR for origin / destination / alternate.
- **Live position of other aircraft** — would require an external feed (ADSB / FlightAware / OpenSky); MSFS does not expose multiplayer cleanly.
- **Replay module (FE-controlled)** — turn the dev replay harness into a first-class user feature: load a recording in the browser, play / pause / scrub forwards and backwards, jump to a timestamp. Requires aggregator + breadcrumb reset on backward seek and a control surface (REST or WS commands) so the FE drives the replay. v1.1 only ships a simple forward-skip env var (`REPLAY_START_MS`) for dev ergonomics; the full module is a v2 / v3 candidate.

## From v1.1 brainstorming — folded into later v1.x versions

For traceability — these are not "deferred", they are scheduled:

- **v1.2** — component library + dark mode, DataPanel layout / grouping, wind compass widget, default map tile style refinement, flight info card, **multi-tier position precision** (large 2 dp number with the extra 1–2 decimals rendered smaller / dimmer, e.g. `52.36`<sub>`41`</sub>`° N` — gets the best of "stable to glance at" and "finer detail visible if you look closer"; v1.1 ships flat 2 dp because the typography tiering wants to land with the rest of the design pass).
- **v1.3** — breadcrumb altitude-coded gradient, skip-waypoint mechanism, TOC / TOD markers, origin → destination progress timeline bar, live ETA derived from `eteToDestSec`.
