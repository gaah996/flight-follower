# Spike — Simbrief waypoint constraints (2026-05-02)

## Question

Does Simbrief's OFP expose hard waypoint constraints (e.g. `at-or-below 5000 ft`, `max IAS 230 kt`) cleanly per-fix in the navlog, so we could render them on map waypoint tooltips in v1.3?

## Result

**NOT CLEAN — defer waypoint-constraint rendering to v1.4.**

## Evidence

OFP inspected: NZQN → NZWN with full SID/STAR (Pacific Air Pawnee call sign, real airline-style routing in NZ airspace), retrieved live from `simbrief.com/api/xml.fetcher.php`.

The navlog `fix` object exposes 42 keys per fix:

```
altitude_feet, distance, fir, fir_crossing, fir_units, fir_valid_levels,
frequency, fuel_flow, fuel_leg, fuel_min_onboard, fuel_plan_onboard,
fuel_totalused, ground_height, groundspeed, heading_mag, heading_true,
icao_region, ident, ind_airspeed, is_sid_star, mach, mach_thousandths,
mora, name, oat, oat_isa_dev, pos_lat, pos_long, region_code, shear,
stage, time_leg, time_total, track_mag, track_true, tropopause_feet,
true_airspeed, type, via_airway, wind_component, wind_data,
wind_dir, wind_spd
```

No `alt_min`, `alt_max`, `altitude_constraint`, `speed_constraint`, `mach_max`, `ias_max`, or any other field expressing a *hard* airspace constraint per fix. The available altitude / speed values (`altitude_feet`, `ind_airspeed`, etc.) describe the *planned trajectory*, not constraints.

`is_sid_star` exists as a boolean but only flags whether the fix is part of a SID or STAR — not the constraint that applies to it.

## Decision

- Skip the constraint sub-steps in v1.3 Task 4 (Simbrief parser extension): no `alt_const` / `speed_const` schema fields, no constraint test cases, no `parseAltConstraint` / `parseSpeedConstraint` helpers.
- Keep the optional `Waypoint.altConstraint` and `Waypoint.speedConstraint` fields on `shared/types.ts` as forward-compat: they cost nothing, and v1.4 may add them via a different source (e.g. an external nav-data service like Navigraph, or pulling from FBW's FMC).
- Park "waypoint constraint tooltips on the map" in `docs/backlog.md` under v1.4.

## Side-finding: block-time field correction

While inspecting the OFP, the `times` block surfaced a mismatch in the v1.3 spec's chosen field name for `plan.blockTimeSec`. The relevant scheduled / estimated time fields are:

| Field | Seconds | Meaning |
|---|---|---|
| `sched_out` | 1777663500 | Gate-out scheduled (epoch) |
| `sched_off` | 1777664700 | Wheels-off scheduled |
| `sched_on` | 1777668720 | Wheels-on scheduled |
| `sched_in` | 1777669200 | Gate-in scheduled |
| `sched_block` | 5700 | OUT → IN scheduled (gate-to-gate) — 1h35m |
| `sched_time_enroute` | 4020 | OFF → ON scheduled (flight time) — 1h07m |
| `est_block` | 5136 | OUT → IN estimated, with winds — 1h26m |
| `est_time_enroute` | 3456 | OFF → ON estimated, with winds — 0h58m |

The v1.3 plan originally said to extract `times.est_time_enroute`, but that's **flight time (OFF→ON)**, not block. The right field for "block time matching what Simbrief shows on the OFP" is **`est_block`** (estimated gate-to-gate), with `sched_block` as a sensible fallback when `est_block` is absent.

This also explains the user's original "block doesn't match Simbrief" observation: the FlightPlanCard derivation `scheduledIn - scheduledOut` equals `sched_block` (95 min) but Simbrief's printed OFP typically shows `est_block` (86 min). Switching to `est_block` will close that gap.

**Plan update:** Task 4 will extract `plan.blockTimeSec` from `times.est_block` (preferring it), falling back to `times.sched_block` if absent. The `times.est_time_enroute` / `sched_time_enroute` fields stay unused for v1.3 — they're flight time and would deserve a separate `flightTimeSec` field if we ever surface it.
