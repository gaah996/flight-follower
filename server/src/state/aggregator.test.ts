import { describe, expect, it } from 'vitest';
import type { FlightPlan, RawTelemetry } from '@ff/shared';
import { Aggregator } from './aggregator.js';

function telem(partial: Partial<RawTelemetry> & Pick<RawTelemetry, 'timestamp' | 'position' | 'onGround'>): RawTelemetry {
  return {
    timestamp: partial.timestamp,
    position: partial.position,
    altitude: partial.altitude ?? { msl: 0 },
    speed: partial.speed ?? { ground: 0, indicated: 0, mach: 0 },
    heading: partial.heading ?? { magnetic: 0, true: 0 },
    track: partial.track ?? { true: 0 },
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

  it('appends first breadcrumb point with altitude', () => {
    const a = new Aggregator();
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 50, lon: 10 },
        onGround: true,
        altitude: { msl: 1234 },
      }),
    );
    const crumb = a.getState().breadcrumb[0];
    expect(crumb).toEqual({ lat: 50, lon: 10, altMsl: 1234 });
  });

  it('does not append a new breadcrumb within 5 s and <2° heading change', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true, heading: { magnetic: 0, true: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 50, lon: 10.001 }, onGround: true, heading: { magnetic: 1, true: 1 } }));
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
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true, heading: { magnetic: 0, true: 0 } }));
    a.ingestTelemetry(telem({ timestamp: 1000, position: { lat: 50, lon: 10.001 }, onGround: true, heading: { magnetic: 10, true: 10 } }));
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
    // lat: 0 here is fine: lon: 2.001 already places us outside the (0,0)
    // filter box on the longitude axis, and we need to be at W1 (which sits
    // on the equator in PLAN) for the pass-detection to fire.
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 2.001 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }));
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W2');
  });

  it('computes ETE using ground speed', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: false, speed: { ground: 600, indicated: 600, mach: 0.9 } }));
    const s = a.getState();
    expect(s.progress.eteToDestSec).toBeGreaterThan(0);
  });

  it('advances passedIndex via along-track when off-track wider than the close-pass threshold', () => {
    // Aircraft 10 nm north of the route (~0.16°) at lon 5.5 — well past
    // W2 along-track but never within 2 nm of any waypoint, so the
    // close-pass advancer alone would leave the cursor stuck.
    const a = new Aggregator();
    a.setPlan(PLAN);
    // Seed with an on-route ingest at W1 so the cursor starts at 0.
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 0, lon: 2.001 },
        onGround: false,
        speed: { ground: 200, indicated: 200, mach: 0.3 },
      }),
    );
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W2');

    // Now drift north, past W2 along-track but ~10 nm wide of the leg.
    a.ingestTelemetry(
      telem({
        timestamp: 60_000,
        position: { lat: 0.166, lon: 5.5 },
        onGround: false,
        speed: { ground: 200, indicated: 200, mach: 0.3 },
      }),
    );
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W3');
  });

  it('auto-resumes passedIndex from current position on plan reload', () => {
    // Simulates re-fetching the Simbrief plan mid-flight. The aircraft is
    // positioned between W1 and W2; loading the plan should seed the cursor
    // there rather than snapping back to the first waypoint. Without
    // auto-resume, advancePassedIndex (threshold 2 nm) can only catch the
    // aircraft as it passes within close range of each waypoint — useless
    // for re-fetches that happen mid-leg.
    const a = new Aggregator();
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 0, lon: 3.6 }, // past W1 (lon 2), before W2 (lon 5)
        onGround: false,
        speed: { ground: 200, indicated: 200, mach: 0.3 },
      }),
    );
    a.setPlan(PLAN);
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W2');
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

