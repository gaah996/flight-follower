import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtDurationSec } from './fmt.js';

export function TimeCard() {
  const ft = useFlightStore((s) => s.state.progress.flightTimeSec);
  return (
    <Card title="Time">
      <Row label="Elapsed">{fmtDurationSec(ft)}</Row>
    </Card>
  );
}
