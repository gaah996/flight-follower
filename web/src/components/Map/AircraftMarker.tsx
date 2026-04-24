import { divIcon } from 'leaflet';
import { Marker } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

export function AircraftMarker() {
  const t = useFlightStore((s) => s.state.telemetry);
  if (!t) return null;
  const heading = t.heading.magnetic;
  const icon = divIcon({
    className: 'ff-aircraft',
    html: `<div style="transform: rotate(${heading}deg); width:24px; height:24px; font-size:24px; line-height:24px; text-align:center;">✈</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  return <Marker position={[t.position.lat, t.position.lon]} icon={icon} interactive={false} />;
}
