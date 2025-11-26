"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { Type, AlignJustify, MoveHorizontal, ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function VisualSettings() {
  const {
    lineHeight,
    letterSpacing,
    fontSize,
    bionicEnabled,
    bionicStrength,
    setLineHeight,
    setLetterSpacing,
    setFontSize,
    setBionicStrength,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-secondary/20 rounded-lg border border-border overflow-hidden">
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between p-4 h-auto hover:bg-secondary/30"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 font-semibold text-sm text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          Visual Customization
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {isOpen && (
        <div className="space-y-6 p-4 pt-0 animate-in slide-in-from-top-2 duration-200">

      {/* Bionic Strength (only if enabled) */}
      {bionicEnabled && (
        <div className="space-y-3 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm text-primary font-medium">
              <Type className="h-4 w-4" />
              Bionic Strength
            </Label>
            <span className="text-xs text-muted-foreground">
              {bionicStrength}%
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="10"
            value={bionicStrength}
            onChange={(e) => setBionicStrength(Number(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            aria-label="Bionic Strength"
          />
        </div>
      )}

      {/* Font Size */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-sm">
            <Type className="h-4 w-4" />
            Font Size
          </Label>
          <span className="text-xs text-muted-foreground">{fontSize}px</span>
        </div>
        <input
          type="range"
          min="14"
          max="32"
          step="1"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
          aria-label="Font Size"
        />
      </div>

      {/* Line Height */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-sm">
            <AlignJustify className="h-4 w-4" />
            Line Height
          </Label>
          <span className="text-xs text-muted-foreground">{lineHeight}x</span>
        </div>
        <input
          type="range"
          min="1.2"
          max="2.5"
          step="0.1"
          value={lineHeight}
          onChange={(e) => setLineHeight(Number(e.target.value))}
          className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
          aria-label="Line Height"
        />
      </div>

      {/* Letter Spacing */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-sm">
            <MoveHorizontal className="h-4 w-4" />
            Letter Spacing
          </Label>
          <span className="text-xs text-muted-foreground">
            {letterSpacing}em
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="0.2"
          step="0.01"
          value={letterSpacing}
          onChange={(e) => setLetterSpacing(Number(e.target.value))}
          className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
          aria-label="Letter Spacing"
        />
      </div>
        </div>
      )}
    </div>
  );
}
