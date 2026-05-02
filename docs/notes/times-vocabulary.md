# Times vocabulary

This is the canonical mapping for every duration / wall-clock value in flight-follower. Cards must label times so users (and future-us) know exactly what they mean.

## Duration kinds

| Term | Meaning | Source |
|---|---|---|
| Block time | Gate-to-gate, OUT → IN | `plan.blockTimeSec` (Simbrief `times.est_block`, fallback `sched_block`) |
| Flight time | Wheels-off to wheels-on, OFF → ON | `progress.flightTimeSec` (server-computed from on-ground edge) |
| ETE | Estimated time enroute remaining to destination | `progress.eteToDestSec` (live, derived from GS) |
| ETE-to-next | Estimated time to next waypoint | `progress.eteToNextSec` |
| ETE-to-TOC / TOD | Estimated time to top of climb / descent | `progress.eteToTocSec` / `eteToTodSec` |

## Wall-clock kinds

| Term | Meaning | Source |
|---|---|---|
| ETA (live) | `now + eteToDestSec`, formatted as UTC `HH:MMz` | derived in TripCard from `progress.eteToDestSec` |
| ETA (sched) | Simbrief STA, formatted as UTC `HH:MMz` | `plan.scheduledIn` |
| Sched dep | Simbrief `sched_out` | `plan.scheduledOut` |
| Sched arr | Simbrief `sched_in` | `plan.scheduledIn` |
| Sim time | UTC time as exposed by MSFS while connected | `telemetry.simTimeUtc` |
| Wall clock | Browser's UTC clock | `Date.now()` |

## Suffixes

- All UTC wall-clock displays are suffixed with `z` (Zulu): `12:34z`.
- All durations format as `HH:MM` major + `:SS` minor, via `fmtDurationTier`.
