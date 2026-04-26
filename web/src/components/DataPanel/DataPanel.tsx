import { useFlightStore } from '../../store/flight.js';
import { ClockCard } from './ClockCard.js';
import { FetchPlanButton } from './FetchPlanButton.js';
import { FlightPlanCard } from './FlightPlanCard.js';
import { MotionCard } from './MotionCard.js';
import { PositionCard } from './PositionCard.js';
import { Section } from './Section.js';
import { TripCard } from './TripCard.js';
import { WindCard } from './WindCard.js';

export function DataPanel() {
  const plan = useFlightStore((s) => s.state.plan);
  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: 12 }}>
      {!plan && (
        <div style={{ marginBottom: 12 }}>
          <FetchPlanButton />
        </div>
      )}
      <Section title="Trip" sectionKey="trip">
        <TripCard />
      </Section>
      <Section title="Now" sectionKey="now">
        <PositionCard />
        <MotionCard />
        <WindCard />
      </Section>
      <Section title="Reference" sectionKey="reference">
        <FlightPlanCard />
        <ClockCard />
      </Section>
    </div>
  );
}
