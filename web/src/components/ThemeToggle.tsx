import { useEffect } from "react";
import { Tabs } from "@heroui/react";
import { Sun, Moon } from "@gravity-ui/icons";
import { useThemeStore, type Theme } from "../store/theme.js";

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  // Sync the class on <html> so Tailwind dark: variants and HeroUI styles flip together.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <Tabs
      aria-label="Theme"
      variant="primary"
      selectedKey={theme}
      onSelectionChange={(key) => setTheme(key as Theme)}
    >
      <Tabs.List className="h-8 *:py-1 *:px-3 *:h-auto">
        <Tabs.Tab id="light" aria-label="Light mode">
          <Sun
            width={14}
            height={14}
            className={theme === "light" ? "text-amber-500" : ""}
          />
          <Tabs.Indicator />
        </Tabs.Tab>
        <Tabs.Tab id="dark" aria-label="Dark mode">
          <Moon
            width={14}
            height={14}
            className={theme === "dark" ? "text-blue-400" : ""}
          />
          <Tabs.Indicator />
        </Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}
