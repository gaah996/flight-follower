import { AltitudeCard } from './AltitudeCard.js';
import { FlightPlanCard as FlightInfoCard } from './FlightPlanCard.js';
import { PositionCard } from './PositionCard.js';
import { RouteCard } from './RouteCard.js';
import { Section } from './Section.js';
import { SpeedCard } from './SpeedCard.js';
import { TimeCard } from './TimeCard.js';
import { WindCard } from './WindCard.js';

export function DataPanel() {
  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: 12 }}>
      <Section title="Aircraft state" sectionKey="state">
        <PositionCard />
        <SpeedCard />
        <AltitudeCard />
        <WindCard />
      </Section>
      <Section title="Time" sectionKey="time">
        <TimeCard />
      </Section>
      <Section title="Route" sectionKey="route">
        <RouteCard />
        <FlightInfoCard />
      </Section>
    </div>
  );
}
