import { MapContainer, TileLayer } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';

export function Map() {
  return (
    <MapContainer
      center={[40, 0]}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BreadcrumbTrail />
      <AircraftMarker />
    </MapContainer>
  );
}
