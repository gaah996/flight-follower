import { Card, Separator } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtNum } from './fmt.js';
import { Row } from './Row.js';

export function MotionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card variant="default">
      <Card.Header>
        <Card.Title>Motion</Card.Title>
      </Card.Header>
      <Card.Content>
        <Row label="GS">{t ? `${fmtNum(t.speed.ground, 0)} kt` : dash}</Row>

        {/* IAS / Mach grouped under GS in a recessed container — same vocab
            as FlightPlanCard's route block. Smaller text for "secondary detail". */}
        <div
          style={{
            marginTop: 4,
            padding: '3px 8px',
            borderRadius: 10,
            background: 'var(--ff-bg)',
            border: '1px solid var(--ff-border)',
            fontSize: 12,
          }}
        >
          <div className="flex justify-between">
            <span style={{ color: 'var(--ff-fg-muted)' }}>IAS</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ff-fg)' }}>
              {t ? `${fmtNum(t.speed.indicated, 0)} kt` : dash}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--ff-fg-muted)' }}>Mach</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ff-fg)' }}>
              {t ? fmtNum(t.speed.mach, 2) : dash}
            </span>
          </div>
        </div>

        <Separator className="my-3" />

        <Row label="Alt">
          {t ? (
            <span className="inline-flex items-center gap-2">
              <span>{fmtNum(t.altitude.msl, 0)} ft</span>
              <span className="minor">
                {t.verticalSpeed > 0 ? '↑' : t.verticalSpeed < 0 ? '↓' : ''}
                {fmtNum(Math.abs(t.verticalSpeed), 0)} fpm
              </span>
            </span>
          ) : (
            dash
          )}
        </Row>
      </Card.Content>
    </Card>
  );
}
