import { divIcon } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

// 45° arrows in a circle. White fill matches the waypoint marker style; the
// dark stroke reads against both light and dark map tiles. Slate-700 keeps
// the markers neutral so they don't compete with origin (teal), destination
// (rose), alternate (blue), or waypoints (purple).
const STROKE = '#334155';

const TOC_GLYPH = `
  <svg viewBox="0 0 20 20" width="20" height="20" style="display:block;">
    <circle cx="10" cy="10" r="8" fill="#fff" stroke="${STROKE}" stroke-width="1.5"/>
    <path d="M6.5 13.5 L13.5 6.5" stroke="${STROKE}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M9.5 6.5 L13.5 6.5 L13.5 10.5" stroke="${STROKE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>
`;

const TOD_GLYPH = `
  <svg viewBox="0 0 20 20" width="20" height="20" style="display:block;">
    <circle cx="10" cy="10" r="8" fill="#fff" stroke="${STROKE}" stroke-width="1.5"/>
    <path d="M6.5 6.5 L13.5 13.5" stroke="${STROKE}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <path d="M9.5 13.5 L13.5 13.5 L13.5 9.5" stroke="${STROKE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>
`;

function makeIcon(label: 'TOC' | 'TOD'): ReturnType<typeof divIcon> {
  return divIcon({
    className: 'ff-cruise-point',
    html: label === 'TOC' ? TOC_GLYPH : TOD_GLYPH,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export function CruisePoints() {
  const toc = useFlightStore((s) => s.state.progress.tocPosition);
  const tod = useFlightStore((s) => s.state.progress.todPosition);

  return (
    <>
      {toc && (
        <Marker position={[toc.lat, toc.lon]} icon={makeIcon('TOC')} interactive>
          <Tooltip direction="top" offset={[0, -12]}>Top of climb</Tooltip>
        </Marker>
      )}
      {tod && (
        <Marker position={[tod.lat, tod.lon]} icon={makeIcon('TOD')} interactive>
          <Tooltip direction="top" offset={[0, -12]}>Top of descent</Tooltip>
        </Marker>
      )}
    </>
  );
}
