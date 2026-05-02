import type { FlightPlan, FlightProgress } from '@ff/shared';

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
      className="relative w-full h-2 my-2 rounded-full overflow-visible"
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

      {/* TOC: vertical dashed line crossing the bar. Extends slightly above
          and below so it reads clearly against the filled / unfilled regions. */}
      {tocPct != null && (
        <div
          className="absolute"
          style={{
            left: `${tocPct * 100}%`,
            top: '-3px',
            bottom: '-3px',
            width: 0,
            borderLeft: '1px dashed var(--ff-fg)',
          }}
          title="Top of climb"
        />
      )}

      {/* TOD: same treatment as TOC. */}
      {todPct != null && (
        <div
          className="absolute"
          style={{
            left: `${todPct * 100}%`,
            top: '-3px',
            bottom: '-3px',
            width: 0,
            borderLeft: '1px dashed var(--ff-fg)',
          }}
          title="Top of descent"
        />
      )}

      {/* Aircraft tick (hollow ring, accent color). Stays on top. */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
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
