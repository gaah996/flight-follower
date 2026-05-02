import { EventEmitter } from 'node:events';
import type { FlightPlan, FlightProgress, FlightState, RawTelemetry } from '@ff/shared';
import { haversineNm } from '../route-math/distance.js';
import { advancePassedIndex, advancePassedIndexWindowed, alongTrackNm, distanceToWaypointNm, eteSeconds, findPassedIndex } from '../route-math/progress.js';
import { findTOC, findTOD } from '../route-math/cruise-points.js';
import { routeRemainingNm } from '../route-math/route-progress.js';

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
    // Auto-resume on plan reload: seed passedIndex from the aircraft's
    // current position so re-fetching mid-flight doesn't snap tracking back
    // to the first waypoint. With no telemetry yet, start fresh at -1.
    this.passedIndex = this.state.telemetry
      ? findPassedIndex(this.state.telemetry.position, plan.waypoints)
      : -1;
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
    // Two complementary advancement paths, both forward-only via Math.max:
    //  - advancePassedIndex (close-pass, 2 nm threshold) catches the precise
    //    moment of crossing waypoints when on-route.
    //  - advancePassedIndexWindowed (bounded along-track projection) catches
    //    the off-track case where the aircraft is wide of the waypoint by
    //    more than the threshold. The window restricts reconciliation to
    //    legs near the current cursor — full-scan along-track misfires when
    //    a far leg's bearing aligns with the aircraft's bearing from the
    //    leg's start (LFPG → LEPA bug, v1.3.1).
    const closePassIdx = advancePassedIndex(
      t.position,
      plan.waypoints,
      this.passedIndex,
      WAYPOINT_PASS_THRESHOLD_NM,
    );
    const windowedIdx = advancePassedIndexWindowed(
      t.position,
      plan.waypoints,
      this.passedIndex,
    );
    this.passedIndex = Math.max(this.passedIndex, closePassIdx, windowedIdx);
    const nextIdx = this.passedIndex + 1;
    const nextWp = plan.waypoints[nextIdx] ?? null;
    const distNext = nextWp ? distanceToWaypointNm(t.position, nextWp) : null;
    const distDest = routeRemainingNm(t.position, plan, this.passedIndex);
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

    // Detect "past TOC/TOD" via along-track on the origin → destination axis.
    // Once past, suppress the ETE so the Clock card hops to the next phase
    // (TOC → TOD → null → fall-back). Marker positions stay non-null per
    // spec § 4.2 ("markers stay visible for the entire flight").
    const aircraftAlong = alongTrackNm(t.position, plan.origin, plan.destination);
    const tocAlong =
      tocPosition == null ? null : alongTrackNm(tocPosition, plan.origin, plan.destination);
    const todAlong =
      todPosition == null ? null : alongTrackNm(todPosition, plan.origin, plan.destination);
    const isPastToc = tocAlong != null && aircraftAlong >= tocAlong;
    const isPastTod = todAlong != null && aircraftAlong >= todAlong;

    return {
      nextWaypoint: nextWp,
      distanceToNextNm: distNext,
      eteToNextSec: distNext == null ? null : eteSeconds(distNext, gs),
      distanceToDestNm: distDest,
      eteToDestSec: eteSeconds(distDest, gs),
      flightTimeSec,
      tocPosition,
      todPosition,
      eteToTocSec: isPastToc || distToToc == null ? null : eteSeconds(distToToc, gs),
      eteToTodSec: isPastTod || distToTod == null ? null : eteSeconds(distToTod, gs),
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
