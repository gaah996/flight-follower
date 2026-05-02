import { z } from 'zod';
import type { FlightPlan } from '@ff/shared';
import { haversineNm } from '../route-math/distance.js';

const numFromStr = z.union([z.number(), z.string().transform((s) => Number(s))]);

const AirportSchema = z.object({
  icao_code: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  name: z.string().optional(),
});

const FixSchema = z.object({
  ident: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  altitude_feet: numFromStr.optional(),
});

const TimesSchema = z.object({
  sched_out: numFromStr.optional(),
  sched_in: numFromStr.optional(),
  sched_block: numFromStr.optional(),
  est_block: numFromStr.optional(),
});

const GeneralSchema = z.object({
  icao_airline: z.string().optional(),
  flight_number: z.string().optional(),
  initial_altitude: numFromStr.optional(),
  air_distance: numFromStr.optional(),
  route_distance: numFromStr.optional(),
  route: z.string().optional(),
  route_navigraph: z.string().optional(),
});

const AircraftSchema = z.object({
  icao_code: z.string().optional(),
});

const OfpSchema = z.object({
  general: GeneralSchema.optional(),
  aircraft: AircraftSchema.optional(),
  origin: AirportSchema,
  destination: AirportSchema,
  alternate: AirportSchema.optional(),
  times: TimesSchema.optional(),
  navlog: z.object({
    fix: z.array(FixSchema),
  }),
});

export function parseSimbriefOfp(raw: unknown): FlightPlan {
  const ofp = OfpSchema.parse(raw);
  const schedOutSec = ofp.times?.sched_out;
  const schedInSec = ofp.times?.sched_in;
  // Use the scheduled block time (gate-to-gate, OUT → IN). Falls back to
  // the estimated value when sched_block is absent. Both are in seconds.
  // See docs/notes/spike-waypoint-constraints.md.
  const blockTimeSec = ofp.times?.sched_block ?? ofp.times?.est_block;

  const flightNumber =
    ofp.general?.icao_airline && ofp.general?.flight_number
      ? `${ofp.general.icao_airline}${ofp.general.flight_number}`
      : undefined;

  const routeString = ofp.general?.route_navigraph ?? ofp.general?.route;

  const waypoints = ofp.navlog.fix.map((f) => ({
    ident: f.ident,
    lat: f.pos_lat,
    lon: f.pos_long,
    plannedAltitude: f.altitude_feet,
  }));

  // Simbrief's printed total distance (air_distance preferred, with
  // route_distance as fallback). May include wind/route adjustments that
  // aren't visible in the geometric waypoint sum. Displayed in
  // FlightPlanCard so the panel matches the OFP the pilot files.
  const totalDistanceNm = ofp.general?.air_distance ?? ofp.general?.route_distance;

  // Geometric haversine sum of legs [origin, ...waypoints, destination].
  // Used as the denominator for progress percentages so progress reads
  // exactly 0% at origin and 100% at destination, matching the
  // route-following progress.distanceToDestNm numerator.
  const points = [
    { lat: ofp.origin.pos_lat, lon: ofp.origin.pos_long },
    ...waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
    { lat: ofp.destination.pos_lat, lon: ofp.destination.pos_long },
  ];
  let routeTotalDistanceNm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    routeTotalDistanceNm += haversineNm(
      points[i]!.lat,
      points[i]!.lon,
      points[i + 1]!.lat,
      points[i + 1]!.lon,
    );
  }

  return {
    fetchedAt: Date.now(),
    origin: {
      icao: ofp.origin.icao_code,
      lat: ofp.origin.pos_lat,
      lon: ofp.origin.pos_long,
      name: ofp.origin.name,
    },
    destination: {
      icao: ofp.destination.icao_code,
      lat: ofp.destination.pos_lat,
      lon: ofp.destination.pos_long,
      name: ofp.destination.name,
    },
    alternate: ofp.alternate
      ? {
          icao: ofp.alternate.icao_code,
          lat: ofp.alternate.pos_lat,
          lon: ofp.alternate.pos_long,
          name: ofp.alternate.name,
        }
      : undefined,
    waypoints,
    scheduledOut: schedOutSec != null ? schedOutSec * 1000 : undefined,
    scheduledIn: schedInSec != null ? schedInSec * 1000 : undefined,
    flightNumber,
    aircraftType: ofp.aircraft?.icao_code,
    cruiseAltitudeFt: ofp.general?.initial_altitude,
    totalDistanceNm,
    routeTotalDistanceNm,
    routeString,
    blockTimeSec,
  };
}
