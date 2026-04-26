import { Card, Separator } from '@heroui/react';
import { PlaneFill } from '@gravity-ui/icons';
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
        <Separator className="my-3" />
        <Row label="HDG" tooltip="Magnetic heading">
          <span className="inline-flex items-center gap-1.5">
            {t ? `${fmtNum(t.heading.magnetic, 0)}°` : dash}
            {t && (
              <PlaneFill
                width={12}
                height={12}
                style={{
                  transform: `rotate(${t.heading.magnetic}deg)`,
                  transformOrigin: 'center',
                  color: 'var(--ff-fg-muted)',
                }}
              />
            )}
          </span>
        </Row>
      </Card.Content>
    </Card>
  );
}
