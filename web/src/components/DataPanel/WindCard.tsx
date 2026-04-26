import { Card } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtNum } from './fmt.js';
import { Row } from './Row.js';
import { WindCompass } from './WindCompass.js';

export function WindCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card variant="default">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card.Header>
            <Card.Title>Wind</Card.Title>
          </Card.Header>
          <Card.Content>
            <Row label="Dir">{t ? `${fmtNum(t.wind.direction, 0)}°` : dash}</Row>
            <Row label="Speed">{t ? `${fmtNum(t.wind.speed, 0)} kt` : dash}</Row>
          </Card.Content>
        </div>
        <WindCompass />
      </div>
    </Card>
  );
}
