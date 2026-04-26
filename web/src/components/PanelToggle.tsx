import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@heroui/react";
import { LayoutSideContentRight } from "@gravity-ui/icons";
import { useViewStore } from "../store/view.js";

export function PanelToggle() {
  const toggle = useViewStore((s) => s.togglePanel);
  const visible = useViewStore((s) => s.panelVisible);
  const label = visible ? "Hide side panel" : "Show side panel";
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          isIconOnly
          size="sm"
          variant={visible ? "secondary" : "tertiary"}
          aria-label={label}
          onPress={toggle}
        >
          <LayoutSideContentRight width={16} height={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
