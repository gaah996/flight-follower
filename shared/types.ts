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
  /**
   * Total flight distance as printed in the Simbrief OFP (`air_distance`,
   * with `route_distance` as fallback). May include wind/route adjustments
   * that aren't visible in the geometric waypoint sum. Used for display
   * in FlightPlanCard so the panel matches the OFP the pilot files. For
   * progress math (denominators), use `routeTotalDistanceNm` instead.
   */
  totalDistanceNm?: number;
  /**
   * Geometric haversine sum of legs `[origin, ...waypoints, destination]`.
   * Used as the denominator for progress percentages and glyph reveal so
   * progress reads exactly 0% at the origin and 100% at the destination,
   * matching the route-following `progress.distanceToDestNm` numerator.
   * Always defined for plans parsed by parseSimbriefOfp; the optional
   * marker is for back-compat with any future plan sources.
   */
  routeTotalDistanceNm?: number;
  routeString?: string;
  blockTimeSec?: number;
};

export type FlightProgress = {
  nextWaypoint: Waypoint | null;
  distanceToNextNm: number | null;
  eteToNextSec: number | null;
  /**
   * Route-following distance to destination in nautical miles: along-track
   * remainder of the current leg + sum of remaining leg distances.
   * Replaced great-circle semantics in v1.3.1.
   */
  distanceToDestNm: number | null;
  eteToDestSec: number | null;
  flightTimeSec: number | null;
  tocPosition: LatLon | null;
  todPosition: LatLon | null;
  /**
   * Route-following distance from origin to TOC, summed along the planned
   * legs `[origin, ...waypoints, destination]`. Used by ProgressBar to place
   * the TOC tick consistently with the route-following progress fill, and
   * by the aggregator to compute eteToTocSec as a route-following remainder
   * rather than a great-circle straight line. Null when tocPosition is null.
   */
  tocAlongRouteNm: number | null;
  /** Route-following distance from origin to TOD; see tocAlongRouteNm. */
  todAlongRouteNm: number | null;
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
