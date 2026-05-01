import { Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { ALTITUDE_STOPS, altitudeBucket, altitudeToColor } from '../../lib/altitudePalette.js';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;

  // Bucket consecutive samples that share an altitude bucket into a single
  // polyline. Each segment includes the previous sample's last point so
  // adjacent buckets stay visually connected on the map.
  const segments: Array<{ bucketFt: number; points: [number, number][] }> = [];
  let current: { bucketFt: number; points: [number, number][] } | null = null;
  for (let i = 0; i < crumbs.length; i++) {
    const c = crumbs[i]!;
    const b = altitudeBucket(c.altMsl);
    const bucketFt = ALTITUDE_STOPS[b]!.ft;
    if (!current || current.bucketFt !== bucketFt) {
      const prev = i > 0 ? crumbs[i - 1]! : null;
      current = { bucketFt, points: prev ? [[prev.lat, prev.lon]] : [] };
      segments.push(current);
    }
    current.points.push([c.lat, c.lon]);
  }

  return (
    <>
      {segments.map((seg, idx) => (
        <Polyline
          key={idx}
          positions={seg.points}
          pathOptions={{ color: altitudeToColor(seg.bucketFt), weight: 3 }}
        />
      ))}
    </>
  );
}
