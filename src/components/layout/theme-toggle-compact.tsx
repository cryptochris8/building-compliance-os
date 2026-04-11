"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const themes = ["system", "light", "dark"] as const;
type Theme = (typeof themes)[number];

const themeIcons: Record<Theme, React.ReactNode> = {
  system: <Monitor className="h-4 w-4" />,
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
};

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggleCompact() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function cycleTheme() {
    const current = (theme ?? "system") as Theme;
    const currentIndex = themes.indexOf(current);
    const next = themes[(currentIndex + 1) % themes.length];
    setTheme(next);
  }

  const current = (theme ?? "system") as Theme;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={mounted ? `Current theme: ${current}. Click to cycle themes.` : "Cycle theme"}
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      {mounted ? themeIcons[current] : <Monitor className="h-4 w-4" />}
    </Button>
  );
}
