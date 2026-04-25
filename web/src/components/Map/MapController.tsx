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
  const fitOverviewRequest = useViewStore((s) => s.fitOverviewRequest);
  const telemetry = useFlightStore((s) => s.state.telemetry);
  const plan = useFlightStore((s) => s.state.plan);
  // If sessionStorage has a saved view, we're rehydrating from a reload — skip
  // the first auto-fit so the user's last view wins. Subsequent clicks on
  // Overview still refit (handled by the prevMode effect below).
  const hasOverviewFitted = useRef(useViewStore.getState().lastCenter !== null);
  const prevMode = useRef(mode);
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

  // When the user transitions INTO overview (via the toggle), allow one refit.
  // Declared before the fit effect so the reset takes effect first on the
  // same render that the fit effect would otherwise read the old value.
  useEffect(() => {
    if (mode === 'overview' && prevMode.current !== 'overview') {
      hasOverviewFitted.current = false;
    }
    prevMode.current = mode;
  }, [mode]);

  // Resetting via an explicit request token covers the "user is already in
  // Overview when a fresh plan arrives" case, which mode-transition alone
  // doesn't catch.
  useEffect(() => {
    if (fitOverviewRequest > 0) {
      hasOverviewFitted.current = false;
    }
  }, [fitOverviewRequest]);

  // Fit to origin+destination on plan load or explicit overview, but only
  // once per "request to fit" — the guard prevents overriding a persisted or
  // user-positioned view every time the plan re-arrives via WS.
  useEffect(() => {
    if (mode !== 'overview' || !plan) return;
    if (hasOverviewFitted.current) return;
    const bounds = new LatLngBounds(
      latLng(plan.origin.lat, plan.origin.lon),
      latLng(plan.destination.lat, plan.destination.lon),
    );
    programmatic.current = true;
    map.fitBounds(bounds, { padding: [40, 40] });
    programmatic.current = false;
    hasOverviewFitted.current = true;
  }, [mode, plan, map, fitOverviewRequest]);

  // Center on aircraft in follow mode.
  useEffect(() => {
    if (mode !== 'follow' || !telemetry) return;
    programmatic.current = true;
    map.panTo([telemetry.position.lat, telemetry.position.lon], { animate: true });
    programmatic.current = false;
  }, [mode, telemetry, map]);

  return null;
}
