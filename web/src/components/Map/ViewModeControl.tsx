import { Button, ButtonGroup } from '@heroui/react';
import { useViewStore, type ViewMode } from '../../store/view.js';

const MODES: ViewMode[] = ['overview', 'follow', 'manual'];

export function ViewModeControl() {
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000 }}>
      <ButtonGroup size="sm">
        {MODES.map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'primary' : 'ghost'}
            onPress={() => setMode(m)}
            className="capitalize"
          >
            {m}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}
