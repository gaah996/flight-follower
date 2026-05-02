export type LatLon = { lat: number; lon: number };

export type RawTelemetry = {
  timestamp: number;
  position: LatLon;
  altitude: { msl: number; indicated?: number };
  speed: { ground: number; indicated: number; mach: number };
  heading: { magnetic: number; true: number };
  track: { magnetic: number };
  verticalSpeed: number;
  wind: { direction: number; speed: number };
  onGround: boolean;
  simTimeUtc?: number;
};

export type Waypoint = {
  ident: string;
  lat: number;
  lon: number;
  plannedAltitude?: number;
  altConstraint?: { type: 'at' | 'at-or-above' | 'at-or-below'; ft: number };
  speedConstraint?: { type: 'at-or-below'; kt: number };
};

export type Airport = {
  icao: string;
  lat: number;
  lon: number;
  name?: string;
};

export type FlightPlan = {
  fetchedAt: number;
  origin: Airport;
  destination: Airport;
  waypoints: Waypoint[];
  alternate?: Airport;
  scheduledOut?: number;
  scheduledIn?: number;
  flightNumber?: string;
  aircraftType?: string;
  cruiseAltitudeFt?: number;
  totalDistanceNm?: number;
  routeString?: string;
  blockTimeSec?: number;
};

export type FlightProgress = {
  nextWaypoint: Waypoint | null;
  distanceToNextNm: number | null;
  eteToNextSec: number | null;
  distanceToDestNm: number | null;
  eteToDestSec: number | null;
  flightTimeSec: number | null;
  tocPosition: LatLon | null;
  todPosition: LatLon | null;
  eteToTocSec: number | null;
  eteToTodSec: number | null;
};

export type BreadcrumbSample = { lat: number; lon: number; altMsl: number };

export type FlightState = {
  connected: boolean;
  telemetry: RawTelemetry | null;
  plan: FlightPlan | null;
  breadcrumb: BreadcrumbSample[];
  progress: FlightProgress;
};

export type WsMessage =
  | { type: 'state'; payload: FlightState }
  | { type: 'plan'; payload: FlightPlan }
  | { type: 'error'; payload: { code: string; message: string } };

export type Settings = {
  simbriefUserId: string | null;
};
