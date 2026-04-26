import { useEffect, useState } from "react";
import {
  Card,
  Chip,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@heroui/react";
import { Moon, Sun } from "@gravity-ui/icons";
import { useFlightStore } from "../../store/flight.js";
import { dash, fmtDurationTier, fmtUtcTimeTier } from "./fmt.js";
import { Row } from "./Row.js";

// Solar elevation approximation — good enough for a day/night glyph at the
// aircraft's current sub-point. Returns true when the sun is above the
// horizon there.
function isDaylight(lat: number, lon: number, utcMs: number): boolean {
  const d = new Date(utcMs);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - yearStart) / 86_400_000);
  const declRad =
    ((-23.45 * Math.PI) / 180) *
    Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHour =
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const solarHour = utcHour + lon / 15;
  const hourAngleRad = ((solarHour - 12) * 15 * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const sinAlpha =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
  return sinAlpha > 0;
}

function DayNightGlyph({
  lat,
  lon,
  utcMs,
}: {
  lat: number;
  lon: number;
  utcMs: number;
}) {
  const day = isDaylight(lat, lon, utcMs);
  const label = day
    ? "Daylight at aircraft position"
    : "Night at aircraft position";
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="inline-flex" aria-label={label}>
          {day ? (
            <Sun width={14} height={14} style={{ color: "#f59e0b" }} />
          ) : (
            <Moon
              width={14}
              height={14}
              style={{ color: "var(--ff-fg-muted)" }}
            />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type Phase = { label: "TOC" | "TOD"; tooltip: string; sec: number | null };

// Climb phase → time-to-TOC from current VS. Cruise phase → time-to-TOD via
// the 3:1 descent rule. Descent phase → TOD label with no countdown (it's
// already in the past). Returns null when there's not enough data.
function computePhase(
  altMsl: number | undefined,
  vs: number | undefined,
  gsKt: number | undefined,
  cruiseAlt: number | undefined,
  distToDestNm: number | null
): Phase | null {
  if (altMsl == null || cruiseAlt == null) return null;
  const TOL = 500;

  if (altMsl < cruiseAlt - TOL && vs != null && vs > 100) {
    const sec = ((cruiseAlt - altMsl) / vs) * 60;
    return {
      label: "TOC",
      tooltip: "Top of climb",
      sec: sec > 0 && sec < 14_400 ? sec : null,
    };
  }

  if (Math.abs(altMsl - cruiseAlt) < TOL) {
    if (distToDestNm != null && gsKt != null && gsKt >= 30) {
      const todDistFromDest = (cruiseAlt / 1000) * 3;
      const todDistFromHere = distToDestNm - todDistFromDest;
      if (todDistFromHere > 0) {
        return {
          label: "TOD",
          tooltip: "Top of descent",
          sec: (todDistFromHere / gsKt) * 3600,
        };
      }
    }
    return { label: "TOD", tooltip: "Top of descent", sec: null };
  }

  if (altMsl < cruiseAlt - TOL && vs != null && vs < -100) {
    return { label: "TOD", tooltip: "Top of descent (passed)", sec: null };
  }

  return null;
}

export function ClockCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const ft = useFlightStore((s) => s.state.progress.flightTimeSec);
  const distToDest = useFlightStore((s) => s.state.progress.distanceToDestNm);
  const plan = useFlightStore((s) => s.state.plan);

  // 1 s tick so the wall-clock seconds animate even when no telemetry is
  // arriving (e.g. on the menu / pre-connect).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const usingSimTime = t?.simTimeUtc != null;
  const now = t?.simTimeUtc ?? Date.now();

  // Reference point for daylight: aircraft if connected, else plan origin so
  // the glyph stays useful before takeoff.
  const dnLat = t?.position.lat ?? plan?.origin.lat;
  const dnLon = t?.position.lon ?? plan?.origin.lon;

  const phase = computePhase(
    t?.altitude.msl,
    t?.verticalSpeed,
    t?.speed.ground,
    plan?.cruiseAltitudeFt,
    distToDest
  );

  return (
    <Card variant="default">
      <Card.Header className="flex flex-row items-center justify-between">
        <Card.Title>Clock</Card.Title>
        {dnLat != null && dnLon != null && (
          <DayNightGlyph lat={dnLat} lon={dnLon} utcMs={now} />
        )}
      </Card.Header>
      <Card.Content>
        <Row label="UTC now">
          <span className="inline-flex items-center gap-1.5">
            <span>
              {fmtUtcTimeTier(now)}
              <span className="minor">z</span>
            </span>
            {usingSimTime && (
              <Chip size="sm" variant="soft" color="accent">
                <Chip.Label>sim</Chip.Label>
              </Chip>
            )}
          </span>
        </Row>
        <Separator className="my-3" />
        <Row
          label={phase?.label ?? "TOC"}
          tooltip={phase?.tooltip ?? "Top of climb"}
        >
          {phase?.sec != null ? fmtDurationTier(phase.sec) : dash}
        </Row>
        <Row label="Elapsed" tooltip="Flight time since takeoff">
          {fmtDurationTier(ft)}
        </Row>
      </Card.Content>
    </Card>
  );
}
