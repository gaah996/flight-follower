import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useViewStore, type ViewMode } from "../../store/view.js";

const MODES: ViewMode[] = ["overview", "follow", "manual"];
const PANEL_WIDTH = 360;
const GAP = 12;

export function ViewModeControl() {
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  const panelVisible = useViewStore((s) => s.panelVisible);
  // Push the controls left of the side panel when it's visible so they
  // don't render under (or over) the frosted-glass overlay.
  const right = panelVisible ? PANEL_WIDTH + GAP : 12;
  return (
    <div style={{ position: "absolute", top: 12, right, zIndex: 1000 }}>
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
