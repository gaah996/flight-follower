import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';

export function SpeedCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Speed">
      <Row label="GS">{t ? `${fmtNum(t.speed.ground, 0)} kt` : dash}</Row>
      <Row label="IAS">{t ? `${fmtNum(t.speed.indicated, 0)} kt` : dash}</Row>
      <Row label="Mach">{t ? fmtNum(t.speed.mach, 2) : dash}</Row>
    </Card>
  );
}
