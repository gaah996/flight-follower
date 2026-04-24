import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';

export function AltitudeCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Altitude">
      <Row label="MSL">{t ? `${fmtNum(t.altitude.msl, 0)} ft` : dash}</Row>
      <Row label="V/S">{t ? `${fmtNum(t.verticalSpeed, 0)} fpm` : dash}</Row>
      <Row label="HDG">{t ? `${fmtNum(t.heading.magnetic, 0)}°` : dash}</Row>
    </Card>
  );
}
