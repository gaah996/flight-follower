import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';

export function MotionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Motion">
      <Row label="GS">{t ? `${fmtNum(t.speed.ground, 0)} kt` : dash}</Row>
      <Row label="Alt">{t ? `${fmtNum(t.altitude.msl, 0)} ft` : dash}</Row>
      <Row label="V/S">{t ? `${fmtNum(t.verticalSpeed, 0)} fpm` : dash}</Row>
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid var(--ff-border)',
          fontSize: 12,
          color: 'var(--ff-fg-muted)',
        }}
      >
        <Row label="IAS">{t ? `${fmtNum(t.speed.indicated, 0)} kt` : dash}</Row>
        <Row label="Mach">{t ? fmtNum(t.speed.mach, 2) : dash}</Row>
      </div>
    </Card>
  );
}
