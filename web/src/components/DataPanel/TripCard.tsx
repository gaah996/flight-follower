import { useEffect, useState } from 'react';
import type { Airport } from '@ff/shared';
import { Card } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtDurationSec, fmtNum, fmtUtcTime } from './fmt.js';
import { Row } from './Row.js';

function fmtAirport(a: Airport): string {
  return a.name ? `${a.icao} · ${a.name}` : a.icao;
}

export function TripCard() {
  const plan = useFlightStore((s) => s.state.plan);
  const progress = useFlightStore((s) => s.state.progress);
  const telemetry = useFlightStore((s) => s.state.telemetry);

  // Force a re-render every 30s so the wall-clock fallback for ETA still
  // ticks even when no telemetry is arriving (e.g. on the menu).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!plan) {
    return (
      <Card variant="default">
        <Card.Header>
          <Card.Title>Trip</Card.Title>
        </Card.Header>
        <Card.Content>
          <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see trip info.</div>
        </Card.Content>
      </Card>
    );
  }

  const now = telemetry?.simTimeUtc ?? Date.now();
  const etaMs =
    progress.eteToDestSec != null ? now + progress.eteToDestSec * 1000 : null;

  const distanceToGo =
    progress.distanceToDestNm != null ? `${fmtNum(progress.distanceToDestNm, 0)} nm` : dash;
  const eteToGo = fmtDurationSec(progress.eteToDestSec);
  const eta = etaMs != null ? `${fmtUtcTime(etaMs)}z` : dash;

  return (
    <Card variant="default">
      <Card.Header>
        <Card.Title>Trip</Card.Title>
      </Card.Header>
      <Card.Content>
        <div
          style={{
            fontSize: 14,
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--ff-fg)',
            lineHeight: 1.4,
          }}
        >
          <div>{fmtAirport(plan.origin)}</div>
          <div style={{ color: 'var(--ff-fg-muted)' }}>↓</div>
          <div>{fmtAirport(plan.destination)}</div>
        </div>
        <div style={{ marginTop: 8 }}>
          <Row label="To go">{distanceToGo}</Row>
          <Row label="ETE">{eteToGo}</Row>
          <Row label="ETA">{eta}</Row>
        </div>
      </Card.Content>
      {progress.nextWaypoint && (
        <Card.Footer>
          <div
            style={{
              fontSize: 12,
              color: 'var(--ff-fg-muted)',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            Next: {progress.nextWaypoint.ident}
            {progress.distanceToNextNm != null ? ` · ${fmtNum(progress.distanceToNextNm, 1)} nm` : ''}
            {progress.eteToNextSec != null ? ` · ${fmtDurationSec(progress.eteToNextSec)}` : ''}
          </div>
        </Card.Footer>
      )}
    </Card>
  );
}
