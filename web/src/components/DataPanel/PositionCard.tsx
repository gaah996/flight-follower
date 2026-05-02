import { Card, Separator } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtLatHemi, fmtLonHemi, fmtNum } from './fmt.js';
import { Row } from './Row.js';

// Same north-pointing plane silhouette used by AircraftMarker. Drawn nose-up
// at 0°, so rotation by raw magnetic heading works without offset.
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.7 12.3 2 11.5 2S10 2.7 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

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
              <svg
                viewBox="0 0 24 24"
                width={12}
                height={12}
                style={{
                  transform: `rotate(${t.heading.magnetic}deg)`,
                  transformOrigin: 'center',
                  color: 'var(--ff-fg-muted)',
                }}
                aria-hidden
              >
                <path fill="currentColor" d={PLANE_PATH} />
              </svg>
            )}
          </span>
        </Row>
        <Row label="TRK" tooltip="Ground track (true)">
          {t ? `${fmtNum(t.track.true, 0)}°T` : dash}
        </Row>
      </Card.Content>
    </Card>
  );
}
