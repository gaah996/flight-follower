import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useViewStore, type ViewMode } from "../../store/view.js";

const MODES: ViewMode[] = ["overview", "follow", "manual"];

export function ViewModeControl() {
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  return (
    <div style={{ position: "absolute", top: 12, right: 48, zIndex: 1000 }}>
      <ToggleButtonGroup
        size="sm"
        selectedKeys={new Set([mode])}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys as Set<string>)[0];
          if (selected) setMode(selected as ViewMode);
        }}
        className="bg-default rounded-full"
      >
        {MODES.map((m) => (
          <ToggleButton key={m} id={m} className="capitalize">
            {m}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
