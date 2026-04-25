import type { Airport } from '@ff/shared';
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, fmtDurationSec, dash } from './fmt.js';

function fmtAirport(a: Airport): string {
  return a.name ? `${a.icao} · ${a.name}` : a.icao;
}

export function RouteCard() {
  const plan = useFlightStore((s) => s.state.plan);
  const p = useFlightStore((s) => s.state.progress);
  if (!plan) {
    return (
      <Card title="Route">
        <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see route info.</div>
      </Card>
    );
  }
  return (
    <Card title="Route">
      <Row label="From">{fmtAirport(plan.origin)}</Row>
      <Row label="To">{fmtAirport(plan.destination)}</Row>
      <Row label="Next WP">{p.nextWaypoint?.ident ?? dash}</Row>
      <Row label="Dist. to next">{p.distanceToNextNm != null ? `${fmtNum(p.distanceToNextNm, 1)} nm` : dash}</Row>
      <Row label="ETE next">{fmtDurationSec(p.eteToNextSec)}</Row>
      <Row label="Dist. to dest">{p.distanceToDestNm != null ? `${fmtNum(p.distanceToDestNm, 0)} nm` : dash}</Row>
      <Row label="ETE dest">{fmtDurationSec(p.eteToDestSec)}</Row>
    </Card>
  );
}
