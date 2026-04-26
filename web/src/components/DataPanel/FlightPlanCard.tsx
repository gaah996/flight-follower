import { useState } from 'react';
import { Card } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtUtcTime } from './fmt.js';
import { Row } from './Row.js';

function fmtFL(ft: number | undefined): string {
  if (ft == null) return dash;
  // Floor to the nearest 1000 ft so Simbrief's metric-converted altitudes
  // (e.g. 38500 for an FL380 plan) render as FL380 rather than FL385/FL390.
  return 'FL' + (Math.floor(ft / 1000) * 10).toString().padStart(3, '0');
}

export function FlightPlanCard() {
  const plan = useFlightStore((s) => s.state.plan);
  const [expanded, setExpanded] = useState(false);

  if (!plan) {
    return (
      <Card variant="default">
        <Card.Header>
          <Card.Title>Flight plan</Card.Title>
        </Card.Header>
        <Card.Content>
          <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see flight plan details.</div>
        </Card.Content>
      </Card>
    );
  }

  const callsign = plan.flightNumber
    ? plan.aircraftType
      ? `${plan.flightNumber} · ${plan.aircraftType}`
      : plan.flightNumber
    : plan.aircraftType ?? dash;

  return (
    <Card variant="default">
      <Card.Header>
        <Card.Title>Flight plan</Card.Title>
        <Card.Description>{callsign}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Row label="Cruise">{fmtFL(plan.cruiseAltitudeFt)}</Row>
        <Row label="Distance">{plan.totalDistanceNm != null ? `${plan.totalDistanceNm} nm` : dash}</Row>
        <Row label="UTC dep">{fmtUtcTime(plan.scheduledOut)}</Row>
        <Row label="UTC arr">{fmtUtcTime(plan.scheduledIn)}</Row>
      </Card.Content>
      {plan.routeString && (
        <Card.Footer>
          <div
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Click to collapse' : 'Click to expand'}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 4,
              background: 'var(--ff-bg)',
              border: '1px solid var(--ff-border)',
              fontSize: 12,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ff-fg-muted)',
              cursor: 'pointer',
              whiteSpace: expanded ? 'normal' : 'nowrap',
              overflow: expanded ? 'visible' : 'hidden',
              textOverflow: expanded ? 'clip' : 'ellipsis',
              wordBreak: expanded ? 'break-all' : undefined,
            }}
          >
            {plan.routeString}
          </div>
        </Card.Footer>
      )}
    </Card>
  );
}
