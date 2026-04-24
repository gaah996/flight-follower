import { EventEmitter } from 'node:events';
import type { FlightPlan, FlightProgress, FlightState, RawTelemetry } from '@ff/shared';
import { haversineNm } from '../route-math/distance.js';
import { advancePassedIndex, distanceToWaypointNm, eteSeconds } from '../route-math/progress.js';

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

  ingestTelemetry(t: RawTelemetry): void {
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
    if (t == null || plan == null) {
      return { ...EMPTY_PROGRESS, flightTimeSec };
    }
    this.passedIndex = advancePassedIndex(t.position, plan.waypoints, this.passedIndex, WAYPOINT_PASS_THRESHOLD_NM);
    const nextIdx = this.passedIndex + 1;
    const nextWp = plan.waypoints[nextIdx] ?? null;
    const distNext = nextWp ? distanceToWaypointNm(t.position, nextWp) : null;
    const distDest = haversineNm(t.position.lat, t.position.lon, plan.destination.lat, plan.destination.lon);
    const gs = t.speed.ground;
    return {
      nextWaypoint: nextWp,
      distanceToNextNm: distNext,
      eteToNextSec: distNext == null ? null : eteSeconds(distNext, gs),
      distanceToDestNm: distDest,
      eteToDestSec: eteSeconds(distDest, gs),
      flightTimeSec,
    };
  }

  private updateBreadcrumb(t: RawTelemetry): typeof this.state.breadcrumb {
    if (this.state.breadcrumb.length === 0) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [{ lat: t.position.lat, lon: t.position.lon }];
    }
    const elapsed = t.timestamp - this.lastBreadcrumbAt;
    const headingDelta =
      this.lastBreadcrumbHeading == null
        ? 0
        : Math.abs(((t.heading.magnetic - this.lastBreadcrumbHeading + 540) % 360) - 180);
    if (elapsed >= BREADCRUMB_INTERVAL_MS || headingDelta >= HEADING_DELTA_DEG) {
      this.lastBreadcrumbAt = t.timestamp;
      this.lastBreadcrumbHeading = t.heading.magnetic;
      return [...this.state.breadcrumb, { lat: t.position.lat, lon: t.position.lon }];
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
