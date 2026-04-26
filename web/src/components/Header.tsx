import {
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@heroui/react";
import { Gear } from "@gravity-ui/icons";
import { ConnectionStatus } from "./ConnectionStatus.js";
import { PanelToggle } from "./PanelToggle.js";
import { ThemeToggle } from "./ThemeToggle.js";

type Props = {
  onOpenSettings: () => void;
};

export function Header({ onOpenSettings }: Props) {
  return (
    <header className="flex items-center justify-between px-3 h-10 border-b border-border bg-bg-elevated">
      <strong className="text-md text-fg">Flight Follower</strong>
      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <Separator orientation="vertical" className="h-6 self-center" />
        <ThemeToggle />
        <PanelToggle />
        <Tooltip>
          <TooltipTrigger>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              aria-label="Settings"
              onPress={onOpenSettings}
            >
              <Gear width={16} height={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
