import { z } from 'zod';
import type { FlightPlan } from '@ff/shared';

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

  const flightNumber =
    ofp.general?.icao_airline && ofp.general?.flight_number
      ? `${ofp.general.icao_airline}${ofp.general.flight_number}`
      : undefined;

  const totalDistanceNm = ofp.general?.air_distance ?? ofp.general?.route_distance;
  const routeString = ofp.general?.route_navigraph ?? ofp.general?.route;

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
    waypoints: ofp.navlog.fix.map((f) => ({
      ident: f.ident,
      lat: f.pos_lat,
      lon: f.pos_long,
      plannedAltitude: f.altitude_feet,
    })),
    scheduledOut: schedOutSec != null ? schedOutSec * 1000 : undefined,
    scheduledIn: schedInSec != null ? schedInSec * 1000 : undefined,
    flightNumber,
    aircraftType: ofp.aircraft?.icao_code,
    cruiseAltitudeFt: ofp.general?.initial_altitude,
    totalDistanceNm,
    routeString,
  };
}
