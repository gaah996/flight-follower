import { divIcon } from 'leaflet';
import { Marker, Pane, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

// 45° arrows in a small white-filled circle. Sized to match the waypoint
// markers (~12 px) so they read as part of the same family. The pane below
// places them under the breadcrumb (overlayPane z-index = 400) so the trail
// stays the dominant overlay.
const STROKE = '#334155';

const TOC_GLYPH = `
  <svg viewBox="0 0 14 14" width="14" height="14" style="display:block;">
    <circle cx="7" cy="7" r="6" fill="#fff" stroke="${STROKE}" stroke-width="1"/>
    <path d="M5 9 L9 5" stroke="${STROKE}" stroke-width="1" stroke-linecap="round" fill="none"/>
    <path d="M7 5 L9 5 L9 7" stroke="${STROKE}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>
`;

const TOD_GLYPH = `
  <svg viewBox="0 0 14 14" width="14" height="14" style="display:block;">
    <circle cx="7" cy="7" r="6" fill="#fff" stroke="${STROKE}" stroke-width="1"/>
    <path d="M5 5 L9 9" stroke="${STROKE}" stroke-width="1" stroke-linecap="round" fill="none"/>
    <path d="M7 9 L9 9 L9 7" stroke="${STROKE}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>
`;

function makeIcon(label: 'TOC' | 'TOD'): ReturnType<typeof divIcon> {
  return divIcon({
    className: 'ff-cruise-point',
    html: label === 'TOC' ? TOC_GLYPH : TOD_GLYPH,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function CruisePoints() {
  const toc = useFlightStore((s) => s.state.progress.tocPosition);
  const tod = useFlightStore((s) => s.state.progress.todPosition);

  return (
    // Custom pane with z-index 350, sandwiched between tilePane (200) and
    // overlayPane (400 — polylines incl. breadcrumb). Tooltip pane (650)
    // still sits on top so the hover label remains legible.
    <Pane name="ff-cruise-points" style={{ zIndex: 350 }}>
      {toc && (
        <Marker
          position={[toc.lat, toc.lon]}
          icon={makeIcon('TOC')}
          pane="ff-cruise-points"
          interactive
        >
          <Tooltip direction="top" offset={[0, -8]}>Top of climb</Tooltip>
        </Marker>
      )}
      {tod && (
        <Marker
          position={[tod.lat, tod.lon]}
          icon={makeIcon('TOD')}
          pane="ff-cruise-points"
          interactive
        >
          <Tooltip direction="top" offset={[0, -8]}>Top of descent</Tooltip>
        </Marker>
      )}
    </Pane>
  );
}
