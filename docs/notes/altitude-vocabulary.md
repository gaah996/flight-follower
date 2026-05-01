# Altitude vocabulary

Two altitude SimVars are read; each is used where it best matches the user's mental model.

## SimVars

| SimVar | Field | Meaning |
|---|---|---|
| `PLANE ALTITUDE` | `altitude.msl` | True MSL altitude — independent of altimeter setting. Stable across flights. |
| `INDICATED ALTITUDE` | `altitude.indicated` | What the cockpit altimeter shows — respects the local pressure setting (QNH/QFE/STD as set in the sim). |

## Use sites

| Surface | Field | Why |
|---|---|---|
| Panel "Alt" row (MotionCard) | `altitude.indicated ?? altitude.msl` | Mirrors what the pilot sees on the PFD. Falls back to MSL if indicated is unavailable. |
| Map breadcrumb gradient | `altitude.msl` | Geographic / cross-flight comparison — independent of altimeter setting. |
| Plan glyph (FlightPlanCard) | Plan altitude (Simbrief `altitude_feet`) | Plan-side, not telemetry — already MSL-equivalent in Simbrief output. |

## Heading parallel

The same dual-source pattern applies to heading: panel HDG mirrors the cockpit (magnetic), map plane icon rotation uses true (the map renders in true geographic bearings). See `times-vocabulary.md` for the times analog.
