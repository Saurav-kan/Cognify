"use client";

import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Coffee, CloudMoon, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeSelector() {
  const theme = useAppStore((state: any) => state.theme);
  const setTheme = useAppStore((state: any) => state.setTheme);

  const themes = [
    { id: "light", label: "Light", icon: Sun },
    { id: "light-grey", label: "Light Grey", icon: Coffee },
    { id: "grey", label: "Grey", icon: BookOpen },
    { id: "dim", label: "Dim", icon: CloudMoon },
    { id: "dark", label: "Dark", icon: Moon },
  ] as const;

  return (
    <div className="flex items-center gap-2 p-1 bg-secondary/50 rounded-full border border-border backdrop-blur-sm">
      {themes.map((t) => {
        const Icon = t.icon;
        const isActive = theme === t.id;
        return (
          <Button
            key={t.id}
            variant="ghost"
            size="sm"
            onClick={() => setTheme(t.id)}
            className={cn(
              "h-8 w-8 rounded-full p-0 transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm scale-110"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title={`${t.label} Theme`}
            aria-label={`Switch to ${t.label} theme`}
          >
            <Icon className="h-4 w-4" />
            <span className="sr-only">{t.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
