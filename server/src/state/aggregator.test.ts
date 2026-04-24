import { describe, expect, it } from 'vitest';
import type { RawTelemetry } from '@ff/shared';
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
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    expect(a.getState().breadcrumb).toHaveLength(1);
  });

  it('does not append a new breadcrumb within 5 s and <2° heading change', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true, heading: { magnetic: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 0, lon: 0.001 }, onGround: true, heading: { magnetic: 1 } }));
    expect(a.getState().breadcrumb).toHaveLength(1);
  });

  it('appends after 5 s elapsed', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 6000, position: { lat: 0, lon: 0.01 }, onGround: true }));
    expect(a.getState().breadcrumb).toHaveLength(2);
  });

  it('appends on >2° heading change even within 5 s', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true, heading: { magnetic: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 0, lon: 0.001 }, onGround: true, heading: { magnetic: 10 } }));
    expect(a.getState().breadcrumb).toHaveLength(2);
  });

  it('starts the flight timer on takeoff (onGround true -> false)', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 0, lon: 0.01 }, onGround: false }));
    const s = a.getState();
    expect(s.progress.flightTimeSec).toBe(0);
  });

  it('increments flight time while airborne', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 0, lon: 0.01 }, onGround: false }));
    a.ingestTelemetry(telem({ timestamp: 70_000, position: { lat: 0, lon: 0.02 }, onGround: false }));
    expect(a.getState().progress.flightTimeSec).toBeCloseTo(60, 0);
  });

  it('emits "state" on every ingest', () => {
    const a = new Aggregator();
    let count = 0;
    a.on('state', () => count++);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 100, position: { lat: 0, lon: 0.001 }, onGround: true }));
    expect(count).toBe(2);
  });
});
