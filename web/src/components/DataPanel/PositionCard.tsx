import { useState } from 'react';
import { Card, Separator, Surface } from '@heroui/react';
import { ChevronDown } from '@gravity-ui/icons';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtLatHemi, fmtLonHemi, fmtNum } from './fmt.js';
import { Row } from './Row.js';

// Same north-pointing plane silhouette used by AircraftMarker. Drawn nose-up
// at 0°, so rotation by raw magnetic heading works without offset.
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.7 12.3 2 11.5 2S10 2.7 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

export function PositionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const [trkOpen, setTrkOpen] = useState(false);
  const lat = fmtLatHemi(t?.position.lat);
  const lon = fmtLonHemi(t?.position.lon);

  return (
    <Card variant="default">
      <Card.Header>
        <Card.Title>Position</Card.Title>
      </Card.Header>
      <Card.Content>
        <Row label="Lat">{lat}</Row>
        <Row label="Lon">{lon}</Row>
        <Separator className="my-3" />

        {/* HDG row doubles as the disclosure trigger for TRK below. Mirrors
            the GS / IAS-Mach pattern in MotionCard. */}
        <button
          type="button"
          onClick={() => setTrkOpen((v) => !v)}
          aria-expanded={trkOpen}
          aria-controls="position-trk"
          title="Magnetic heading"
          className="ff-row flex justify-between items-center text-sm w-full bg-transparent border-0 p-0 text-left cursor-pointer"
        >
          <span style={{ color: 'var(--ff-fg-muted)' }}>HDG</span>
          <span
            className="inline-flex items-center gap-1.5"
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--ff-fg)',
            }}
          >
            {t ? `${fmtNum(t.heading.magnetic, 0)}°` : dash}
            {t && (
              <svg
                viewBox="0 0 24 24"
                width={12}
                height={12}
                style={{
                  transform: `rotate(${t.heading.magnetic}deg)`,
                  transformOrigin: 'center',
                  color: 'var(--ff-fg-muted)',
                }}
                aria-hidden
              >
                <path fill="currentColor" d={PLANE_PATH} />
              </svg>
            )}
            <ChevronDown
              width={14}
              height={14}
              style={{
                color: 'var(--ff-fg-muted)',
                transform: trkOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 120ms ease',
              }}
            />
          </span>
        </button>

        {trkOpen && (
          <Surface
            id="position-trk"
            variant="secondary"
            className="rounded-lg py-1 px-2 ml-[-8px] mr-[-8px] text-xs"
          >
            <div className="flex justify-between" title="Ground track (true)">
              <span style={{ color: 'var(--ff-fg-muted)' }}>TRK</span>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--ff-fg)',
                }}
              >
                {t ? `${fmtNum(t.track.true, 0)}°T` : dash}
              </span>
            </div>
          </Surface>
        )}
      </Card.Content>
    </Card>
  );
}
