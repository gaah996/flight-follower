import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';
import { WindCompass } from './WindCompass.js';

export function WindCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Wind" sideSlot={<WindCompass />}>
      <Row label="Dir">{t ? `${fmtNum(t.wind.direction, 0)}°` : dash}</Row>
      <Row label="Speed">{t ? `${fmtNum(t.wind.speed, 0)} kt` : dash}</Row>
    </Card>
  );
}
