import { useMap } from 'react-leaflet';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { PlaneFill } from '@gravity-ui/icons';
import { useFlightStore } from '../../store/flight.js';
import { useViewStore } from '../../store/view.js';
import { panelAwareCenter } from './panelOffset.js';

export function CenterButton() {
  const map = useMap();
  const telemetry = useFlightStore((s) => s.state.telemetry);
  const panelVisible = useViewStore((s) => s.panelVisible);
  const disabled = !telemetry;

  const onCenter = () => {
    if (!telemetry) return;
    // One-shot pan — does NOT switch to follow mode (programmatic pan
    // doesn't fire dragstart, so MapController leaves the mode alone).
    // Shifted by the panel offset so the aircraft lands at the centre of
    // the visible region rather than behind the panel.
    map.panTo(panelAwareCenter(map, telemetry.position, panelVisible), { animate: true });
  };

  // Wrapper carries the frost-glass surface; the ghost Button inside
  // becomes the interactive overlay (transparent → color-default on hover),
  // matching the structural pattern used by the ViewModeControl group.
  return (
    <div
      style={{
        position: 'absolute',
        top: 82,
        left: 10,
        zIndex: 1000,
        background: 'var(--ff-bg-translucent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--ff-border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <Tooltip>
        <TooltipTrigger>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            isDisabled={disabled}
            onPress={onCenter}
            aria-label="Center on aircraft"
          >
            <PlaneFill width={14} height={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {disabled ? 'Center on aircraft (no telemetry)' : 'Center on aircraft'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
