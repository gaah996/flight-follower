import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { ConnectionStatus } from './ConnectionStatus.js';
import { ThemeToggle } from './ThemeToggle.js';

type Props = {
  onOpenSettings: () => void;
};

export function Header({ onOpenSettings }: Props) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        borderBottom: '1px solid var(--ff-border)',
        background: 'var(--ff-bg-elevated)',
        height: 40,
      }}
    >
      <strong style={{ fontSize: 14, color: 'var(--ff-fg)' }}>Flight Follower</strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ConnectionStatus />
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Settings" onPress={onOpenSettings}>
              <span aria-hidden style={{ fontSize: 16 }}>⚙</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
