import { useEffect, useState } from 'react';
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtDurationSec, fmtUtcTime } from './fmt.js';

export function TimeCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const plan = useFlightStore((s) => s.state.plan);
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
    <Card title="Time">
      <Row label="UTC now">{`${fmtUtcTime(now)}${usingSimTime ? ' (sim)' : ''}`}</Row>
      <Row label="UTC dep">{fmtUtcTime(plan?.scheduledOut)}</Row>
      <Row label="UTC arr">{fmtUtcTime(plan?.scheduledIn)}</Row>
      <Row label="Elapsed">{fmtDurationSec(ft)}</Row>
    </Card>
  );
}
