import { useEffect, useState } from 'react';
import type { Airport } from '@ff/shared';
import { Card, Chip, Separator, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { CircleFill } from '@gravity-ui/icons';
import { useFlightStore } from '../../store/flight.js';
import { dash, fmtDurationTier, fmtNum, fmtUtcTime } from './fmt.js';
import { Row } from './Row.js';
import { ProgressBar } from './ProgressBar.js';
import { indexOfServerNext, selectActiveNext } from '../../lib/activeWaypoint.js';

function airportLabel(a: Airport): string {
  return a.name ?? a.icao;
}

type EtaStatus = 'on-time' | 'slightly-late' | 'very-late';

const ETA_STATUS_COLOR: Record<EtaStatus, string> = {
  'on-time': '#16a34a',
  'slightly-late': '#f59e0b',
  'very-late': '#dc2626',
};

const ETA_STATUS_LABEL: Record<EtaStatus, string> = {
  'on-time': 'On time / early',
  'slightly-late': 'Slightly late',
  'very-late': 'Very late',
};

function etaStatus(etaMs: number, scheduledMs: number): EtaStatus {
  const lateMin = (etaMs - scheduledMs) / 60_000;
  if (lateMin <= 5) return 'on-time';
  if (lateMin <= 20) return 'slightly-late';
  return 'very-late';
}

export function TripCard() {
  const state = useFlightStore((s) => s.state);
  const manualNextIndex = useFlightStore((s) => s.manualNextIndex);
  const setManualNextIndex = useFlightStore((s) => s.setManualNextIndex);
  const { plan, progress, telemetry } = state;

  // Force a re-render every 30 s so the wall-clock fallback for ETA still
  // ticks even when no telemetry is arriving (e.g. on the menu).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!plan) {
    return (
      <Card variant="default">
        <Card.Content>
          <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see trip info.</div>
        </Card.Content>
      </Card>
    );
  }

  const now = telemetry?.simTimeUtc ?? Date.now();

  // Live ETA: derived from progress.eteToDestSec when available; otherwise
  // the scheduled STA. Label distinguishes the two so the user knows which
  // is on screen.
  const liveEtaMs =
    progress.eteToDestSec != null ? now + progress.eteToDestSec * 1000 : null;
  const etaMs = liveEtaMs ?? plan.scheduledIn ?? null;
  const etaLabel = liveEtaMs != null ? 'live' : plan.scheduledIn != null ? 'sched' : null;

  const remaining =
    progress.distanceToDestNm != null ? `${fmtNum(progress.distanceToDestNm, 0)} nm` : dash;
  const eta = etaMs != null ? `${fmtUtcTime(etaMs)}z` : dash;
  const etaStatusValue =
    liveEtaMs != null && plan.scheduledIn != null ? etaStatus(liveEtaMs, plan.scheduledIn) : null;

  // Active "next" waypoint: server-derived unless the user has stepped via
  // the arrows. The filtered list (no TOC/TOD) is what the arrows iterate;
  // the server's nextWaypoint may be a TOC/TOD ident if the cursor is
  // exactly there, but the arrows seed from the equivalent filtered position.
  const active = selectActiveNext(state, manualNextIndex);
  const filteredWps = plan.waypoints.filter((w) => w.ident !== 'TOC' && w.ident !== 'TOD');
  const activeIdent = active.waypoint?.ident;
  const filteredIdx = activeIdent ? filteredWps.findIndex((w) => w.ident === activeIdent) : -1;

  // Capture a non-null alias so the closure below keeps the narrowing.
  const planNonNull = plan;
  function step(delta: -1 | 1): void {
    // Seed from the server-derived next on first arrow click; subsequent
    // clicks walk the filtered list. Always store the unfiltered index so
    // selectActiveNext can look up by index in plan.waypoints[].
    let baseFilteredIdx: number;
    if (filteredIdx >= 0) {
      baseFilteredIdx = filteredIdx;
    } else {
      const serverIdx = indexOfServerNext(progress, planNonNull);
      // Map serverIdx (in the unfiltered list) to its filtered position by
      // subtracting the count of TOC/TOD that appear before it.
      const seen = planNonNull.waypoints.slice(0, Math.max(0, serverIdx));
      const removedBefore = seen.filter((w) => w.ident === 'TOC' || w.ident === 'TOD').length;
      baseFilteredIdx = Math.max(0, serverIdx - removedBefore);
    }
    const nextFilteredIdx = Math.max(0, Math.min(filteredWps.length - 1, baseFilteredIdx + delta));
    const targetIdent = filteredWps[nextFilteredIdx]?.ident;
    if (!targetIdent) return;
    const unfilteredIdx = planNonNull.waypoints.findIndex((w) => w.ident === targetIdent);
    if (unfilteredIdx >= 0) setManualNextIndex(unfilteredIdx);
  }

  return (
    <Card variant="default">
      <Card.Content>
        {/* Origin → Destination header (unchanged from v1.2) */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="font-mono text-lg font-semibold leading-tight">{plan.origin.icao}</div>
            <div className="text-xs text-fg-muted">{airportLabel(plan.origin)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-mono text-sm tabular-nums">{fmtUtcTime(plan.scheduledOut)}</span>
              {plan.scheduledOut != null && (
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>sched</Chip.Label>
                </Chip>
              )}
            </div>
          </div>
          <div className="text-fg-muted self-center">→</div>
          <div className="flex flex-col gap-0.5 items-end min-w-0 text-right">
            <div className="font-mono text-lg font-semibold leading-tight">{plan.destination.icao}</div>
            <div className="text-xs text-fg-muted">{airportLabel(plan.destination)}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-mono text-sm tabular-nums">{fmtUtcTime(plan.scheduledIn)}</span>
              {plan.scheduledIn != null && (
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>sched</Chip.Label>
                </Chip>
              )}
            </div>
          </div>
        </div>

        {/* Origin → destination progress timeline */}
        <ProgressBar plan={plan} progress={progress} />

        <Separator className="my-3" />

        <Row label="Remaining">{remaining}</Row>
        <Row label="ETE" tooltip="Estimated time enroute (until destination)">
          {fmtDurationTier(progress.eteToDestSec)}
        </Row>
        <Row label="ETA" tooltip="Estimated time of arrival (UTC)">
          <span className="inline-flex items-center gap-1.5">
            {eta}
            {etaLabel && (
              <Chip size="sm" variant="soft" color={etaLabel === 'live' ? 'accent' : 'default'}>
                <Chip.Label>{etaLabel}</Chip.Label>
              </Chip>
            )}
            {etaStatusValue && (
              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex" aria-label={ETA_STATUS_LABEL[etaStatusValue]}>
                    <CircleFill width={8} height={8} style={{ color: ETA_STATUS_COLOR[etaStatusValue] }} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{ETA_STATUS_LABEL[etaStatusValue]}</TooltipContent>
              </Tooltip>
            )}
          </span>
        </Row>

        {(active.waypoint || progress.nextWaypoint) && (
          <>
            <Separator className="my-3" />
            <div
              className="flex items-center gap-1.5"
              style={{ fontSize: 12, color: 'var(--ff-fg-muted)', fontFamily: 'ui-monospace, monospace' }}
            >
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous waypoint"
                className="px-1 cursor-pointer bg-transparent border-0 text-current"
              >
                ◀
              </button>
              <span>
                Next: {active.waypoint?.ident ?? progress.nextWaypoint?.ident}
                {(active.distanceNm ?? progress.distanceToNextNm) != null && (
                  <> · {fmtNum(active.distanceNm ?? progress.distanceToNextNm!, 1)} nm</>
                )}
                {(active.eteSec ?? progress.eteToNextSec) != null && (
                  <> · {fmtDurationTier(active.eteSec ?? progress.eteToNextSec)}</>
                )}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next waypoint"
                className="px-1 cursor-pointer bg-transparent border-0 text-current"
              >
                ▶
              </button>
              {active.isManual && (
                <button
                  type="button"
                  onClick={() => setManualNextIndex(null)}
                  className="px-1 cursor-pointer bg-transparent border-0 underline"
                  style={{ color: 'var(--ff-accent)' }}
                >
                  auto
                </button>
              )}
            </div>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
