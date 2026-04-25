import { divIcon } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.7 12.3 2 11.5 2S10 2.7 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

export function AircraftMarker() {
  const t = useFlightStore((s) => s.state.telemetry);
  const plan = useFlightStore((s) => s.state.plan);
  if (!t) return null;
  const heading = t.heading.magnetic;
  const html = `
    <div class="ff-aircraft" style="width:24px;height:24px;transform:rotate(${heading}deg);transform-origin:center;display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
        <path fill="currentColor" d="${PLANE_PATH}" />
      </svg>
    </div>
  `;
  const icon = divIcon({
    className: 'ff-aircraft',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  const tooltipText =
    plan?.flightNumber && plan?.aircraftType
      ? `${plan.flightNumber} · ${plan.aircraftType}`
      : plan?.flightNumber || plan?.aircraftType || 'Aircraft';

  return (
    <Marker position={[t.position.lat, t.position.lon]} icon={icon} interactive>
      <Tooltip direction="top" offset={[0, -16]} opacity={1}>
        {tooltipText}
      </Tooltip>
    </Marker>
  );
}
