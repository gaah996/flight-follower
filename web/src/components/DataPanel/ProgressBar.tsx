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
      className="relative w-full h-1.5 my-2 rounded-full"
      style={{ background: 'var(--ff-bg-elevated)' }}
    >
      {/* filled portion (origin → aircraft) */}
      <div
        className="absolute left-0 top-0 h-full rounded-full"
        style={{ width: `${aircraftPct * 100}%`, background: 'var(--ff-accent)' }}
      />

      {/* origin tick (filled circle, left edge) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{ left: 0, background: 'var(--ff-fg-muted)' }}
      />

      {/* destination tick (filled circle, right edge) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
        style={{ left: '100%', transform: 'translate(-100%, -50%)', background: 'var(--ff-fg-muted)' }}
      />

      {/* TOC tick */}
      {tocPct != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
          style={{ left: `${tocPct * 100}%`, background: 'var(--ff-fg)' }}
          title="Top of climb"
        />
      )}

      {/* TOD tick */}
      {todPct != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
          style={{ left: `${todPct * 100}%`, background: 'var(--ff-fg)' }}
          title="Top of descent"
        />
      )}

      {/* aircraft tick (hollow ring, accent color) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
        style={{
          left: `${aircraftPct * 100}%`,
          transform: 'translate(-50%, -50%)',
          background: 'transparent',
          border: '2px solid var(--ff-accent)',
        }}
      />
    </div>
  );
}
