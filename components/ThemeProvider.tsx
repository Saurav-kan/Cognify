"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

export function ThemeProvider() {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    document.documentElement.classList.remove("dark", "grey", "dim");

    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "grey") {
      document.documentElement.classList.add("grey");
    } else if (theme === "dim") {
      document.documentElement.classList.add("dim");
    }
  }, [theme]);

  return null;
}
