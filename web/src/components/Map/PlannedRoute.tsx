import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

export function PlannedRoute() {
  const plan = useFlightStore((s) => s.state.plan);
  if (!plan) return null;

  const all = [
    [plan.origin.lat, plan.origin.lon] as [number, number],
    ...plan.waypoints.map((w) => [w.lat, w.lon] as [number, number]),
    [plan.destination.lat, plan.destination.lon] as [number, number],
  ];

  return (
    <>
      <Polyline positions={all} pathOptions={{ color: '#a855f7', weight: 2, dashArray: '6 4' }} />
      {plan.waypoints.map((w) => (
        <CircleMarker
          key={`${w.ident}-${w.lat}-${w.lon}`}
          center={[w.lat, w.lon]}
          radius={4}
          pathOptions={{ color: '#a855f7', fillColor: '#fff', fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -6]}>{w.ident}</Tooltip>
        </CircleMarker>
      ))}
      <CircleMarker center={[plan.origin.lat, plan.origin.lon]} radius={6} pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>{plan.origin.icao}</Tooltip>
      </CircleMarker>
      <CircleMarker center={[plan.destination.lat, plan.destination.lon]} radius={6} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>{plan.destination.icao}</Tooltip>
      </CircleMarker>
    </>
  );
}
