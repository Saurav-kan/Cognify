"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

export function ThemeProvider() {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    document.documentElement.classList.remove("dark", "light-grey", "grey", "dim");

    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "light-grey") {
      document.documentElement.classList.add("light-grey");
    } else if (theme === "dim") {
      document.documentElement.classList.add("dim");
      document.documentElement.classList.add("dark"); // Dim is also a dark theme
    } else if (theme === "grey") {
      document.documentElement.classList.add("grey");
      document.documentElement.classList.add("dark"); // Grey (formerly Sepia) is now a dark theme
    }
  }, [theme]);

  return null;
}
