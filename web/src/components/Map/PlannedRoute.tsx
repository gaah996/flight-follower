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
      <CircleMarker
        center={[plan.origin.lat, plan.origin.lon]}
        radius={5}
        pathOptions={{ color: '#0d9488', fillColor: '#fff', fillOpacity: 1 }}
      >
        <Tooltip permanent direction="top" offset={[0, -8]}>
          <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{plan.origin.icao}</strong>
          {plan.origin.name && (
            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>{plan.origin.name}</div>
          )}
        </Tooltip>
      </CircleMarker>
      <CircleMarker
        center={[plan.destination.lat, plan.destination.lon]}
        radius={5}
        pathOptions={{ color: '#e11d48', fillColor: '#fff', fillOpacity: 1 }}
      >
        <Tooltip permanent direction="top" offset={[0, -8]}>
          <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{plan.destination.icao}</strong>
          {plan.destination.name && (
            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>{plan.destination.name}</div>
          )}
        </Tooltip>
      </CircleMarker>
    </>
  );
}
