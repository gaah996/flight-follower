import { z } from 'zod';
import type { FlightPlan } from '@ff/shared';

const numFromStr = z.union([z.number(), z.string().transform((s) => Number(s))]);

const AirportSchema = z.object({
  icao_code: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
});

const FixSchema = z.object({
  ident: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  altitude_feet: numFromStr.optional(),
});

const OfpSchema = z.object({
  origin: AirportSchema,
  destination: AirportSchema,
  alternate: AirportSchema.optional(),
  navlog: z.object({
    fix: z.array(FixSchema),
  }),
});

export function parseSimbriefOfp(raw: unknown): FlightPlan {
  const ofp = OfpSchema.parse(raw);
  return {
    fetchedAt: Date.now(),
    origin: {
      icao: ofp.origin.icao_code,
      lat: ofp.origin.pos_lat,
      lon: ofp.origin.pos_long,
    },
    destination: {
      icao: ofp.destination.icao_code,
      lat: ofp.destination.pos_lat,
      lon: ofp.destination.pos_long,
    },
    alternate: ofp.alternate
      ? {
          icao: ofp.alternate.icao_code,
          lat: ofp.alternate.pos_lat,
          lon: ofp.alternate.pos_long,
        }
      : undefined,
    waypoints: ofp.navlog.fix.map((f) => ({
      ident: f.ident,
      lat: f.pos_lat,
      lon: f.pos_long,
      plannedAltitude: f.altitude_feet,
    })),
  };
}
