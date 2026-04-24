export type LatLon = { lat: number; lon: number };

export type RawTelemetry = {
  timestamp: number;
  position: LatLon;
  altitude: { msl: number };
  speed: { ground: number; indicated: number; mach: number };
  heading: { magnetic: number };
  verticalSpeed: number;
  wind: { direction: number; speed: number };
  onGround: boolean;
};

export type Waypoint = {
  ident: string;
  lat: number;
  lon: number;
  plannedAltitude?: number;
};

export type Airport = {
  icao: string;
  lat: number;
  lon: number;
};

export type FlightPlan = {
  fetchedAt: number;
  origin: Airport;
  destination: Airport;
  waypoints: Waypoint[];
  alternate?: Airport;
};

export type FlightProgress = {
  nextWaypoint: Waypoint | null;
  distanceToNextNm: number | null;
  eteToNextSec: number | null;
  distanceToDestNm: number | null;
  eteToDestSec: number | null;
  flightTimeSec: number | null;
};

export type FlightState = {
  connected: boolean;
  telemetry: RawTelemetry | null;
  plan: FlightPlan | null;
  breadcrumb: LatLon[];
  progress: FlightProgress;
};

export type WsMessage =
  | { type: 'state'; payload: FlightState }
  | { type: 'plan'; payload: FlightPlan }
  | { type: 'error'; payload: { code: string; message: string } };

export type Settings = {
  simbriefUserId: string | null;
};
