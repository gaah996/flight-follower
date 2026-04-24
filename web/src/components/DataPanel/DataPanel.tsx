import { AltitudeCard } from './AltitudeCard.js';
import { PositionCard } from './PositionCard.js';
import { RouteCard } from './RouteCard.js';
import { SpeedCard } from './SpeedCard.js';
import { TimeCard } from './TimeCard.js';
import { WindCard } from './WindCard.js';

export function DataPanel() {
  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: 12 }}>
      <PositionCard />
      <SpeedCard />
      <AltitudeCard />
      <WindCard />
      <TimeCard />
      <RouteCard />
    </div>
  );
}
