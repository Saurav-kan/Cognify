"use client";

import { useMemo } from "react";
import { transformToBionic } from "@/lib/bionic-algo";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

interface BionicTextProps {
  text: string;
  enabled: boolean;
  className?: string;
  fontFamily?: "inter" | "opendyslexic";
}

/**
 * Splits text into trackable sections (paragraphs or sentences)
 */
function splitIntoSections(text: string): string[] {
  // First try splitting by double newlines (paragraphs)
  let sections = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  
  // If no paragraphs found, split by single newlines
  if (sections.length <= 1) {
    sections = text.split(/\n/).filter((p) => p.trim().length > 0);
  }
  
  // If still only one section, split by sentences (periods, exclamation, question marks)
  if (sections.length <= 1) {
    sections = text.split(/([.!?]+\s+)/).filter((p) => p.trim().length > 0);
    // Group sentences back together (every 3-5 sentences per section)
    const grouped: string[] = [];
    let current = "";
    for (let i = 0; i < sections.length; i++) {
      current += sections[i];
      if ((i + 1) % 4 === 0 || i === sections.length - 1) {
        if (current.trim()) {
          grouped.push(current.trim());
          current = "";
        }
      }
    }
    sections = grouped.length > 0 ? grouped : sections;
  }
  
  return sections;
}

export function BionicText({ text, enabled, className, fontFamily = "inter" }: BionicTextProps) {
  // Use selector to ensure re-render when readSections changes
  const readSections = useAppStore((state) => state.readSections);
  const lineHeight = useAppStore((state) => state.lineHeight);
  const letterSpacing = useAppStore((state) => state.letterSpacing);
  const fontSize = useAppStore((state) => state.fontSize);
  const bionicStrength = useAppStore((state) => state.bionicStrength);
  
  const sections = useMemo(() => {
    if (!text) return [];
    return splitIntoSections(text);
  }, [text]);

  const transformedSections = useMemo(() => {
    if (!enabled) return sections;
    return sections.map((section) => transformToBionic(section, bionicStrength));
  }, [sections, enabled, bionicStrength]);
  
  // Force re-render when readSections changes by using it in the dependency
  const sectionKeys = useMemo(() => {
    return Array.from(readSections).join(",");
  }, [readSections]);

  if (!text) {
    return null;
  }

  return (
    <div
      className={cn(
        "text-relaxed",
        fontFamily === "opendyslexic" && "font-dyslexic",
        className
      )}
      role="article"
      aria-label={enabled ? "Reading content with bionic reading enabled" : "Reading content"}
      style={{
        lineHeight: lineHeight,
        letterSpacing: `${letterSpacing}em`,
        fontSize: `${fontSize}px`,
      }}
    >
      {transformedSections.map((section, index) => {
        const sectionId = `section-${index}`;
        const isRead = readSections.has(sectionId);
        
        return (
          <p
            key={sectionId}
            data-section-id={sectionId}
            className={cn(
              "mb-4 transition-opacity duration-300",
              isRead && "opacity-40 text-muted-foreground" // Gray out TTS-read sections
            )}
          >
            {enabled ? (
              <span dangerouslySetInnerHTML={{ __html: section }} />
            ) : (
              section
            )}
          </p>
        );
      })}
    </div>
  );
}

