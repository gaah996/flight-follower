# Backlog

Items raised during brainstorming sessions that we explicitly chose **not** to do in the current release. Kept here so we can pull them forward later without re-deriving the context.

## Scheduled in upcoming versions

These are not "deferred" — they are scheduled. The structure below was set during the v1.3 brainstorm and is re-checked at the start of each new version's brainstorm.

### v1.4 — Personalization & per-user config

- Compact mode for cards.
- Card config (enable/disable + compact/extended), persisted per user.
- Switch plane icon color to airline color; airline icon in FlightPlanCard and aircraft tooltip.
- Theme auto-switch based on aircraft day/night position.
- Plane icon track-vs-heading toggle (the toggle UI; the v1.3 fix only addresses the rotation reference bug).
- Move clock closer to TripCard.
- Waypoint altitude/speed limits in tooltips (if the v1.3 spike defers it).
- *From v1.2 polish backlog:* cost index / cruise Mach / avg forecast HD-TL on FlightPlanCard; local time at origin/destination; sunrise/sunset at destination; wind compass refinements (proportional arrow, HD/TL color cue, instrument-glass feel); parking-brake indicator.
- Clock fallback to real time after a sim-disconnect grace period.
- Actuals: compute OUT/OFF/ON/IN from the on-ground boolean.

### v1.5 — Multi-device / Responsive

- Mobile-friendly layout.
- Alert center (replaces inline alerts).
- LAN IP shown on startup banner / settings panel.
- Header treatment for app-mode (kiosk / Electron-ready).

### v1.6+ — Platform & data expansion

- *From v1.1 backlog:* layers panel, unit switching, map style switcher, flight phase classifier, live METAR per airport, live position of other aircraft, FE-controlled replay module.
- *From v1 roadmap:* flight logging, 3D / Cesium view, FBW A320 FMC reading, Electron packaging.
- AUTO map mode (zoom by flight phase) — depends on the phase classifier above.
- Airport elevation data for FlightPlanCard glyph.
- Go-arounds / diverted flights handling — fixture-driven via NZQN→NZWN.
- **Flight-type model (IFR / VFR / etc.).** Architectural pre-work — a `FlightType` enum on `FlightPlan` that gates per-type behavior (TOC/TOD logic, time conventions, relevant alts/speeds). Worth scoping when at least two consumers exist (VFR flights, or actuals OUT/OFF/ON/IN that differ per type).

## Already shipped — folded into past versions

For traceability — these were on the backlog and have since shipped:

- **v1.3** ✅ — flight progress release. Breadcrumb altitude gradient (variable-bucket sizing), plan-driven TOC/TOD markers and ETE countdowns, skip-waypoint arrows + along-track auto-resume on plan reload, origin → destination progress timeline, live ETA, alternate-on-map (blue, hover-only tooltip), FlightPlanCard glyph reveal-as-you-fly. Polish: FlightPlanCard collapse/wrap, map mode promotion (zoom-out of Overview, click-self no-op), true-vs-magnetic plane-icon rotation, magnetic TRK in PositionCard, indicated-altitude in MotionCard, light-mode tooltip, times-vocabulary alignment (block now `sched_block`). Spike outcome: NOT CLEAN — waypoint constraints not exposed cleanly in Simbrief; deferred to v1.4. See [`docs/notes/spike-waypoint-constraints.md`](./notes/spike-waypoint-constraints.md).
- **v1.2** ✅ — component library + dark mode, DataPanel layout / grouping (Trip / Now / Reference), wind compass widget, default map tile style refinement, flight-plan card, multi-tier position precision.

## v1.1 brainstorming — context preserved

These items originated in the v1.1 brainstorm. Current scheduling above; original context kept for traceability.

### Deferred to a later v1.x (now scheduled in v1.6+)

- **Layers panel** — toggle path / waypoints / labels visibility on the map.
- **Unit switching** — speed in km/h, altitude/distance in metres or kilometres, with toggle or auto-switch.
- **Map style switcher** — full UI to swap tile providers at runtime (v1.2 only refines the default style; the switcher itself is parked).
- **Estimate flight phase** — TO / CLB / CRZ / DES / LAND classifier. Likely rule-based on altitude, vertical speed, on-ground, distance-to-airports.

### Parked as v2 candidates (now v1.6+)

- **Live METAR per airport** — fetch and surface METAR for origin / destination / alternate.
- **Live position of other aircraft** — would require an external feed (ADSB / FlightAware / OpenSky); MSFS does not expose multiplayer cleanly.
- **Replay module (FE-controlled)** — turn the dev replay harness into a first-class user feature: load a recording in the browser, play / pause / scrub forwards and backwards, jump to a timestamp. Requires aggregator + breadcrumb reset on backward seek and a control surface (REST or WS commands) so the FE drives the replay. v1.1 only ships a simple forward-skip env var (`REPLAY_START_MS`) for dev ergonomics; the full module is a v1.6+ candidate.

## v1.2 polish — context preserved

Items that came up during the card-by-card iteration but were intentionally not pursued in v1.2. All scheduled in v1.4 above.

### Card-level data additions

- **Cost index** on FlightPlanCard — small avgeek detail (`CI 70` row).
- **Cruise Mach** as a `.minor` sub-value next to the cruise FL (e.g. `FL380 M.78`).
- **Average forecast HD/TL** on FlightPlanCard — Simbrief publishes a route-averaged wind component; would mirror the live HD/TL on the wind card and reinforce expected vs actual.

### Clock card

- **Plan-driven TOC / TOD detection** — current logic uses VS-based estimation for TOC and the 3:1 rule for TOD. **Now in v1.3** (see scheduled section above).
- **Local time at origin / destination** — tz-from-coordinate lookup; useful on long-haul.
- **Sunrise / sunset at destination** — easy follow-up to the existing `isDaylight` calc.

### Wind compass refinements

Suggested but not picked when iterating; could land as small polish later.

- **Arrow length proportional to wind speed** — clamp 0.4 → 1.0 of the radius. Reads "calm vs gale" instantly. Risk: very light winds get a tiny stub.
- **HD/TL colour cue on the arrow** — tint the wind shaft red-ish when headwind dominates, green-ish when tailwind, neutral for crosswind.
- **"Instrument glass" feel** — faint radial gradient inside the ring + thicker outer stroke, so the dial reads as a recessed gauge rather than a flat line drawing.

### Motion card

- **Parking-brake indicator** — counterpart to the on-ground landing-gear glyph in the header. Deferred ("park it for later"); fits the same fun-feature-per-card pattern.
