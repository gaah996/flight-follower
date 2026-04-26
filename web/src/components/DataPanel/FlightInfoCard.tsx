import { useState } from 'react';
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';

function fmtFL(ft: number | undefined): string {
  if (ft == null) return '—';
  // Floor to the nearest 1000 ft so Simbrief's metric-converted altitudes
  // (e.g. 38500 for an FL380 plan) render as FL380 rather than FL385/FL390.
  return 'FL' + (Math.floor(ft / 1000) * 10).toString().padStart(3, '0');
}

export function FlightInfoCard() {
  const plan = useFlightStore((s) => s.state.plan);
  const [expanded, setExpanded] = useState(false);

  if (!plan) {
    return (
      <Card title="Flight info">
        <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see flight info.</div>
      </Card>
    );
  }

  const callsign = plan.flightNumber
    ? plan.aircraftType
      ? `${plan.flightNumber} · ${plan.aircraftType}`
      : plan.flightNumber
    : plan.aircraftType ?? '—';

  return (
    <Card title="Flight info">
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
          marginBottom: 4,
        }}
      >
        {callsign}
      </div>
      <Row label="Cruise">{fmtFL(plan.cruiseAltitudeFt)}</Row>
      <Row label="Distance">{plan.totalDistanceNm != null ? `${plan.totalDistanceNm} nm` : '—'}</Row>
      {plan.routeString && (
        <div
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Click to collapse' : 'Click to expand'}
          style={{
            marginTop: 8,
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
      )}
    </Card>
  );
}
