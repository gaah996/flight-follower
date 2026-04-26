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

- **v1.2** ✅ shipped — component library + dark mode, DataPanel layout / grouping (Trip / Now / Reference), wind compass widget, default map tile style refinement, flight-plan card, multi-tier position precision.
- **v1.3** — breadcrumb altitude-coded gradient (with matching colours on the FlightPlanCard altitude-profile glyph), skip-waypoint mechanism, TOC / TOD markers on the map, origin → destination progress timeline bar, live ETA derived from `eteToDestSec`.

## From v1.2 polish (2026-04-26)

Items that came up during the card-by-card iteration but were intentionally not pursued in v1.2.

### Card-level data additions

- **Cost index** on FlightPlanCard — small avgeek detail (`CI 70` row).
- **Cruise Mach** as a `.minor` sub-value next to the cruise FL (e.g. `FL380 M.78`).
- **Average forecast HD/TL** on FlightPlanCard — Simbrief publishes a route-averaged wind component; would mirror the live HD/TL on the wind card and reinforce expected vs actual.

### Clock card

- **Plan-driven TOC / TOD detection** — current logic uses VS-based estimation for TOC and the 3:1 rule for TOD. A waypoint-scan against `plannedAltitude` would be more accurate (and fold naturally into the v1.3 TOC / TOD map markers).
- **Local time at origin / destination** — tz-from-coordinate lookup; useful on long-haul.
- **Sunrise / sunset at destination** — easy follow-up to the existing `isDaylight` calc.

### Wind compass refinements

Suggested but not picked when iterating; could land as small polish later.

- **Arrow length proportional to wind speed** — clamp 0.4 → 1.0 of the radius. Reads "calm vs gale" instantly. Risk: very light winds get a tiny stub.
- **HD/TL colour cue on the arrow** — tint the wind shaft red-ish when headwind dominates, green-ish when tailwind, neutral for crosswind.
- **"Instrument glass" feel** — faint radial gradient inside the ring + thicker outer stroke, so the dial reads as a recessed gauge rather than a flat line drawing.

### Motion card

- **Parking-brake indicator** — counterpart to the on-ground landing-gear glyph in the header. Deferred ("park it for later"); fits the same fun-feature-per-card pattern.