describe('Aggregator resetAircraft', () => {
  it('clears breadcrumb and flight timer; preserves plan and telemetry', () => {
    const a = new Aggregator();
    a.setConnected(true);
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 50, lon: 10.01 }, onGround: false }));
    expect(a.getState().progress.flightTimeSec).toBe(0);
    expect(a.getState().breadcrumb.length).toBeGreaterThan(0);

    a.resetAircraft();
    const s = a.getState();
    expect(s.breadcrumb).toEqual([]);
    expect(s.plan).not.toBeNull();
    expect(s.telemetry?.position).toEqual({ lat: 50, lon: 10.01 });
    expect(s.connected).toBe(true);

    // Subsequent airborne frame should not auto-restart the timer; only a
    // fresh on-ground → air edge does.
    a.ingestTelemetry(telem({ timestamp: 20_000, position: { lat: 50, lon: 10.02 }, onGround: false }));
    expect(a.getState().progress.flightTimeSec).toBeNull();
  });

  it('emits "state" but not "plan"', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    let stateCount = 0;
    let planCount = 0;
    a.on('state', () => stateCount++);
    a.on('plan', () => planCount++);
    a.resetAircraft();
    expect(stateCount).toBe(1);
    expect(planCount).toBe(0);
  });
});

describe('Aggregator resetPlan', () => {
  it('clears plan and progress; preserves breadcrumb and telemetry', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    a.ingestTelemetry(
      telem({ timestamp: 0, position: { lat: 1, lon: 1 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }),
    );
    expect(a.getState().breadcrumb).toHaveLength(1);

    a.resetPlan();
    const s = a.getState();
    expect(s.plan).toBeNull();
    expect(s.progress.nextWaypoint).toBeNull();
    expect(s.progress.distanceToDestNm).toBeNull();
    expect(s.breadcrumb).toHaveLength(1);
    expect(s.telemetry?.position).toEqual({ lat: 1, lon: 1 });
  });

  it('rewinds the passed-waypoint cursor so progress restarts from W1', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    // Pass W1 — nextWaypoint advances to W2.
    a.ingestTelemetry(
      telem({ timestamp: 0, position: { lat: 0, lon: 2.001 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }),
    );
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W2');

    // After resetPlan, ingest a frame far from every waypoint so the next
    // setPlan() — which re-runs computeProgress against current telemetry —
    // doesn't immediately re-advance the cursor based on stale position.
    a.resetPlan();
    a.ingestTelemetry(
      telem({ timestamp: 1000, position: { lat: 5, lon: 0 }, onGround: false, speed: { ground: 200, indicated: 200, mach: 0.3 } }),
    );
    a.setPlan(PLAN);
    expect(a.getState().progress.nextWaypoint?.ident).toBe('W1');
  });

  it('emits "state" but not "plan"', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    let stateCount = 0;
    let planCount = 0;
    a.on('state', () => stateCount++);
    a.on('plan', () => planCount++);
    a.resetPlan();
    expect(stateCount).toBe(1);
    expect(planCount).toBe(0);
  });
});

describe('Aggregator resetAll', () => {
  it('clears plan, breadcrumb, flight timer, and progress', () => {
    const a = new Aggregator();
    a.setConnected(true);
    a.setPlan(PLAN);
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 50, lon: 10 }, onGround: true }));
    a.ingestTelemetry(telem({ timestamp: 10_000, position: { lat: 50, lon: 10.01 }, onGround: false }));

    a.resetAll();
    const s = a.getState();
    expect(s.plan).toBeNull();
    expect(s.breadcrumb).toEqual([]);
    expect(s.progress.nextWaypoint).toBeNull();
    expect(s.progress.flightTimeSec).toBeNull();
    expect(s.connected).toBe(true);
    expect(s.telemetry?.position).toEqual({ lat: 50, lon: 10.01 });
  });

  it('emits a single "state" and no "plan" event', () => {
    const a = new Aggregator();
    a.setPlan(PLAN);
    let stateCount = 0;
    let planCount = 0;
    a.on('state', () => stateCount++);
    a.on('plan', () => planCount++);
    a.resetAll();
    expect(stateCount).toBe(1);
    expect(planCount).toBe(0);
  });
});

