import { useEffect, useRef } from 'react';
import { LatLngBounds, latLng } from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';
import { useViewStore } from '../../store/view.js';

export function MapController() {
  const map = useMap();
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  const setLastView = useViewStore((s) => s.setLastView);
  const telemetry = useFlightStore((s) => s.state.telemetry);
  const plan = useFlightStore((s) => s.state.plan);
  const hasOverviewFitted = useRef(false);
  const programmatic = useRef(false);

  useMapEvents({
    dragstart: () => {
      if (programmatic.current) return;
      if (mode !== 'manual') setMode('manual');
    },
    moveend: () => {
      // Fires after both pan and zoom finish (zoom is a kind of move). We
      // persist on every moveend, including programmatic ones — any stale
      // programmatic position gets overwritten the moment the user acts or
      // telemetry advances after the next reload.
      const c = map.getCenter();
      setLastView([c.lat, c.lng], map.getZoom());
    },
  });

  // Fit to origin+destination on plan load or explicit overview.
  useEffect(() => {
    if (mode !== 'overview' || !plan) return;
    const bounds = new LatLngBounds(
      latLng(plan.origin.lat, plan.origin.lon),
      latLng(plan.destination.lat, plan.destination.lon),
    );
    programmatic.current = true;
    map.fitBounds(bounds, { padding: [40, 40] });
    programmatic.current = false;
    hasOverviewFitted.current = true;
  }, [mode, plan, map]);

  // Center on aircraft in follow mode.
  useEffect(() => {
    if (mode !== 'follow' || !telemetry) return;
    programmatic.current = true;
    map.panTo([telemetry.position.lat, telemetry.position.lon], { animate: true });
    programmatic.current = false;
  }, [mode, telemetry, map]);

  return null;
}
