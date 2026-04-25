import { useEffect } from 'react';
import { Button } from '@heroui/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { useThemeStore } from '../store/theme.js';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  // Sync the class on <html> so Tailwind dark: variants and HeroUI styles flip together.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const icon = theme === 'dark' ? '☀' : '☾';

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button isIconOnly size="sm" variant="ghost" aria-label={label} onPress={toggle}>
          <span aria-hidden style={{ fontSize: 16 }}>{icon}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
