import { useFlightStore } from '../../store/flight.js';

const SIZE = 80;
const CENTER = SIZE / 2;
const RING_RADIUS = SIZE / 2 - 4;

export function WindCompass() {
  const t = useFlightStore((s) => s.state.telemetry);
  const dir = t?.wind.direction ?? null;
  const heading = t?.heading.magnetic ?? null;

  const cardinals: Array<{ label: string; angle: number }> = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
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

        {/* aircraft heading triangle (smaller, hollow) */}
        {heading != null && (
          <g transform={`rotate(${heading} ${CENTER} ${CENTER})`}>
            <polygon
              points={`${CENTER},${CENTER - RING_RADIUS + 14} ${CENTER - 4},${CENTER - RING_RADIUS + 22} ${CENTER + 4},${CENTER - RING_RADIUS + 22}`}
              fill="none"
              stroke="var(--ff-compass-heading)"
              strokeWidth={1.2}
            />
          </g>
        )}

        {/* wind arrow — full-diameter shaft pointing toward where the wind is blowing */}
        {dir != null && (() => {
          const tipY = CENTER - RING_RADIUS + 14;       // arrowhead tip — just inside the N cardinal
          const baseY = tipY + 10;                       // arrowhead base — 10 px arrow
          const tailY = CENTER + RING_RADIUS - 14;       // tail — just inside the S cardinal
          return (
            <g transform={`rotate(${dir + 180} ${CENTER} ${CENTER})`}>
              <line
                x1={CENTER}
                y1={baseY}
                x2={CENTER}
                y2={tailY}
                stroke="var(--ff-compass-arrow)"
                strokeWidth={1.5}
              />
              <polygon
                points={`${CENTER},${tipY} ${CENTER - 5},${baseY} ${CENTER + 5},${baseY}`}
                fill="var(--ff-compass-arrow)"
              />
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
