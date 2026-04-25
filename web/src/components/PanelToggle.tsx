import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { useViewStore } from '../store/view.js';

type Props = {
  /** When true, renders the chevron pointing inward (to collapse the panel). */
  collapseDirection: 'right' | 'left';
};

export function PanelToggle({ collapseDirection }: Props) {
  const toggle = useViewStore((s) => s.togglePanel);
  const visible = useViewStore((s) => s.panelVisible);
  const label = visible ? 'Hide side panel' : 'Show side panel';
  const arrow = collapseDirection === 'right' ? '◀' : '▶';
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          onPress={toggle}
          className="bg-bg-elevated/70 backdrop-blur"
        >
          <span aria-hidden>{arrow}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
