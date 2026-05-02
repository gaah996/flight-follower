import { useFlightStore } from '../../store/flight.js';

const SIZE = 80;
const CENTER = SIZE / 2;
const RING_RADIUS = SIZE / 2 - 4;

// Same north-pointing plane silhouette used by AircraftMarker / PositionCard.
// Visual centre of the path is roughly (11.5, 12) in its 24×24 viewBox; we
// translate by that before rotating so heading rotation pivots around the
// plane's middle, not the SVG origin.
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.7 12.3 2 11.5 2S10 2.7 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';
const PLANE_SCALE = 0.7;

export function WindCompass() {
  const t = useFlightStore((s) => s.state.telemetry);
  const dir = t?.wind.direction ?? null;
  // Wind direction from the sim is in degrees TRUE; rotate the aircraft
  // silhouette by true heading so both share the same reference frame and
  // match the map's plane icon. The cockpit-style HDG row in PositionCard
  // continues to display magnetic.
  const heading = t?.heading.true ?? null;

  const cardinals: Array<{ label: string; angle: number }> = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
  ];

  // Ticks every 30°, skipping the four cardinals — the N/E/S/W letters
  // already anchor those positions, ticks there would just clutter.
  const tickAngles = [30, 60, 120, 150, 210, 240, 300, 330];

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label="Wind compass">
        {/* outer ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--ff-border)"
          strokeWidth={1}
        />

        {/* 30° tick marks */}
        {tickAngles.map((angle) => {
          const rad = (angle - 90) * (Math.PI / 180);
          const x1 = CENTER + Math.cos(rad) * RING_RADIUS;
          const y1 = CENTER + Math.sin(rad) * RING_RADIUS;
          const x2 = CENTER + Math.cos(rad) * (RING_RADIUS - 3);
          const y2 = CENTER + Math.sin(rad) * (RING_RADIUS - 3);
          return (
            <line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--ff-border)"
              strokeWidth={1}
            />
          );
        })}

        {/* cardinal labels */}
        {cardinals.map(({ label, angle }) => {
          const rad = (angle - 90) * (Math.PI / 180);
          const x = CENTER + Math.cos(rad) * (RING_RADIUS - 8);
          const y = CENTER + Math.sin(rad) * (RING_RADIUS - 8);
          return (
            <text
              key={label}
              x={x}
              y={y}
              fill="var(--ff-fg-muted)"
              fontSize={9}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label}
            </text>
          );
        })}

        {/* aircraft heading — plane silhouette at the centre, drawn under the
            wind shaft so the wind reading remains the dominant overlay */}
        {heading != null && (
          <g
            transform={`translate(${CENTER} ${CENTER}) rotate(${heading}) scale(${PLANE_SCALE}) translate(-11.5 -12)`}
          >
            <path d={PLANE_PATH} fill="var(--ff-compass-heading)" />
          </g>
        )}

        {/* wind arrow — full-diameter shaft pointing toward where the wind is
            blowing. Thin stroke + small arrowhead + slight opacity keeps the
            arrow legible without dominating the dial. */}
        {dir != null && (() => {
          const tipY = CENTER - RING_RADIUS + 14;       // arrowhead tip — just inside the N cardinal
          const baseY = tipY + 6;                        // arrowhead base — 6 px arrow
          const tailY = CENTER + RING_RADIUS - 14;       // tail — just inside the S cardinal
          return (
            <g transform={`rotate(${dir + 180} ${CENTER} ${CENTER})`} opacity={0.85}>
              <line
                x1={CENTER}
                y1={baseY}
                x2={CENTER}
                y2={tailY}
                stroke="var(--ff-compass-arrow)"
                strokeWidth={1}
                strokeLinecap="round"
              />
              <polygon
                points={`${CENTER},${tipY} ${CENTER - 3},${baseY} ${CENTER + 3},${baseY}`}
                fill="var(--ff-compass-arrow)"
              />
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
