import { divIcon } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

const TOC_GLYPH = `
  <svg viewBox="0 0 16 16" width="16" height="16" style="display:block;">
    <path d="M2 12 L8 4 L14 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="8" cy="4" r="1.5" fill="currentColor"/>
  </svg>
`;

const TOD_GLYPH = `
  <svg viewBox="0 0 16 16" width="16" height="16" style="display:block;">
    <path d="M2 4 L8 12 L14 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
  </svg>
`;

function makeIcon(label: 'TOC' | 'TOD'): ReturnType<typeof divIcon> {
  return divIcon({
    className: 'ff-cruise-point',
    html: `<div style="color:var(--ff-fg-muted);">${label === 'TOC' ? TOC_GLYPH : TOD_GLYPH}</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function CruisePoints() {
  const toc = useFlightStore((s) => s.state.progress.tocPosition);
  const tod = useFlightStore((s) => s.state.progress.todPosition);

  return (
    <>
      {toc && (
        <Marker position={[toc.lat, toc.lon]} icon={makeIcon('TOC')} interactive>
          <Tooltip direction="top" offset={[0, -10]}>Top of climb</Tooltip>
        </Marker>
      )}
      {tod && (
        <Marker position={[tod.lat, tod.lon]} icon={makeIcon('TOD')} interactive>
          <Tooltip direction="top" offset={[0, -10]}>Top of descent</Tooltip>
        </Marker>
      )}
    </>
  );
}
