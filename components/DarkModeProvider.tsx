"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

/**
 * Global dark mode provider that applies dark mode class to document root
 * This ensures dark mode works across all pages, not just the reader page
 */
export function DarkModeProvider() {
  const darkMode = useAppStore((state) => state.darkMode);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  return null;
}