describe('Aggregator TOC/TOD', () => {
  const PLAN_WITH_NAMED: FlightPlan = {
    fetchedAt: 0,
    origin: { icao: 'AAAA', lat: 0, lon: 0 },
    destination: { icao: 'BBBB', lat: 0, lon: 10 },
    waypoints: [
      { ident: 'W1', lat: 0, lon: 1, plannedAltitude: 10000 },
      { ident: 'TOC', lat: 0, lon: 2, plannedAltitude: 36000 },
      { ident: 'W2', lat: 0, lon: 5, plannedAltitude: 36000 },
      { ident: 'TOD', lat: 0, lon: 8, plannedAltitude: 36000 },
      { ident: 'W3', lat: 0, lon: 9, plannedAltitude: 10000 },
    ],
    cruiseAltitudeFt: 36000,
  };

  it('exposes tocPosition and todPosition once a plan loads', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    const s = a.getState();
    expect(s.progress.tocPosition).toEqual({ lat: 0, lon: 2 });
    expect(s.progress.todPosition).toEqual({ lat: 0, lon: 8 });
  });

  it('computes eteToTocSec from current GS and distance to TOC', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    // Sit just outside the (0,0) MSFS pre-spawn filter so the frame is
    // accepted; position still well short of TOC at lon: 2.
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 1.001, lon: 0 },
        onGround: false,
        speed: { ground: 60, indicated: 60, mach: 0.1 },
      }),
    );
    const s = a.getState();
    expect(s.progress.eteToTocSec).not.toBeNull();
    expect(s.progress.eteToTocSec!).toBeGreaterThan(0);
  });

  it('returns null tocPosition / todPosition when no plan is loaded', () => {
    const a = new Aggregator();
    a.ingestTelemetry(telem({ timestamp: 0, position: { lat: 0, lon: 0 }, onGround: false }));
    const s = a.getState();
    expect(s.progress.tocPosition).toBeNull();
    expect(s.progress.todPosition).toBeNull();
    expect(s.progress.eteToTocSec).toBeNull();
    expect(s.progress.eteToTodSec).toBeNull();
  });

  it('clears TOC/TOD on resetPlan', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    a.resetPlan();
    expect(a.getState().progress.tocPosition).toBeNull();
    expect(a.getState().progress.todPosition).toBeNull();
  });

  it('null eteToTocSec once aircraft is past TOC, but tocPosition stays', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    // Aircraft at lon 4: past TOC (lon 2) but before TOD (lon 8).
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 0, lon: 4 },
        onGround: false,
        speed: { ground: 200, indicated: 200, mach: 0.3 },
      }),
    );
    const s = a.getState();
    expect(s.progress.eteToTocSec).toBeNull();
    expect(s.progress.tocPosition).toEqual({ lat: 0, lon: 2 });
    // TOD still ahead at lon 8 → eteToTodSec should still compute.
    expect(s.progress.eteToTodSec).not.toBeNull();
    expect(s.progress.eteToTodSec!).toBeGreaterThan(0);
  });

  it('null eteToTodSec once aircraft is past TOD as well', () => {
    const a = new Aggregator();
    a.setPlan(PLAN_WITH_NAMED);
    // Aircraft at lon 9: past both TOC and TOD.
    a.ingestTelemetry(
      telem({
        timestamp: 0,
        position: { lat: 0, lon: 9 },
        onGround: false,
        speed: { ground: 200, indicated: 200, mach: 0.3 },
      }),
    );
    const s = a.getState();
    expect(s.progress.eteToTocSec).toBeNull();
    expect(s.progress.eteToTodSec).toBeNull();
    // Markers stay visible.
    expect(s.progress.tocPosition).not.toBeNull();
    expect(s.progress.todPosition).not.toBeNull();
  });
});
