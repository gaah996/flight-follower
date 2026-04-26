import { useEffect, useState } from 'react';
import type { Airport } from '@ff/shared';
import { Card, Chip, Separator } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtDurationTier, fmtNum, fmtUtcTime } from './fmt.js';
import { Row } from './Row.js';

function airportLabel(a: Airport): string {
  return a.name ?? a.icao;
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

  // No Card.Header — the section already says "Trip" and there's only one
  // card in the section, so a card title would just duplicate it.
  if (!plan) {
    return (
      <Card variant="default">
        <Card.Content>
          <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see trip info.</div>
        </Card.Content>
      </Card>
    );
  }

  const now = telemetry?.simTimeUtc ?? Date.now();
  const etaMs =
    progress.eteToDestSec != null ? now + progress.eteToDestSec * 1000 : null;

  const remaining =
    progress.distanceToDestNm != null ? `${fmtNum(progress.distanceToDestNm, 0)} nm` : dash;
  const eta = etaMs != null ? `${fmtUtcTime(etaMs)}z` : dash;

  return (
    <Card variant="default">
      <Card.Content>
        {/* Origin → Destination, two columns, with scheduled times under each */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="font-mono text-lg font-semibold leading-tight">{plan.origin.icao}</div>
            <div className="text-xs text-fg-muted">{airportLabel(plan.origin)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-mono text-sm tabular-nums">{fmtUtcTime(plan.scheduledOut)}</span>
              {plan.scheduledOut != null && (
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>sched</Chip.Label>
                </Chip>
              )}
            </div>
          </div>
          <div className="text-fg-muted self-center">→</div>
          <div className="flex flex-col gap-0.5 items-end min-w-0 text-right">
            <div className="font-mono text-lg font-semibold leading-tight">{plan.destination.icao}</div>
            <div className="text-xs text-fg-muted">{airportLabel(plan.destination)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-mono text-sm tabular-nums">{fmtUtcTime(plan.scheduledIn)}</span>
              {plan.scheduledIn != null && (
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>sched</Chip.Label>
                </Chip>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-3" />

        <Row label="Remaining">{remaining}</Row>
        <Row label="ETE">{fmtDurationTier(progress.eteToDestSec)}</Row>
        <Row label="ETA">{eta}</Row>

        {progress.nextWaypoint && (
          <>
            <Separator className="my-3" />
            <div
              style={{
                fontSize: 12,
                color: 'var(--ff-fg-muted)',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              Next: {progress.nextWaypoint.ident}
              {progress.distanceToNextNm != null && (
                <> · {fmtNum(progress.distanceToNextNm, 1)} nm</>
              )}
              {progress.eteToNextSec != null && (
                <> · {fmtDurationTier(progress.eteToNextSec)}</>
              )}
            </div>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
