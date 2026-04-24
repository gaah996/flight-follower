import { MapContainer, TileLayer } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';
import { MapController } from './MapController.js';
import { PlannedRoute } from './PlannedRoute.js';
import { ViewModeControl } from './ViewModeControl.js';

export function Map() {
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={[40, 0]} zoom={4} style={{ height: '100%', width: '100%' }} worldCopyJump>
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
