import { useState } from "react";
import {
  Card,
  Separator,
  Surface,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@heroui/react";
import { ChevronDown } from "@gravity-ui/icons";
import { useFlightStore } from "../../store/flight.js";
import { dash, fmtNum } from "./fmt.js";
import { Row } from "./Row.js";

function OnGroundIndicator({ onGround }: { onGround: boolean | undefined }) {
  const isOnGround = onGround === true;
  const label = isOnGround ? "On ground" : "Airborne";
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="inline-flex" aria-label={label}>
          <svg
            viewBox="0 0 16 16"
            width={14}
            height={14}
            style={{
              color: isOnGround ? "#16a34a" : "var(--ff-fg-muted)",
              opacity: isOnGround ? 1 : 0.5,
            }}
            aria-hidden
          >
            {/* Y-shaped strut: nose wheel down to centre, then splays to mains */}
            <path
              d="M 8 4 L 8 8 M 3.5 11.5 L 8 8 L 12.5 11.5"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              fill="none"
            />
            {/* Three wheels: nose (top), main left, main right */}
            <circle cx="8" cy="3" r="1.25" fill="currentColor" />
            <circle cx="3" cy="12.5" r="1.25" fill="currentColor" />
            <circle cx="13" cy="12.5" r="1.25" fill="currentColor" />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MotionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const [iasOpen, setIasOpen] = useState(false);

  return (
    <Card variant="default">
      <Card.Header className="flex flex-row items-center justify-between">
        <Card.Title>Motion</Card.Title>
        <OnGroundIndicator onGround={t?.onGround} />
      </Card.Header>
      <Card.Content>
        {/* GS row doubles as the disclosure trigger for IAS / Mach below.
            Chevron rotates: collapsed = right (-90°), expanded = down (0°). */}
        <button
          type="button"
          onClick={() => setIasOpen((v) => !v)}
          aria-expanded={iasOpen}
          aria-controls="motion-ias-mach"
          className="ff-row flex justify-between items-center text-sm w-full bg-transparent border-0 p-0 text-left cursor-pointer"
        >
          <span style={{ color: "var(--ff-fg-muted)" }}>GS</span>
          <span
            className="inline-flex items-center gap-1.5"
            style={{ fontVariantNumeric: "tabular-nums", color: "var(--ff-fg)" }}
          >
            {t ? `${fmtNum(t.speed.ground, 0)} kt` : dash}
            <ChevronDown
              width={14}
              height={14}
              style={{
                color: "var(--ff-fg-muted)",
                transform: iasOpen ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 120ms ease",
              }}
            />
          </span>
        </button>

        {iasOpen && (
          <Surface
            id="motion-ias-mach"
            variant="secondary"
            className="rounded-lg py-1 px-2 ml-[-8px] mr-[-8px] text-xs"
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--ff-fg-muted)" }}>IAS</span>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ff-fg)",
                }}
              >
                {t ? `${fmtNum(t.speed.indicated, 0)} kt` : dash}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--ff-fg-muted)" }}>Mach</span>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ff-fg)",
                }}
              >
                {t ? fmtNum(t.speed.mach, 2) : dash}
              </span>
            </div>
          </Surface>
        )}

        <Separator className="my-3" />

        <Row label="Alt">
          {t ? (
            <span className="inline-flex items-center gap-2">
              <span>{fmtNum(t.altitude.msl, 0)} ft</span>
              <span className="minor">
                {t.verticalSpeed > 0 ? "↑" : t.verticalSpeed < 0 ? "↓" : ""}
                {fmtNum(Math.abs(t.verticalSpeed), 0)} fpm
              </span>
            </span>
          ) : (
            dash
          )}
        </Row>
      </Card.Content>
    </Card>
  );
}
