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

function CruiseTick({ pct, label }: { pct: number; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger>
        {/* 8 px transparent hit-area centred on the tick so hover/click is
            forgiving even though the visible line is only 1 px wide. */}
        <div
          className="absolute"
          style={{
            left: `${pct * 100}%`,
            top: '-3px',
            bottom: '-3px',
            width: 8,
            transform: 'translateX(-50%)',
          }}
        >
          <div
            style={{
              height: '100%',
              marginLeft: 'calc(50% - 0.5px)',
              borderLeft: '1px dashed var(--ff-fg)',
            }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
