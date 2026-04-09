"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const themes = ["system", "light", "dark"] as const;
type Theme = (typeof themes)[number];

const themeConfig: Record<Theme, { label: string; icon: React.ReactNode }> = {
  system: {
    label: "System theme",
    icon: <Monitor className="h-4 w-4" />,
  },
  light: {
    label: "Light theme",
    icon: <Sun className="h-4 w-4" />,
  },
  dark: {
    label: "Dark theme",
    icon: <Moon className="h-4 w-4" />,
  },
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — only render icon after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  function cycleTheme() {
    const current = (theme ?? "system") as Theme;
    const currentIndex = themes.indexOf(current);
    const next = themes[(currentIndex + 1) % themes.length];
    setTheme(next);
  }

  const current = (theme ?? "system") as Theme;
  const config = themeConfig[current];

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 px-3"
      onClick={cycleTheme}
      aria-label={`Current theme: ${current}. Click to cycle themes.`}
    >
      {mounted ? config.icon : <Monitor className="h-4 w-4" />}
      <span className="text-xs text-muted-foreground">
        {mounted ? `Theme: ${current}` : "Theme: system"}
      </span>
    </Button>
  );
}
