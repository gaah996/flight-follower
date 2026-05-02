import { useState } from 'react';
import type { FlightPlan } from '@ff/shared';
import {
  Card,
  Chip,
  Surface,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtDurationTier, fmtUtcTime } from './fmt.js';
import { Row } from './Row.js';

// Great-circle distance in nautical miles. Inlined here because the glyph is
// the only web-side caller; promote to a util if a second one shows up.
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Header glyph: actual altitude profile from the plan, plotted against
// cumulative great-circle distance. Step climbs and shallow climb/descent
// gradients show up naturally. Falls back to a generic trapezoid when the
// plan has no per-waypoint altitudes to work with.
function AltitudeProfileGlyph({ plan }: { plan: FlightPlan }) {
  const W = 36;
  const H = 14;
  const PAD = 1;

  // Origin and destination contribute (0nm, 0ft) and (totalNm, 0ft) anchors;
  // intermediate waypoints contribute their plannedAltitude when present.
  const route: Array<{ lat: number; lon: number; alt?: number }> = [
    { lat: plan.origin.lat, lon: plan.origin.lon, alt: 0 },
    ...plan.waypoints.map((w) => ({ lat: w.lat, lon: w.lon, alt: w.plannedAltitude })),
    { lat: plan.destination.lat, lon: plan.destination.lon, alt: 0 },
  ];

  let cum = 0;
  let prev: { lat: number; lon: number } | null = null;
  const profile: Array<[number, number]> = [];
  for (const point of route) {
    if (prev) {
      cum += haversineNm(prev.lat, prev.lon, point.lat, point.lon);
    }
    if (point.alt != null) profile.push([cum, point.alt]);
    prev = point;
  }

  const last = profile.at(-1);
  const maxDist = last ? last[0] : 0;
  const maxAlt = profile.reduce((m, [, a]) => Math.max(m, a), 0);

  let polylinePoints: string;
  if (profile.length >= 2 && maxDist > 0 && maxAlt > 0) {
    const sx = (d: number) => PAD + (d / maxDist) * (W - 2 * PAD);
    const sy = (a: number) => H - PAD - (a / maxAlt) * (H - 2 * PAD);
    polylinePoints = profile.map(([d, a]) => `${sx(d).toFixed(1)},${sy(a).toFixed(1)}`).join(' ');
  } else {
    polylinePoints = `${PAD},${H - PAD} 6,3 ${W - 6},3 ${W - PAD},${H - PAD}`;
  }

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      style={{ color: 'var(--ff-fg-muted)' }}
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function fmtFL(ft: number | undefined): string {
  if (ft == null) return dash;
  // Floor to the nearest 1000 ft so Simbrief's metric-converted altitudes
  // (e.g. 38500 for an FL380 plan) render as FL380 rather than FL385/FL390.
  return 'FL' + (Math.floor(ft / 1000) * 10).toString().padStart(3, '0');
}

export function FlightPlanCard() {
  const plan = useFlightStore((s) => s.state.plan);
  const [expanded, setExpanded] = useState(false);

  if (!plan) {
    return (
      <Card variant="default">
        <Card.Header>
          <Card.Title>Flight plan</Card.Title>
        </Card.Header>
        <Card.Content>
          <div style={{ color: 'var(--ff-fg-muted)' }}>
            Import a plan to see flight plan details.
          </div>
        </Card.Content>
      </Card>
    );
  }

  const callsign = plan.flightNumber
    ? plan.aircraftType
      ? `${plan.flightNumber} · ${plan.aircraftType}`
      : plan.flightNumber
    : plan.aircraftType ?? dash;

  // Block time comes directly from Simbrief (plan.blockTimeSec — est_block
  // preferred, sched_block fallback). Falls back to STA-derivation only if
  // the OFP didn't include either, for back-compat with older fixtures.
  const blockTimeSec =
    plan.blockTimeSec ??
    (plan.scheduledOut != null && plan.scheduledIn != null
      ? Math.max(0, Math.floor((plan.scheduledIn - plan.scheduledOut) / 1000))
      : null);

  return (
    <Card variant="default">
      <Card.Header>
        <div className="flex items-center justify-between">
          <Card.Title>Flight plan</Card.Title>
          <AltitudeProfileGlyph plan={plan} />
        </div>
        <div className="flex items-center gap-2">
          <Card.Description>{callsign}</Card.Description>
          {plan.alternate && (
            <Tooltip>
              <TooltipTrigger>
                <span
                  className="inline-flex"
                  aria-label={`Alternate: ${plan.alternate.name ?? plan.alternate.icao}`}
                >
                  <Chip size="sm" variant="soft" color="default">
                    <Chip.Label>alt {plan.alternate.icao}</Chip.Label>
                  </Chip>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {plan.alternate.name ?? `Alternate: ${plan.alternate.icao}`}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </Card.Header>
      <Card.Content>
        <Row label="Cruise">{fmtFL(plan.cruiseAltitudeFt)}</Row>
        <Row label="Distance">{plan.totalDistanceNm != null ? `${plan.totalDistanceNm} nm` : dash}</Row>
        <Row label="Dep">{plan.scheduledOut != null ? `${fmtUtcTime(plan.scheduledOut)}z` : dash}</Row>
        <Row label="Arr">{plan.scheduledIn != null ? `${fmtUtcTime(plan.scheduledIn)}z` : dash}</Row>
        <Row label="Block" tooltip="Total scheduled flight time (dep → arr)">
          {fmtDurationTier(blockTimeSec)}
        </Row>
      </Card.Content>
      {plan.routeString && (
        <Card.Footer>
          <Surface
            variant="secondary"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Click to collapse' : 'Click to expand'}
            className={`rounded-lg py-1 px-2 ml-[-8px] mr-[-8px] text-xs cursor-pointer ${
              expanded ? '' : 'line-clamp-2 max-h-[2.5rem] overflow-hidden'
            }`}
            style={{
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--ff-fg-muted)',
              // Wrap at whitespace only; never break a fix name in the middle
              // (e.g. RUDAP must never render as RUD-AP). The route string is
              // already space-delimited, so this just lets the browser pick
              // line breaks at the existing spaces.
              wordBreak: 'keep-all',
              overflowWrap: 'normal',
              whiteSpace: 'normal',
            }}
          >
            {plan.routeString}
          </Surface>
        </Card.Footer>
      )}
    </Card>
  );
}
