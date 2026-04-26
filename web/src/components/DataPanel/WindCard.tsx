import { Card, Separator } from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtNum } from './fmt.js';
import { Row } from './Row.js';
import { WindCompass } from './WindCompass.js';

// Headwind component (kt). Positive = headwind, negative = tailwind.
// Wind direction is the direction the wind is *from*; when it equals the
// aircraft heading the wind is hitting the nose head-on, so cos(0) = +1
// and the full speed is on the nose.
function headwindKt(windDir: number, windSpeed: number, heading: number): number {
  return windSpeed * Math.cos(((windDir - heading) * Math.PI) / 180);
}

export function WindCard() {
  const t = useFlightStore((s) => s.state.telemetry);

  // Always render the head/tail block, even at 0 — otherwise it pops in and
  // out as the component crosses zero and the speed value jitters left/right.
  let component: { kind: 'HD' | 'TL'; value: number } | null = null;
  if (t) {
    const hw = headwindKt(t.wind.direction, t.wind.speed, t.heading.magnetic);
    component = { kind: hw >= 0 ? 'HD' : 'TL', value: Math.abs(Math.round(hw)) };
  }

  return (
    <Card variant="default">
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
          <Card.Header>
            <Card.Title>Wind</Card.Title>
          </Card.Header>
          <Card.Content>
            <Row label="Dir">{t ? `${fmtNum(t.wind.direction, 0)}°` : dash}</Row>
            <Row label="Speed">
              {t ? (
                <>
                  {fmtNum(t.wind.speed, 0)} kt
                  {component && (
                    <>
                      {' '}
                      <span className="minor">
                        <span style={{ fontSize: '0.85em' }}>{component.kind}</span>
                        {component.value}
                      </span>
                    </>
                  )}
                </>
              ) : (
                dash
              )}
            </Row>
          </Card.Content>
        </div>
        <Separator orientation="vertical" />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <WindCompass />
        </div>
      </div>
    </Card>
  );
}
