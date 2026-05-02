import type { FlightPlan, FlightProgress } from '@ff/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';

const EARTH_RADIUS_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

type Props = {
  plan: FlightPlan;
  progress: FlightProgress;
};

// Visible line + hit-area is 16 px tall (matches the bar's 10 px outer plus
// the 3 px overhang on each side). Hardcoded because the height: 100%
// chain doesn't survive HeroUI's Tooltip wrapping.
const TICK_HEIGHT = 16;
const TICK_WIDTH = 8;

function CruiseTick({ pct, label }: { pct: number; label: string }) {
  // Absolute positioning lives on the OUTER wrapper so the Tooltip trigger's
  // bounding rect lands at the marker's location. If we put position:absolute
  // on the trigger itself, HeroUI's overlay resolution falls back to the
  // parent (the bar) and the tooltip pops up at the bar's start.
  return (
    <div
      className="absolute"
      style={{
        left: `${pct * 100}%`,
        // Bar is 10 px tall (h-2.5 + 1 px border each side); 16 px tick
        // centred = 3 px overhang on each side. Use a fixed pixel offset
        // instead of top:50% + translateY because HeroUI's Tooltip wrapping
        // breaks the percentage / transform chain.
        top: -3,
        transform: 'translateX(-50%)',
        width: TICK_WIDTH,
        height: TICK_HEIGHT,
      }}
    >
      <Tooltip>
        <TooltipTrigger>
          <div
            aria-label={label}
            style={{
              width: TICK_WIDTH,
              height: TICK_HEIGHT,
              position: 'relative',
              cursor: 'default',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: TICK_WIDTH / 2,
                top: 0,
                bottom: 0,
                width: 0,
                borderLeft: '1px dashed var(--ff-fg)',
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ProgressBar({ plan, progress }: Props) {
  const totalNm =
    plan.totalDistanceNm ??
    haversineNm(plan.origin.lat, plan.origin.lon, plan.destination.lat, plan.destination.lon);
  if (totalNm <= 0) return null;

  const aircraftPct =
    progress.distanceToDestNm == null
      ? 0
      : Math.max(0, Math.min(1, 1 - progress.distanceToDestNm / totalNm));

  const tocPct =
    progress.tocPosition == null
      ? null
      : Math.max(
          0,
          Math.min(
            1,
            haversineNm(
              plan.origin.lat,
              plan.origin.lon,
              progress.tocPosition.lat,
              progress.tocPosition.lon,
            ) / totalNm,
          ),
        );

  const todPct =
    progress.todPosition == null
      ? null
      : Math.max(
          0,
          Math.min(
            1,
            haversineNm(
              plan.origin.lat,
              plan.origin.lon,
              progress.todPosition.lat,
              progress.todPosition.lon,
            ) / totalNm,
          ),
        );

  return (
    <div
      className="relative w-full h-2.5 my-2 rounded-full"
      style={{
        background: 'var(--ff-bg-elevated)',
        border: '1px solid var(--ff-border)',
      }}
    >
      {/* Filled portion (origin → aircraft). Sits inside the border. */}
      <div
        className="absolute left-0 top-0 bottom-0 rounded-full"
        style={{ width: `${aircraftPct * 100}%`, background: 'var(--ff-accent)' }}
      />

      {tocPct != null && <CruiseTick pct={tocPct} label="Top of climb" />}
      {todPct != null && <CruiseTick pct={todPct} label="Top of descent" />}

      {/* Aircraft tick — same height as the bar so it sits flush, centred on
          the bar's vertical midline. Solid background masks the gradient
          fill behind the ring. */}
      <div
        className="absolute top-1/2 w-2.5 h-2.5 rounded-full"
        style={{
          left: `${aircraftPct * 100}%`,
          transform: 'translate(-50%, -50%)',
          background: 'var(--ff-bg-elevated)',
          border: '2px solid var(--ff-accent)',
        }}
      />
    </div>
  );
}
