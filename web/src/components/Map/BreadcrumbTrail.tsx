import { Pane, Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { altitudeToColor } from '../../lib/altitudePalette.js';

// Variable bucket sizing — fine resolution where altitude is changing
// (climb / descent) and coarse where it isn't (cruise).
//
//   0 – 10,000 ft : 1,000 ft buckets   pattern + departure/arrival climb
//  10 – 30,000 ft : 2,000 ft buckets   mid-climb / mid-descent
//  30,000 ft up   : 3,000 ft buckets   cruise (mostly constant alt anyway)
//
// Returns the bucket key (lower bound, unique across the range) plus the
// altitude at the bucket centre so colour lookup is honest.
function altitudeBucket(altMsl: number): { key: number; centerFt: number } {
  if (altMsl < 10_000) {
    const key = Math.floor(altMsl / 1000) * 1000;
    return { key, centerFt: key + 500 };
  }
  if (altMsl < 30_000) {
    const key = Math.floor((altMsl - 10_000) / 2000) * 2000 + 10_000;
    return { key, centerFt: key + 1000 };
  }
  const key = Math.floor((altMsl - 30_000) / 3000) * 3000 + 30_000;
  return { key, centerFt: key + 1500 };
}

// Pane at z=410, just above the cruise-points pane (405) so the actual
// flight trail draws over the planned-vs-actual markers but below the
// aircraft (markerPane = 600).
const PANE_NAME = 'ff-breadcrumb';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;

  const segments: Array<{ key: number; color: string; points: [number, number][] }> = [];
  let current: { key: number; color: string; points: [number, number][] } | null = null;
  for (let i = 0; i < crumbs.length; i++) {
    const c = crumbs[i]!;
    const { key, centerFt } = altitudeBucket(c.altMsl);
    if (!current || current.key !== key) {
      const color = altitudeToColor(centerFt);
      const prev = i > 0 ? crumbs[i - 1]! : null;
      current = { key, color, points: prev ? [[prev.lat, prev.lon]] : [] };
      segments.push(current);
    }
    current.points.push([c.lat, c.lon]);
  }

  return (
    <Pane name={PANE_NAME} style={{ zIndex: 410 }}>
      {segments.map((seg, idx) => (
        <Polyline
          key={idx}
          positions={seg.points}
          pathOptions={{ color: seg.color, weight: 3 }}
        />
      ))}
    </Pane>
  );
}
