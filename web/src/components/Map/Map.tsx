import { MapContainer, TileLayer } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';
import { CenterButton } from './CenterButton.js';
import { MapController } from './MapController.js';
import { PlannedRoute } from './PlannedRoute.js';
import { ViewModeControl } from './ViewModeControl.js';
import { useViewStore } from '../../store/view.js';
import { useThemeStore } from '../../store/theme.js';

const DEFAULT_CENTER: [number, number] = [40, 0];
const DEFAULT_ZOOM = 4;

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
} as const;

const ATTRIBUTION =
  '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function Map() {
  const { lastCenter, lastZoom } = useViewStore.getState();
  const center = lastCenter ?? DEFAULT_CENTER;
  const zoom = lastZoom ?? DEFAULT_ZOOM;
  const theme = useThemeStore((s) => s.theme);
  const tileUrl = TILE_URLS[theme];
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} worldCopyJump>
        <TileLayer key={tileUrl} attribution={ATTRIBUTION} url={tileUrl} />
        <PlannedRoute />
        <BreadcrumbTrail />
        <AircraftMarker />
        <MapController />
        <CenterButton />
      </MapContainer>
      <ViewModeControl />
    </div>
  );
}
