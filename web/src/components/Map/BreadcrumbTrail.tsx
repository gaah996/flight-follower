import { Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;
  const positions: [number, number][] = crumbs.map((c) => [c.lat, c.lon]);
  return <Polyline positions={positions} pathOptions={{ color: '#f59e0b', weight: 3 }} />;
}
