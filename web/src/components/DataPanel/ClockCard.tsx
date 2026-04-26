import { useEffect, useState } from 'react';
import { Card } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { fmtDurationTier, fmtUtcTime } from './fmt.js';
import { Row } from './Row.js';

export function ClockCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const ft = useFlightStore((s) => s.state.progress.flightTimeSec);

  // Force a re-render every 30s so the wall-clock fallback for "Now" still
  // ticks even when no telemetry is arriving (e.g., on the menu).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const usingSimTime = t?.simTimeUtc != null;
  const now = t?.simTimeUtc ?? Date.now();

  return (
    <Card variant="default">
      <Card.Header>
        <Card.Title>Clock</Card.Title>
      </Card.Header>
      <Card.Content>
        <Row label="UTC now">{`${fmtUtcTime(now)}${usingSimTime ? ' (sim)' : ''}`}</Row>
        <Row label="Elapsed">{fmtDurationTier(ft)}</Row>
      </Card.Content>
    </Card>
  );
}
