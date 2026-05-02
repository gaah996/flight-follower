import { Pane, Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { altitudeToColor } from '../../lib/altitudePalette.js';

// Bucket altitude in 2000-ft steps so consecutive samples in the same band
// share a single multi-point polyline. Each polyline benefits from Leaflet's
// internal smoothing (no kinks at sample joints), and the 2000-ft step keeps
// color transitions small enough that the bucketed gradient still reads as
// continuous. Typical flight: ~30-40 polylines.
const BUCKET_FT = 2000;

// Lives in its own pane at z=410, just above the cruise-points pane (405)
// so the actual flight trail draws over the planned-vs-actual markers, but
// below the aircraft (markerPane = 600).
const PANE_NAME = 'ff-breadcrumb';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;

  const segments: Array<{ bucket: number; color: string; points: [number, number][] }> = [];
  let current: { bucket: number; color: string; points: [number, number][] } | null = null;
  for (let i = 0; i < crumbs.length; i++) {
    const c = crumbs[i]!;
    const bucket = Math.floor(c.altMsl / BUCKET_FT);
    if (!current || current.bucket !== bucket) {
      // Color the bucket from the altitude at its centre so adjacent buckets
      // differ by one BUCKET_FT step in the interpolation domain — a small,
      // even visual gradation.
      const color = altitudeToColor((bucket + 0.5) * BUCKET_FT);
      const prev = i > 0 ? crumbs[i - 1]! : null;
      current = { bucket, color, points: prev ? [[prev.lat, prev.lon]] : [] };
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
