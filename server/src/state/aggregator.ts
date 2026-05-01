import { EventEmitter } from 'node:events';
import type { FlightPlan, FlightProgress, FlightState, RawTelemetry } from '@ff/shared';
import { haversineNm } from '../route-math/distance.js';
import { advancePassedIndex, distanceToWaypointNm, eteSeconds } from '../route-math/progress.js';
import { findTOC, findTOD } from '../route-math/cruise-points.js';

const BREADCRUMB_INTERVAL_MS = 5000;
const HEADING_DELTA_DEG = 2;
const WAYPOINT_PASS_THRESHOLD_NM = 2;

const EMPTY_PROGRESS: FlightProgress = {
  nextWaypoint: null,
  distanceToNextNm: null,
  eteToNextSec: null,
  distanceToDestNm: null,
  eteToDestSec: null,
  flightTimeSec: null,
  tocPosition: null,
  todPosition: null,
  eteToTocSec: null,
  eteToTodSec: null,
};

export class Aggregator extends EventEmitter {
  private state: FlightState = {
    connected: false,
    telemetry: null,
    plan: null,
    breadcrumb: [],
    progress: { ...EMPTY_PROGRESS },
  };
  private lastBreadcrumbAt = 0;
  private lastBreadcrumbHeading: number | null = null;
  private takeoffAt: number | null = null;
  private wasOnGround: boolean | null = null;
  private passedIndex = -1;

  setConnected(connected: boolean): void {
    if (this.state.connected === connected) return;
    this.state = { ...this.state, connected };
    this.emit('state', this.state);
  }

  setPlan(plan: FlightPlan): void {
    this.passedIndex = -1;
    this.state = { ...this.state, plan, progress: this.computeProgress(this.state.telemetry, plan) };
    this.emit('state', this.state);
    this.emit('plan', plan);
  }

  // Three scoped resets for the UI's "Reset" actions in Settings. All
  // preserve telemetry and connection so the aircraft marker stays put.
  // Plan-clearing variants only emit `state` (not `plan`); the WS layer
  // pushes state on its 500 ms tick, so clients see the change within one
  // tick.
  resetAircraft(): void {
    this.applyReset({ aircraft: true, plan: false });
  }

  resetPlan(): void {
    this.applyReset({ aircraft: false, plan: true });
  }

  resetAll(): void {
    this.applyReset({ aircraft: true, plan: true });
  }

  private applyReset(opts: { aircraft: boolean; plan: boolean }): void {
    if (opts.aircraft) {
      this.takeoffAt = null;
      this.wasOnGround = null;
      this.lastBreadcrumbAt = 0;
      this.lastBreadcrumbHeading = null;
    }
    if (opts.plan) {
      this.passedIndex = -1;
    }
    const nextPlan = opts.plan ? null : this.state.plan;
    const nextBreadcrumb = opts.aircraft ? [] : this.state.breadcrumb;
    this.state = {
      ...this.state,
      plan: nextPlan,
      breadcrumb: nextBreadcrumb,
      progress: this.computeProgress(this.state.telemetry, nextPlan),
    };
    this.emit('state', this.state);
  }

  ingestTelemetry(t: RawTelemetry): void {
    // MSFS reports ~(0,0) on the menu/loading screen. The 1° box around the
    // origin sits entirely in the Gulf of Guinea — no real flight goes there.
    if (Math.abs(t.position.lat) < 1 && Math.abs(t.position.lon) < 1) {
      return;
    }

    const breadcrumb = this.updateBreadcrumb(t);
    this.updateTakeoffState(t);
    const progress = this.computeProgress(t, this.state.plan);

    this.state = {
      ...this.state,
      telemetry: t,
      breadcrumb,
      progress,
    };
    this.emit('state', this.state);
  }

  getState(): FlightState {
    return this.state;
  }

  private computeProgress(t: RawTelemetry | null, plan: FlightPlan | null): FlightProgress {
    const flightTimeSec =
      t == null || this.takeoffAt == null ? null : Math.max(0, (t.timestamp - this.takeoffAt) / 1000);
    if (plan == null) {
      return { ...EMPTY_PROGRESS, flightTimeSec };
    }
    if (t == null) {
      // Surface TOC/TOD positions as soon as a plan loads, even before any
      // telemetry has arrived (lets the map markers render immediately).
      return {
        ...EMPTY_PROGRESS,
        flightTimeSec,
        tocPosition: findTOC(plan.waypoints, plan.cruiseAltitudeFt),
        todPosition: findTOD(plan.waypoints, plan.cruiseAltitudeFt),
      };
    }
    this.passedIndex = advancePassedIndex(t.position, plan.waypoints, this.passedIndex, WAYPOINT_PASS_THRESHOLD_NM);
    const nextIdx = this.passedIndex + 1;
    const nextWp = plan.waypoints[nextIdx] ?? null;
    const distNext = nextWp ? distanceToWaypointNm(t.position, nextWp) : null;
    const distDest = haversineNm(t.position.lat, t.position.lon, plan.destination.lat, plan.destination.lon);
    const gs = t.speed.ground;

    const tocPosition = findTOC(plan.waypoints, plan.cruiseAltitudeFt);
    const todPosition = findTOD(plan.waypoints, plan.cruiseAltitudeFt);
    const distToToc =
      tocPosition == null
        ? null
        : haversineNm(t.position.lat, t.position.lon, tocPosition.lat, tocPosition.lon);
    const distToTod =
      todPosition == null
        ? null
        : haversineNm(t.position.lat, t.position.lon, todPosition.lat, todPosition.lon);

    return {
      nextWaypoint: nextWp,
      distanceToNextNm: distNext,
      eteToNextSec: distNext == null ? null : eteSeconds(distNext, gs),
      distanceToDestNm: distDest,
      eteToDestSec: eteSeconds(distDest, gs),
      flightTimeSec,
      tocPosition,
      todPosition,
      eteToTocSec: distToToc == null ? null : eteSeconds(distToToc, gs),
      eteToTodSec: distToTod == null ? null : eteSeconds(distToTod, gs),
    };
  }

  private updateBreadcrumb(t: RawTelemetry): typeof this.state.breadcrumb {
    if (this.state.breadcrumb.length === 0) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [{ lat: t.position.lat, lon: t.position.lon, altMsl: t.altitude.msl }];
    }
    const elapsed = t.timestamp - this.lastBreadcrumbAt;
    const headingDelta =
      this.lastBreadcrumbHeading == null
        ? 0
        : Math.abs(((t.heading.magnetic - this.lastBreadcrumbHeading + 540) % 360) - 180);
    if (elapsed >= BREADCRUMB_INTERVAL_MS || headingDelta >= HEADING_DELTA_DEG) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [...this.state.breadcrumb, { lat: t.position.lat, lon: t.position.lon, altMsl: t.altitude.msl }];
    }
    return this.state.breadcrumb;
  }

  private updateTakeoffState(t: RawTelemetry): void {
    if (this.wasOnGround === true && t.onGround === false && this.takeoffAt == null) {
      this.takeoffAt = t.timestamp;
    }
    this.wasOnGround = t.onGround;
  }
}
