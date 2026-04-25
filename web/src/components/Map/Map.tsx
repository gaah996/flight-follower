import { MapContainer, TileLayer } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';
import { MapController } from './MapController.js';
import { PlannedRoute } from './PlannedRoute.js';
import { ViewModeControl } from './ViewModeControl.js';
import { useViewStore } from '../../store/view.js';

const DEFAULT_CENTER: [number, number] = [40, 0];
const DEFAULT_ZOOM = 4;

export function Map() {
  // Read once at mount via getState() so MapContainer doesn't re-mount when
  // lastCenter/lastZoom change later. Subsequent updates flow through the
  // imperative Leaflet API in MapController.
  const { lastCenter, lastZoom } = useViewStore.getState();
  const center = lastCenter ?? DEFAULT_CENTER;
  const zoom = lastZoom ?? DEFAULT_ZOOM;
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} worldCopyJump>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PlannedRoute />
        <BreadcrumbTrail />
        <AircraftMarker />
        <MapController />
      </MapContainer>
      <ViewModeControl />
    </div>
  );
}
