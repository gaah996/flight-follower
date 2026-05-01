import { Polyline } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { altitudeToColor } from '../../lib/altitudePalette.js';

export function BreadcrumbTrail() {
  const crumbs = useFlightStore((s) => s.state.breadcrumb);
  if (crumbs.length < 2) return null;

  // One polyline per pair of consecutive samples so the color fades smoothly
  // along the trail. Segment color comes from the average altitude of the
  // pair, interpolated against the palette stops. Breadcrumbs are emitted at
  // most every 5 s (or on heading change), so a 90-min flight produces a few
  // hundred segments — fine for Leaflet's SVG renderer.
  return (
    <>
      {crumbs.slice(1).map((c, i) => {
        const prev = crumbs[i]!;
        const avgAlt = (prev.altMsl + c.altMsl) / 2;
        return (
          <Polyline
            key={i}
            positions={[
              [prev.lat, prev.lon],
              [c.lat, c.lon],
            ]}
            pathOptions={{ color: altitudeToColor(avgAlt), weight: 3 }}
          />
        );
      })}
    </>
  );
}
