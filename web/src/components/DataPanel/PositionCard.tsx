import { Card } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtLatHemi, fmtLonHemi, fmtNum } from './fmt.js';
import { Row } from './Row.js';

export function PositionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const lat = fmtLatHemi(t?.position.lat);
  const lon = fmtLonHemi(t?.position.lon);
  return (
    <Card variant="default">
      <Card.Header>
        <Card.Title>Position</Card.Title>
      </Card.Header>
      <Card.Content>
        <Row label="Lat">{lat}</Row>
        <Row label="Lon">{lon}</Row>
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid var(--ff-border)',
            fontSize: 12,
            color: 'var(--ff-fg-muted)',
          }}
        >
          <Row label="HDG">{t ? `${fmtNum(t.heading.magnetic, 0)}°` : dash}</Row>
        </div>
      </Card.Content>
    </Card>
  );
}
