import type { LatLngExpression, Map } from 'leaflet';
import { latLng, point } from 'leaflet';

// Width of the side panel overlay. When visible, it occludes the right
// PANEL_WIDTH px of the map; centering / fit operations need to compensate
// so important content lands inside the visible (left) region rather than
// behind the panel.
export const PANEL_WIDTH = 360;

// Returns a map-center latLng such that, when `target` is the point the
// caller actually wants visible-centered (aircraft, waypoint, etc.), it
// lands at the centre of the visible region instead of dead-centre on the
// underlying map. When the panel is hidden, target is returned unchanged.
export function panelAwareCenter(
  map: Map,
  target: { lat: number; lon: number },
  panelVisible: boolean,
): LatLngExpression {
  const ll = latLng(target.lat, target.lon);
  if (!panelVisible) return ll;
  const px = map.latLngToContainerPoint(ll).add(point(PANEL_WIDTH / 2, 0));
  return map.containerPointToLatLng(px);
}
