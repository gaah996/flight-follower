import { EventEmitter } from 'node:events';
import type { FlightPlan, FlightState, RawTelemetry } from '@ff/shared';

const BREADCRUMB_INTERVAL_MS = 5000;
const HEADING_DELTA_DEG = 2;

export class Aggregator extends EventEmitter {
  private state: FlightState = {
    connected: false,
    telemetry: null,
    plan: null,
    breadcrumb: [],
    progress: {
      nextWaypoint: null,
      distanceToNextNm: null,
      eteToNextSec: null,
      distanceToDestNm: null,
      eteToDestSec: null,
      flightTimeSec: null,
    },
  };
  private lastBreadcrumbAt = 0;
  private lastBreadcrumbHeading: number | null = null;
  private takeoffAt: number | null = null;
  private wasOnGround: boolean | null = null;

  setConnected(connected: boolean): void {
    if (this.state.connected === connected) return;
    this.state = { ...this.state, connected };
    this.emit('state', this.state);
  }

  setPlan(plan: FlightPlan): void {
    this.state = { ...this.state, plan };
    this.emit('state', this.state);
    this.emit('plan', plan);
  }

  ingestTelemetry(t: RawTelemetry): void {
    const breadcrumb = this.updateBreadcrumb(t);
    this.updateTakeoffState(t);
    const flightTimeSec =
      this.takeoffAt == null ? null : Math.max(0, (t.timestamp - this.takeoffAt) / 1000);

    this.state = {
      ...this.state,
      telemetry: t,
      breadcrumb,
      progress: { ...this.state.progress, flightTimeSec },
    };
    this.emit('state', this.state);
  }

  getState(): FlightState {
    return this.state;
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
