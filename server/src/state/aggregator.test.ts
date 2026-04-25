import { describe, expect, it } from 'vitest';
import type { FlightPlan, RawTelemetry } from '@ff/shared';
import { Aggregator } from './aggregator.js';

function telem(partial: Partial<RawTelemetry> & Pick<RawTelemetry, 'timestamp' | 'position' | 'onGround'>): RawTelemetry {
  return {
    timestamp: partial.timestamp,
    position: partial.position,
    altitude: partial.altitude ?? { msl: 0 },
    speed: partial.speed ?? { ground: 0, indicated: 0, mach: 0 },
    heading: partial.heading ?? { magnetic: 0 },
    verticalSpeed: partial.verticalSpeed ?? 0,
    wind: partial.wind ?? { direction: 0, speed: 0 },
    onGround: partial.onGround,
  };
}

describe('Aggregator basics', () => {
  it('starts with null telemetry and empty breadcrumb', () => {
    const a = new Aggregator();
    const s = a.getState();
    expect(s.telemetry).toBeNull();
    expect(s.breadcrumb).toEqual([]);
    expect(s.progress.flightTimeSec).toBeNull();
  });

  it('reflects most recent telemetry and connected flag', () => {
    const a = new Aggregator();
    a.setConnected(true);
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 1, lon: 2 }, onGround: true }));
    const s = a.getState();
    expect(s.connected).toBe(true);
    expect(s.telemetry?.position).toEqual({ lat: 1, lon: 2 });
  });

  it('appends first breadcrumb point on first telemetry', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    expect(a.getState().breadcrumb).toHaveLength(1);
  });

  it('does not append a new breadcrumb within 5 s and <2° heading change', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true, heading: { magnetic: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 50, lon: 10.001 }, onGround: true, heading: { magnetic: 1 } }));
    expect(a.getState().breadcrumb).toHaveLength(1);
  });

  it('appends after 5 s elapsed', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 6000, position: { lat: 50, lon: 10.01 }, onGround: true }));
    expect(a.getState().breadcrumb).toHaveLength(2);
  });

  it('appends on >2° heading change even within 5 s', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true, heading: { magnetic: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 50, lon: 10.001 }, onGround: true, heading: { magnetic: 10 } }));
    expect(a.getState().breadcrumb).toHaveLength(2);
  });

  it('starts the flight timer on takeoff (onGround true -> false)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 50, lon: 10.01 }, onGround: false }));
    const s = a.getState();
    expect(s.progress.flightTimeSec).toBe(0);
  });

  it('increments flight time while airborne', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 50, lon: 10.01 }, onGround: false }));
    a.ingestTelemetry(telem({ timestamp: 70_000, position: { lat: 50, lon: 10.02 }, onGround: false }));
    expect(a.getState().progress.flightTimeSec).toBeCloseTo(60, 0);
  });

  it('emits "state" on every ingest', () => {
    const a = new Aggregator();
    let count = 0;
    a.on('state', () => count++);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 100, position: { lat: 50, lon: 10.001 }, onGround: true }));
    expect(count).toBe(2);
  });
});

const PLAN: FlightPlan = {
  fetchedAt: 0,
  origin: { icao: 'AAAA', lat: 0, lon: 0 },
  destination: { icao: 'BBBB', lat: 0, lon: 10 },
  waypoints: [
    { ident: 'W1', lat: 0, lon: 2 },
    { ident: 'W2', lat: 0, lon: 5 },
    { ident: 'W3', lat: 0, lon: 8 },
  ],
};

describe('Aggregator progress', () => {
  it('has null progress when no plan is set', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }));
    const s = a.getState();
    expect(s.progress.nextWaypoint).toBeNull();
    expect(s.progress.distanceToNextNm).toBeNull();
    expect(s.progress.distanceToDestNm).toBeNull();
  });

  it('picks the first unpassed waypoint when a plan is set', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 1.1, lon: 0 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }));
    const s = a.getState();
    expect(s.progress.nextWaypoint?.ident).toBe('W1');
    expect(s.progress.distanceToNextNm).toBeGreaterThan(0);
    expect(s.progress.distanceToDestNm).toBeGreaterThan(s.progress.distanceToNextNm ?? 0);
  });

  it('advances nextWaypoint after passing W1', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 1.1, lon: 2.001 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }));
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W1');
  });

  it('computes ETE using ground speed', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: false, speed: { ground: 600, indicated: 600, mach: 0.9 } }));
    const s = a.getState();
    expect(s.progress.eteToDestSec).toBeGreaterThan(0);
  });
});

describe('Aggregator near-(0,0) filter', () => {
  it('drops frames within 1° of the origin (MSFS pre-spawn)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0.0004, lon: 0.014 }, onGround: true }));
    const s = a.getState();
    expect(s.telemetry).toBeNull();
    expect(s.breadcrumb).toEqual([]);
  });

  it('drops a frame on the inside boundary (0.999, 0.999)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0.999, lon: 0.999 }, onGround: true }));
    expect(a.getState().telemetry).toBeNull();
  });

  it('accepts a frame on the outside boundary (1.001, 0)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 1.001, lon: 0 }, onGround: true }));
    expect(a.getState().telemetry?.position.lat).toBe(1.001);
  });

  it('accepts a real-world frame far from origin', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 52.36, lon: 13.51 }, onGround: false }));
    expect(a.getState().telemetry?.position).toEqual({ lat: 52.36, lon: 13.51 });
  });

  it('does not emit "state" for dropped frames', () => {
    const a = new Aggregator();
    let count = 0;
    a.on('state', () => count++);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0.0004, lon: 0.014 }, onGround: true }));
    expect(count).toBe(0);
  });

  it('drops a frame in the southern-western quadrant (negative coords within box)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: -0.5, lon: -0.5 }, onGround: true }));
    expect(a.getState().telemetry).toBeNull();
  });
});
